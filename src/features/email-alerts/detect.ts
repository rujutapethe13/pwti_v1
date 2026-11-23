import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { loadClientDirectory } from "./settings";
import { evaluateRecord } from "./evaluate";
import { normalizeClientName } from "./predicate";
import {
  buildOptionLabelMap,
  FIELD_TYPES,
  resolveBoardColumns,
  type BoardColumns,
  type ColumnRow,
} from "./columns";
import type { AlertCandidate } from "./types";

/**
 * Detection: finds jobs past their deadline and invoices past the client's
 * payment term.
 *
 * ── Why this reads boards directly instead of the snapshot ───────────────────
 * client_360_daily_snapshot is the dashboards' materialized view, but two of
 * its columns cannot be relied on for alerting in every deployment: due_date
 * is only populated once the due-date detection migration is live, and
 * client_id covers only rows whose board has a resolvable client column. An
 * alert run must not silently see zero jobs because a materialized column is
 * empty, so detection reads `records` + `cell_values` per board and derives
 * everything itself. The snapshot is deliberately not used here.
 *
 * ── Column resolution ────────────────────────────────────────────────────────
 * Columns are resolved per board in this order:
 *   1. client_360_field_mappings — the Client 360 resolution (auto or manual).
 *   2. Label fallback — exact, normalized-label match against a fixed label
 *      set, accepted only when exactly one column on that board matches.
 *      Missing or ambiguous labels resolve to nothing, never to a guess.
 *
 * ── Client matching (the safety-critical rule) ───────────────────────────────
 * A job is attributed to a client by exact, case-insensitive, whitespace-
 * collapsed match of its client cell against client_360_clients.canonical_name
 * and client_360_client_aliases.alias_text. There is no fuzzy matching: an
 * unmatched name produces no alert rather than a wrong-recipient alert.
 *
 * PostgREST truncates at max-rows (1000), so every unbounded read pages.
 */

const PAGE_SIZE = 1000;
const ID_CHUNK = 200;

interface QueryResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

async function fetchAllRows<T>(
  build: (from: number, to: number) => PromiseLike<QueryResult<T>>,
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  for (;;) {
    const result = await build(from, from + PAGE_SIZE - 1);
    if (result.error) {
      throw new Error(result.error.message);
    }
    const rows = result.data ?? [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) return all;
    from += PAGE_SIZE;
  }
}

/** Fetch a table filtered by an id list, in chunks, paging each chunk. */
async function fetchByIds<T>(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  idColumn: string,
  ids: string[],
): Promise<T[]> {
  const all: T[] = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const chunk = ids.slice(i, i + ID_CHUNK);
    const rows = await fetchAllRows<T>(
      (from, to) =>
        supabase
          .from(table)
          .select(columns)
          .in(idColumn, chunk)
          .range(from, to) as unknown as PromiseLike<QueryResult<T>>,
    );
    all.push(...rows);
  }
  return all;
}

interface BoardRow {
  id: string;
  name: string;
  slug: string | null;
  workspace_id: string;
}

interface MappingRow {
  board_id: string;
  field_type: string;
  resolved_column_ref: string;
}

interface RecordRow {
  id: string;
  board_id: string;
  title: string;
  archived_at: string | null;
}

interface CellRow {
  record_id: string;
  column_id: string;
  value: unknown;
  value_text: string | null;
}

interface AliasRow {
  client_id: string;
  alias_text: string;
}

export interface DetectionResult {
  candidates: AlertCandidate[];
  /** Records skipped because their client name matched no client or alias. */
  unmatchedClientRows: number;
  /** Boards that contributed no alert because a needed column was missing. */
  boardsWithoutDueDate: number;
  /** False when payment_term_days is not applied yet — invoice alerts are off. */
  termsAvailable: boolean;
  /** Live records examined on boards that could produce an alert. */
  recordsExamined: number;
  /** Records whose client cell matched a client or alias. */
  recordsMatchedToClient: number;
  /**
   * Normalized client names claimed by more than one client. Jobs using these
   * are skipped on purpose: attributing them would risk emailing the wrong
   * client's contacts. Reported so the duplicate clients can be merged.
   */
  ambiguousClientNames: string[];
}

