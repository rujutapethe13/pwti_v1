import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import { getUserOrganizationId } from "@/lib/organization";
import { isClientColumn, isJobTypeColumn } from "./constants";
import { getLiveJobScope } from "./live-job-scope";

const PRACTICE_BOARD_NAME = "Practice";

const CLIENT_LIST_CACHE_TTL_MS = 60_000;

const clientListCache = new Map<string, { data: ClientListResult; expiresAt: number }>();
const inflightCompute = new Map<string, Promise<ClientListResult>>();

function normalizeClientName(name: string): string {
  return name
    .trim()
    .replace(/[’']/g, "")
    .replace(/&/g, "and")
    .replace(/[^\w\s]/g, " ")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function extractCellValueText(value: unknown, valueText: string | null): string {
  if (value !== null && value !== undefined) {
    if (typeof value === "string") return value;
    if (typeof value === "object" && value !== null) {
      const obj = value as Record<string, unknown>;
      return String(obj.label ?? obj.name ?? obj.text ?? obj.title ?? obj.value ?? "");
    }
    return String(value);
  }
  return valueText ?? "";
}

const ALIAS_GROUPS: Record<string, string[]> = {
  lotto: ["lotto"],
  safari: ["safari", "safari select", "safari-genie", "safari genie"],
  levis: ["levis", "levi's", "levis strauss & co", "levis strauss and co"],
  labbada: ["labada", "labbada"],
  bioweaves: ["bioweave", "bioweaves"],
  "nasher miles": ["nasher mile", "nasher miles"],
  "papa don't preach": ["papa don,t peach", "papa dont peach", "papa don't preach"],
};

function applyAliasGroup(normalized: string): string {
  return normalized;
}

function toTitleCase(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export interface ClientListEntry {
  id: string;
  canonicalName: string;
  displayName: string;
  aliases: string[];
  aliasCount: number;
  jobCount: number;
  boardCount: number;
  boards: Array<{ boardId: string; boardName: string; jobCount: number }>;
  status: "Lead" | "Active" | "At Risk" | "Churned";
  needsConfirmation: boolean;
}

export interface ClientListResult {
  clients: ClientListEntry[];
  totalClients: number;
  jobsWithoutClient: number;
  possibleDuplicates: Array<{
    canonicalName: string;
    similarTo: string;
    similarity: number;
  }>;
  excludedValues?: Array<{ name: string; reason: string }>;
}

export function invalidateClientListCache(): void {
  clientListCache.clear();
}

async function fetchAllActiveBoards(organizationId: string): Promise<Array<{
  id: string;
  name: string;
  workspace_id: string;
  organization_id: string;
  primaryColumn: { id: string; label: string; type: string } | null;
}>> {
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("boards")
    .select("id, name, workspace_id, organization_id, status, archived_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Failed to fetch boards for client list:", error);
    throw error;
  }

  const filtered = (data ?? [])
    .map((row) => ({
      id: String(row.id),
      name: String(row.name),
      workspace_id: String(row.workspace_id),
      organization_id: String(row.organization_id),
      primaryColumn: null as { id: string; label: string; type: string } | null,
    }));

  if (filtered.length === 0) return filtered;

  const boardIds = filtered.map((b) => b.id);
  const { data: colData, error: colError } = await supabase
    .from("columns")
    .select("id, board_id, label, type, is_primary")
    .in("board_id", boardIds)
    .is("group_id", null)
    .eq("is_primary", true);

  if (colError) {
    console.error("Failed to fetch primary columns:", colError);
    return filtered;
  }

  const primaryByBoard = new Map<string, { id: string; label: string; type: string }>();
  for (const row of (colData ?? [])) {
    if (!primaryByBoard.has(String(row.board_id))) {
      primaryByBoard.set(String(row.board_id), {
        id: String(row.id),
        label: String(row.label ?? ""),
        type: String(row.type ?? "text"),
      });
    }
  }

  return filtered.map((b) => ({
    ...b,
    primaryColumn: primaryByBoard.get(b.id) ?? null,
  }));
}

async function fetchClientColumnsForBoards(
  boardIds: string[],
  primaryByBoard?: Map<string, { id: string; label: string; type: string }>,
): Promise<Map<string, string>> {
  if (boardIds.length === 0) return new Map();

  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("columns")
    .select("id, board_id, label, type, settings")
    .in("board_id", boardIds)
    .is("group_id", null)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("Failed to fetch client columns:", error);
    throw error;
  }

  const clientColByBoard = new Map<string, string>();
  const mappings = await supabase
    .from("client_360_field_mappings")
    .select("board_id, field_type, resolved_column_ref")
    .in("board_id", boardIds)
    .eq("field_type", "client");

  if (mappings.error) {
    console.warn("Failed to fetch client field mappings:", mappings.error);
  }
  for (const row of (mappings.data ?? [])) {
    if (row.resolved_column_ref) {
      clientColByBoard.set(String(row.board_id), String(row.resolved_column_ref));
    }
  }

  for (const row of (data ?? [])) {
    if (isClientColumn({ label: String(row.label), type: String(row.type), settings: row.settings as Record<string, unknown> })) {
      if (!clientColByBoard.has(String(row.board_id))) {
        clientColByBoard.set(String(row.board_id), String(row.id));
      }
    }
  }

  // Fallback: if a board has no client-typed column but its primary column
  // label looks like a client/company field, treat the primary as the client column.
  if (primaryByBoard) {
    for (const [boardId, primary] of primaryByBoard.entries()) {
      if (clientColByBoard.has(boardId)) continue;
      const labelLower = primary.label.toLowerCase();
      const hasClientHint = [
        "client",
        "customer",
        "account",
        "company",
        "account name",
        "client name",
        "brand",
      ].some((hint) => labelLower.includes(hint));
      if (hasClientHint) {
        clientColByBoard.set(boardId, primary.id);
      }
    }
  }

  return clientColByBoard;
}

async function fetchJobTypeValuesForBoards(
  boardIds: string[],
  primaryByBoard?: Map<string, { id: string; label: string; type: string }>,
): Promise<Set<string>> {
  if (boardIds.length === 0) return new Set();

  const supabase = await createServiceClient();
  const { data: colData, error: colError } = await supabase
    .from("columns")
    .select("id, board_id, label, type, settings")
    .in("board_id", boardIds)
    .is("group_id", null)
    .order("sort_order", { ascending: true });

  if (colError) {
    console.error("Failed to fetch job type columns:", colError);
    return new Set();
  }

  const jobTypeColByBoard = new Map<string, string>();
  for (const row of (colData ?? [])) {
    if (isJobTypeColumn({ label: String(row.label), type: String(row.type), settings: row.settings as Record<string, unknown> })) {
      if (!jobTypeColByBoard.has(String(row.board_id))) {
        jobTypeColByBoard.set(String(row.board_id), String(row.id));
      }
    }
  }

  if (jobTypeColByBoard.size === 0) return new Set();

  const { data: recordsData, error: recordsError } = await supabase
    .from("records")
    .select("id, board_id")
    .in("board_id", boardIds)
    .eq("status", "active")
    .is("archived_at", null);

  if (recordsError) {
    console.error("Failed to fetch records for job type values:", recordsError);
    return new Set();
  }

  const recordIdsByBoard = new Map<string, string[]>();
  const recordIdToBoard = new Map<string, string>();
  for (const row of (recordsData ?? [])) {
    const boardId = String(row.board_id);
    if (!recordIdsByBoard.has(boardId)) recordIdsByBoard.set(boardId, []);
    recordIdsByBoard.get(boardId)!.push(String(row.id));
    recordIdToBoard.set(String(row.id), boardId);
  }

  const allRecordIds = Array.from(recordIdsByBoard.values()).flat();
  if (allRecordIds.length === 0) return new Set();

  const { data: cellsData, error: cellsError } = await supabase
    .from("cell_values")
    .select("record_id, column_id, value, value_text")
    .in("record_id", allRecordIds);

  if (cellsError) {
    console.error("Failed to fetch job type cell values:", cellsError);
    return new Set();
  }

  const values = new Set<string>();
  for (const row of (cellsData ?? [])) {
    const boardId = recordIdToBoard.get(String(row.record_id));
    if (!boardId) continue;
    const jobTypeId = jobTypeColByBoard.get(boardId);
    if (!jobTypeId || String(row.column_id) !== jobTypeId) continue;
    const text = extractCellValueText(row.value, String(row.value_text ?? "")).trim();
    if (text) values.add(normalizeClientName(text));
  }
  return values;
}

async function fetchRecordsAndCellValues(
  boardIds: string[],
  primaryByBoard?: Map<string, { id: string; label: string; type: string }>,
): Promise<Map<string, Array<{ recordId: string; title: string; clientValue: string | null }>>> {
  if (boardIds.length === 0) return new Map();

  const supabase = await createServiceClient();

  const { data: recordsData, error: recordsError } = await supabase
    .from("records")
    .select("id, board_id, title, status")
    .in("board_id", boardIds)
    .eq("status", "active")
    .is("archived_at", null);

  if (recordsError) {
    console.error("Failed to fetch records:", recordsError);
    throw recordsError;
  }

  const recordsByBoard = new Map<string, Array<{ recordId: string; title: string; clientValue: string | null }>>();
  for (const row of (recordsData ?? [])) {
    const boardId = String(row.board_id);
    if (!recordsByBoard.has(boardId)) {
      recordsByBoard.set(boardId, []);
    }
    recordsByBoard.get(boardId)!.push({
      recordId: String(row.id),
      title: String(row.title ?? "Untitled"),
      clientValue: null,
    });
  }

  const allRecordIds = (recordsData ?? []).map((r) => String(r.id));
  if (allRecordIds.length === 0) return recordsByBoard;

  const { data: cellsData, error: cellsError } = await supabase
    .from("cell_values")
    .select("record_id, column_id, value, value_text")
    .in("record_id", allRecordIds);

  if (cellsError) {
    console.error("Failed to fetch cell values:", cellsError);
    throw cellsError;
  }

  const clientColByBoard = await fetchClientColumnsForBoards(boardIds, primaryByBoard);

  const cellMap = new Map<string, Map<string, { value: unknown; valueText: string | null }>>();
  for (const row of (cellsData ?? [])) {
    const recordId = String(row.record_id);
    const columnId = String(row.column_id);
    if (!cellMap.has(recordId)) {
      cellMap.set(recordId, new Map());
    }
    cellMap.get(recordId)!.set(columnId, {
      value: row.value ?? null,
      valueText: String(row.value_text ?? ""),
    });
  }

  for (const [boardId, records] of recordsByBoard.entries()) {
    const clientColId = clientColByBoard.get(boardId);
    if (!clientColId) continue;

    for (const record of records) {
      const cells = cellMap.get(record.recordId);
      if (!cells) continue;

      const cell = cells.get(clientColId);
      if (!cell) continue;

      let clientValue: string | null = null;
      if (cell.value !== null && cell.value !== undefined) {
        if (typeof cell.value === "string") {
          clientValue = cell.value;
        } else if (typeof cell.value === "object" && cell.value !== null) {
          const obj = cell.value as Record<string, unknown>;
          clientValue = String(obj.label ?? obj.name ?? obj.text ?? obj.title ?? obj.value ?? "");
        } else {
          clientValue = String(cell.value);
        }
      } else if (cell.valueText && cell.valueText.trim()) {
        clientValue = cell.valueText.trim();
      }

      if (clientValue && clientValue.trim()) {
        record.clientValue = clientValue.trim();
      }
    }
  }

  return recordsByBoard;
}

function findSimilarCanonical(existingCanonicals: string[], candidate: string): { name: string; similarity: number } | null {
  let best: { name: string; similarity: number } | null = null;
  const candidateNorm = normalizeClientName(candidate);

  for (const existing of existingCanonicals) {
    const existingNorm = normalizeClientName(existing);

    if (candidateNorm === existingNorm) {
      return { name: existing, similarity: 1 };
    }

    if (candidateNorm.length >= 3 && existingNorm.length >= 3) {
      if (candidateNorm.startsWith(existingNorm) || existingNorm.startsWith(candidateNorm)) {
        const similarity = Math.min(candidateNorm.length, existingNorm.length) / Math.max(candidateNorm.length, existingNorm.length);
        if (!best || similarity > best.similarity) {
          best = { name: existing, similarity };
        }
      }
    }

    const dist = editDistance(candidateNorm, existingNorm);
    const maxLen = Math.max(candidateNorm.length, existingNorm.length);
    if (maxLen > 0) {
      const similarity = 1 - dist / maxLen;
      if (similarity > 0.7 && (!best || similarity > best.similarity)) {
        best = { name: existing, similarity };
      }
    }
  }

  return best;
}

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);

  for (let i = 1; i <= m; i++) {
    const curr = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[n];
}

function splitMixedClientValue(value: string, jobTypeValues: Set<string>): string {
  const norm = normalizeClientName(value);
  for (const jt of jobTypeValues) {
    if (!jt) continue;
    if (norm === jt) return value;
    if (norm.endsWith(" " + jt)) {
      const brand = norm.slice(0, norm.length - jt.length).trim();
      if (brand.length >= 2) return toTitleCase(brand);
    }
  }
  return value;
}

async function computeClientList(organizationId: string): Promise<ClientListResult> {
  const boards = await fetchAllActiveBoards(organizationId);
  const boardIds = boards.map((b) => b.id);
  const primaryByBoard = new Map(boards.filter((b) => b.primaryColumn).map((b) => [
    b.id,
    b.primaryColumn!,
  ]));
  const jobTypeValues = await fetchJobTypeValuesForBoards(boardIds, primaryByBoard);
  const liveScope = await getLiveJobScope(organizationId);
  const recordsByBoard = new Map<string, Array<{ recordId: string; title: string; clientValue: string | null }>>();
  for (const job of liveScope.jobs) {
    const records = recordsByBoard.get(job.board_id) ?? [];
    records.push({
      recordId: job.record_id,
      title: job.title,
      clientValue: job.client_display ?? job.client_raw,
    });
    recordsByBoard.set(job.board_id, records);
  }

  const clientMap = new Map<string, {
    canonicalName: string;
    displayName: string;
    aliases: Set<string>;
    id: string | null;
    jobCount: number;
    boards: Map<string, { boardId: string; boardName: string; jobCount: number }>;
    status: "Lead" | "Active" | "At Risk" | "Churned";
  }>();

  let jobsWithoutClient = 0;

  for (const board of boards) {
    const records = recordsByBoard.get(board.id) ?? [];
    for (const record of records) {
      if (record.clientValue && record.clientValue.trim()) {
        const resolvedClientValue = splitMixedClientValue(record.clientValue.trim(), jobTypeValues);
        const normalized = applyAliasGroup(normalizeClientName(resolvedClientValue));
        const existing = clientMap.get(normalized);

        if (existing) {
           existing.aliases.add(resolvedClientValue);
           existing.jobCount += 1;
          const boardEntry = existing.boards.get(board.id);
          if (boardEntry) {
            boardEntry.jobCount += 1;
          } else {
            existing.boards.set(board.id, { boardId: board.id, boardName: board.name, jobCount: 1 });
          }
        } else {
           clientMap.set(normalized, {
             canonicalName: normalized,
             displayName: toTitleCase(resolvedClientValue),
             aliases: new Set([resolvedClientValue]),
             id: null,
            jobCount: 1,
            boards: new Map([[board.id, { boardId: board.id, boardName: board.name, jobCount: 1 }]]),
            status: "Lead",
          });
        }
      } else {
        jobsWithoutClient += 1;
      }
    }
  }

  try {
    if (organizationId) {
      const supabase = await createServiceClient();
      const [{ data: registry, error: registryError }, { data: aliases, error: aliasesError }] = await Promise.all([
        supabase
          .from("client_360_clients")
          .select("id, canonical_name, needs_confirmation")
          .eq("organization_id", organizationId),
        supabase
          .from("client_360_client_aliases")
          .select("client_id, alias_text")
          .eq("organization_id", organizationId),
      ]);
      if (registryError) throw registryError;
      if (aliasesError) throw aliasesError;

      const aliasesByClient = new Map<string, string[]>();
      for (const alias of aliases ?? []) {
        const list = aliasesByClient.get(String(alias.client_id)) ?? [];
        list.push(String(alias.alias_text));
        aliasesByClient.set(String(alias.client_id), list);
      }

      for (const registryClient of registry ?? []) {
        const rawName = String(registryClient.canonical_name ?? "").trim();
        if (!rawName) continue;
        const normalized = applyAliasGroup(normalizeClientName(rawName));
        const existing = clientMap.get(normalized);
        const registryAliases = aliasesByClient.get(String(registryClient.id)) ?? [];
        if (existing) {
          existing.id ??= String(registryClient.id);
          existing.aliases.add(rawName);
          for (const alias of registryAliases) existing.aliases.add(alias);
        } else {
          clientMap.set(normalized, {
            canonicalName: normalized,
            displayName: toTitleCase(rawName),
            aliases: new Set([rawName, ...registryAliases]),
            id: String(registryClient.id),
            jobCount: 0,
            boards: new Map(),
            status: "Lead",
          });
        }
      }
    }
  } catch (error) {
    console.error("Failed to merge the client registry:", error);
    throw error;
  }

  const canonicalNames = Array.from(clientMap.values()).map((c) => c.canonicalName);
  const possibleDuplicates: ClientListResult["possibleDuplicates"] = [];

  for (const [normalized, client] of clientMap.entries()) {
    const similar = findSimilarCanonical(
      canonicalNames.filter((n) => n !== normalized),
      normalized
    );
    if (similar) {
      possibleDuplicates.push({
        canonicalName: client.displayName,
        similarTo: similar.name,
        similarity: Math.round(similar.similarity * 100),
      });
    }
  }

const isNonClientEntry = (entry: { displayName: string; canonicalName: string; id: string | null }): boolean => {
    const trimmed = entry.displayName.trim();
    if (trimmed.length < 2) return true;
    const normalized = normalizeClientName(trimmed);
    if (normalized.length < 2) return true;
    return jobTypeValues.has(normalized);
  };

   const excludedValues: Array<{ name: string; reason: string }> = [];

   const clients: ClientListEntry[] = Array.from(clientMap.entries())
      .map(([normalized, client]) => ({
        id: client.id ?? normalized,
        canonicalName: client.canonicalName,
        displayName: client.displayName,
        aliases: Array.from(client.aliases),
        aliasCount: client.aliases.size,
        jobCount: client.jobCount,
        boardCount: client.boards.size,
        boards: Array.from(client.boards.values()).sort((a, b) => b.jobCount - a.jobCount),
        status: client.status,
        needsConfirmation: client.aliases.size > 1,
      }))
      .filter((c) => {
        if (isNonClientEntry(c)) {
          const trimmed = c.displayName.trim();
          let reason = "job type";
          if (trimmed.length < 2) reason = "too short";
          else if (normalizeClientName(trimmed).length < 2) reason = "blank";
          excludedValues.push({ name: c.displayName, reason });
          return false;
        }
        return true;
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName));

    // Include clients found on the Practice board only if they also appear on a non-Practice board.
    // The Practice board is already filtered out of `boards` above, so any client whose boardCount
    // is 0 (i.e. only in the registry, never on a real board) or whose only board was Practice
    // would have been excluded by the fetch filter. We additionally drop registry-only entries
    // with zero jobCount and no boards, since those are not real board clients.
    const realClients = clients.filter((c) => c.jobCount > 0 || c.boardCount > 0);

    return {
      clients: realClients,
      totalClients: realClients.length,
      jobsWithoutClient,
      possibleDuplicates: possibleDuplicates.slice(0, 20),
      excludedValues,
    };
}

export async function getAllClientsFromBoards(): Promise<ClientListResult> {
  const organizationId = await getUserOrganizationId();
  if (!organizationId) {
    throw new Error("Unable to determine organization");
  }
  const now = Date.now();
  const cached = clientListCache.get(organizationId);
  if (cached && now < cached.expiresAt) {
    return cached.data;
  }

  let pending = inflightCompute.get(organizationId);
  if (!pending) {
    pending = computeClientList(organizationId).finally(() => {
      inflightCompute.delete(organizationId);
    });
    inflightCompute.set(organizationId, pending);
  }
  const result = await pending;
  if (result.clients.length > 0) {
    clientListCache.set(organizationId, { data: result, expiresAt: now + CLIENT_LIST_CACHE_TTL_MS });
  } else {
    clientListCache.delete(organizationId);
  }
  return result;
}

export async function searchClientsFromBoards(query: string): Promise<ClientListEntry[]> {
  const result = await getAllClientsFromBoards();
  const q = query.toLowerCase().trim();

  if (!q) return result.clients;

  return result.clients.filter((client) => {
    if (client.displayName.toLowerCase().includes(q)) return true;
    return client.aliases.some((alias) => alias.toLowerCase().includes(q));
  });
}