export async function detectAlerts(
  organizationId: string,
  today: string,
): Promise<DetectionResult> {
  const supabase = await createServiceClient();
  const empty: DetectionResult = {
    candidates: [],
    unmatchedClientRows: 0,
    boardsWithoutDueDate: 0,
    termsAvailable: false,
    recordsExamined: 0,
    recordsMatchedToClient: 0,
    ambiguousClientNames: [],
  };

  const boards = await fetchAllRows<BoardRow>((from, to) =>
    supabase
      .from("boards")
      .select("id, name, slug, workspace_id")
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .not("name", "ilike", "%practice%")
      .range(from, to),
  );
  if (boards.length === 0) return empty;

  const boardById = new Map(boards.map((b) => [b.id, b]));
  const boardIds = new Set(boards.map((b) => b.id));

  // ── Clients: ids, names, and the per-client payment term ──────────────────
  const { clients, termsAvailable } = await loadClientDirectory(organizationId);
  const aliases = await fetchAllRows<AliasRow>((from, to) =>
    supabase
      .from("client_360_client_aliases")
      .select("client_id, alias_text")
      .eq("organization_id", organizationId)
      .range(from, to),
  );

  const clientName = new Map<string, string>();
  const clientTerm = new Map<string, number | null>();
  // normalized name → client id; a name claimed by two clients is ambiguous
  // and must not attribute a job to either of them.
  const clientIdByName = new Map<string, string>();
  const ambiguousNames = new Set<string>();

  const claimName = (name: string, clientId: string) => {
    const key = normalizeClientName(name);
    if (!key) return;
    const existing = clientIdByName.get(key);
    if (existing && existing !== clientId) ambiguousNames.add(key);
    else clientIdByName.set(key, clientId);
  };

  for (const client of clients) {
    clientName.set(client.clientId, client.canonicalName || "Unknown client");
    clientTerm.set(client.clientId, client.paymentTermDays);
    claimName(client.canonicalName, client.clientId);
  }
  for (const alias of aliases) {
    if (clientName.has(alias.client_id)) claimName(alias.alias_text, alias.client_id);
  }
  for (const key of ambiguousNames) clientIdByName.delete(key);

  // ── Columns per board: mappings first, then unique-label fallback ────────
  const columns = await fetchByIds<ColumnRow>(
    supabase,
    "columns",
    "id, board_id, label, settings",
    "board_id",
    [...boardIds],
  );
  const columnsByBoard = new Map<string, ColumnRow[]>();
  for (const column of columns) {
    const list = columnsByBoard.get(column.board_id) ?? [];
    list.push(column);
    columnsByBoard.set(column.board_id, list);
  }

  const mappings = await fetchAllRows<MappingRow>((from, to) =>
    supabase
      .from("client_360_field_mappings")
      .select("board_id, field_type, resolved_column_ref")
      .eq("organization_id", organizationId)
      .in("field_type", [...FIELD_TYPES])
      .range(from, to),
  );
  const mappedByBoard = new Map<string, Map<string, string>>();
  for (const mapping of mappings) {
    if (!boardIds.has(mapping.board_id)) continue;
    const perBoard = mappedByBoard.get(mapping.board_id) ?? new Map<string, string>();
    perBoard.set(mapping.field_type, mapping.resolved_column_ref);
    mappedByBoard.set(mapping.board_id, perBoard);
  }

  const resolvedByBoard = new Map<string, BoardColumns>();
  for (const board of boards) {
    resolvedByBoard.set(
      board.id,
      resolveBoardColumns(columnsByBoard.get(board.id) ?? [], mappedByBoard.get(board.id) ?? new Map(), {
        keyPrefix: board.id,
        boardId: board.id,
      }),
    );
  }

  const boardsWithDueDate = boards.filter((b) => resolvedByBoard.get(b.id)?.due_date).length;
  const boardsWithoutDueDate = boards.length - boardsWithDueDate;

  if (process.env.ALERTS_DEBUG === "1") {
    for (const board of boards) {
      const resolved = resolvedByBoard.get(board.id) ?? {};
      const fields = Object.entries(resolved)
        .filter(([, column]) => Boolean(column))
        .map(([field, column]) => `${field}=${column?.label?.replace(/\s+/g, " ")}`);
      console.log(
        `[email-alerts][debug] board "${board.name}": ${fields.length ? fields.join(", ") : "(no alert columns resolved)"}`,
      );
    }
  }

  // ── Records on the boards that can produce an alert at all ───────────────
  // A board needs a client column (attribution) and either a due date, or an
  // invoice status plus a counted-from date. Boards that only qualify through
  // invoices still get read when no client has a term yet: the invoice branch
  // then yields nothing, but attribution health stays observable instead of
  // silently reporting zero records examined.
  const usableBoardIds = boards
    .filter((board) => {
      const resolved = resolvedByBoard.get(board.id);
      if (!resolved?.client) return false;
      if (resolved.due_date) return true;
      return Boolean(resolved.upload_date || resolved.receive_date) && Boolean(resolved.invoice_status);
    })
    .map((b) => b.id);

  let unmatchedClientRows = 0;
  if (usableBoardIds.length === 0) {
    return {
      candidates: [],
      unmatchedClientRows,
      boardsWithoutDueDate,
      termsAvailable,
      recordsExamined: 0,
      recordsMatchedToClient: 0,
      ambiguousClientNames: [...ambiguousNames],
    };
  }

  const records = await fetchByIds<RecordRow>(
    supabase,
    "records",
    "id, board_id, title, archived_at",
    "board_id",
    usableBoardIds,
  );
  const liveRecords = records.filter((r) => !r.archived_at);
  if (liveRecords.length === 0) {
    return {
      candidates: [],
      unmatchedClientRows,
      boardsWithoutDueDate,
      termsAvailable,
      recordsExamined: 0,
      recordsMatchedToClient: 0,
      ambiguousClientNames: [...ambiguousNames],
    };
  }

  // ── Cell values for every resolved column ─────────────────────────────────
  const resolvedColumnIds = new Set<string>();
  for (const resolved of resolvedByBoard.values()) {
    for (const column of Object.values(resolved)) {
      if (column) resolvedColumnIds.add(column.id);
    }
  }
  const cellsByRecord = new Map<string, CellRow[]>();
  if (resolvedColumnIds.size > 0) {
    const cells = await fetchByIds<CellRow>(
      supabase,
      "cell_values",
      "record_id, column_id, value, value_text",
      "record_id",
      liveRecords.map((r) => r.id),
    );
    const wanted = resolvedColumnIds;
    for (const cell of cells) {
      if (!wanted.has(cell.column_id)) continue;
      const list = cellsByRecord.get(cell.record_id) ?? [];
      list.push(cell);
      cellsByRecord.set(cell.record_id, list);
    }
  }

  const statusColumnIds = [...resolvedColumnIds].filter((id) => {
    for (const resolved of resolvedByBoard.values()) {
      if (resolved.job_status?.id === id || resolved.invoice_status?.id === id) return true;
    }
    return false;
  });
  const optionLabelRows: Array<{ settings: ColumnRow["settings"] }> = [];
  for (let i = 0; i < statusColumnIds.length; i += ID_CHUNK) {
    const chunk = statusColumnIds.slice(i, i + ID_CHUNK);
    const { data, error } = await supabase.from("columns").select("id, settings").in("id", chunk);
    if (error) {
      console.warn("[email-alerts] column settings lookup failed:", error.message);
      continue;
    }
    optionLabelRows.push(...((data ?? []) as Array<{ settings: ColumnRow["settings"] }>));
  }
  const optionLabels = buildOptionLabelMap(optionLabelRows);

  // ── Evaluate each record ──────────────────────────────────────────────────
  const candidates: AlertCandidate[] = [];
  let recordsMatchedToClient = 0;

  for (const record of liveRecords) {
    const board = boardById.get(record.board_id);
    const resolved = resolvedByBoard.get(record.board_id);
    if (!board || !resolved?.client) continue;

    const result = evaluateRecord({
      record: { id: record.id, board_id: record.board_id, title: record.title ?? "" },
      board,
      organizationId,
      resolved,
      cells: cellsByRecord.get(record.id) ?? [],
      clientIdByName,
      clientName,
      clientTerm,
      optionLabels,
      today,
    });

    if (result.unmatched) unmatchedClientRows++;
    if (result.matched) recordsMatchedToClient++;
    candidates.push(...result.candidates);
  }

  // Suppress alerts for jobs whose title is missing — an unnamed row cannot be
  // actioned from an email and would be a confusing alert.
  const titled = candidates.filter((c) => c.jobTitle.trim().length > 0);

  if (unmatchedClientRows > 0) {
    console.warn(
      `[email-alerts] ${unmatchedClientRows} record(s) skipped: client name matched no client or alias (org ${organizationId})`,
    );
  }

  return {
    candidates: titled,
    unmatchedClientRows,
    boardsWithoutDueDate,
    termsAvailable,
    recordsExamined: liveRecords.length,
    recordsMatchedToClient,
    ambiguousClientNames: [...ambiguousNames],
  };
}