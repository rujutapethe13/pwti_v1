import "server-only";

import { cache } from "react";
import { createServiceClient } from "@/lib/supabase/server";

export type LiveJobStatusClass = "completed" | "pending" | "unknown";

export interface LiveJobRow {
  record_id: string;
  board_id: string;
  board_name: string;
  board_slug: string | null;
  workspace_id: string | null;
  workspace_name: string | null;
  group_id: string | null;
  group_name: string | null;
  title: string;
  client_raw: string | null;
  client_id: string | null;
  canonical_client_name: string | null;
  client_display: string | null;
  client_unmatched: boolean;
  needs_confirmation: boolean;
  batch_id: string | null;
  received_date: string | null; // YYYY-MM-DD IST
  upload_date: string | null; // YYYY-MM-DD IST (completed/uploaded)
  due_date: string | null; // YYYY-MM-DD IST
  status: string | null;
  status_class: LiveJobStatusClass;
  sku_count: number | null;
  image_count: number | null;
  assignee: string | null;
  invoice_amount_masked: string | null;
  invoice_status: string | null;
  job_type: string | null;
  received_column: { id: string; label: string } | null;
  client_column: { id: string; label: string } | null;
  upload_column: { id: string; label: string } | null;
}

export interface LiveJobScopeFilters {
  boardIds?: string[] | null;
}

export interface UnmatchedClientGroup {
  rawName: string;
  normalizedName: string;
  count: number;
  boards: Array<{ board_id: string; board_name: string }>;
  similarTo: string[];
  sampleRecordIds: string[];
}

export interface AliasConflict {
  alias_id: string | null;
  alias_text: string;
  normalized_alias: string;
  points_to_client_id: string;
  points_to_canonical: string | null;
  points_to_needs_confirmation: boolean | null;
  same_named_canonicals: Array<{ id: string; canonical_name: string; needs_confirmation: boolean }>;
}

export interface LiveJobScopeResult {
  organizationId: string;
  jobs: LiveJobRow[];
  missingReceivedDate: Array<{ record_id: string; board_id: string; board_name: string; title: string; client_display: string | null }>;
  unmatchedClients: UnmatchedClientGroup[];
  aliasConflicts: AliasConflict[];
  boards: Array<{ id: string; name: string; slug: string | null; status: string; workspace_id: string | null }>;
  boardsWithoutDueDate: Array<{ board_id: string; board_name: string }>;
  boardsWithoutUploadDate: Array<{ board_id: string; board_name: string }>;
  boardsWithoutUploadMapping: Array<{ board_id: string; board_name: string }>;
  boardsWithUploadDate: Array<{ board_id: string; board_name: string; column_label: string; source: "mapping" | "label" }>;
  todayIST: string;
  generatedAt: string;
  clientAliasMapSize: number;
  isAdminViewReady: true;
}

const PRACTICE_RE = /practice/i;
const COMPLETED_STATUS = new Set(["done", "completed", "complete", "delivered", "approved", "finished", "resolved", "closed", "uploaded"]);
const PENDING_STATUS = new Set([
  "in progress", "working on it", "active", "queued", "started", "in-progress",
  "not started", "pending", "todo", "backlog", "stuck", "blocked", "overdue",
  "review", "qa", "on hold", "waiting", "wip",
]);

const UPLOAD_LABEL_NAMES = new Set([
  "uploaded",
  "uploaded date",
  "date of upload",
  "upload date",
  "completed date",
  "completion date",
  "delivered date",
]);

function normalizeColLabel(label: string | null | undefined): string {
  return String(label ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

export function getTodayIST(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function normalizeClientKey(value: string | null | undefined): string {
  return String(value ?? "").replace(/[\u2019']/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

function normalizeDisplayClient(value: string | null | undefined): string | null {
  const s = String(value ?? "").replace(/[\u2019']/g, "'").replace(/\s+/g, " ").trim();
  return s ? s : null;
}

export function parseDateToISTDay(value: unknown, valueText: string | null | undefined): string | null {
  let raw: unknown = valueText ?? null;
  if (raw == null || raw === "") raw = value ?? null;
  if (raw == null) return null;
  let s = "";
  if (typeof raw === "string") s = raw.trim();
  else if (typeof raw === "number" || typeof raw === "boolean") s = String(raw).trim();
  else if (typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const cand = o.date ?? o.value ?? o.start ?? o.end ?? o.text ?? o.iso ?? null;
    if (typeof cand === "string") s = cand.trim();
    else if (cand != null) s = String(cand).trim();
  } else s = String(raw).trim();
  if (!s) return null;

  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
  if (m) {
    const a = Number(m[1]), b = Number(m[2]), y = Number(m[3]);
    let day = a, mon = b;
    if (a <= 12 && b > 12) { mon = a; day = b; } else { day = a; mon = b; }
    const d = new Date(Date.UTC(y, mon - 1, day));
    if (d.getUTCFullYear() !== y || d.getUTCMonth() + 1 !== mon || d.getUTCDate() !== day) return null;
    return `${y}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const dt = new Date(s);
  if (isNaN(dt.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(dt);
}

function parseNumber(value: unknown, valueText: string | null | undefined): number | null {
  const raw = valueText ?? (typeof value === "number" ? value : typeof value === "string" ? value : null);
  if (raw == null) return null;
  const cleaned = String(raw).replace(/[^0-9.\-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function extractText(value: unknown, valueText: string | null | undefined): string | null {
  if (valueText != null && String(valueText).trim()) return String(valueText).trim();
  if (value == null) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((v) => extractText(v, null)).filter(Boolean).join(", ") || null;
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    const cand = o.label ?? o.name ?? o.text ?? o.title ?? o.value ?? o.displayName ?? o.option ?? null;
    if (typeof cand === "string") return cand.trim() || null;
    if (typeof cand === "number") return String(cand);
  }
  return null;
}

function resolveStatusText(value: unknown, valueText: string | null | undefined): string | null {
  const direct = extractText(value, valueText);
  if (direct) return direct;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    const cand = o.label ?? o.name ?? o.text ?? o.value ?? null;
    if (cand != null) return String(cand).trim() || null;
  }
  return null;
}

function classifyStatus(status: string | null): LiveJobStatusClass {
  const s = (status ?? "").toLowerCase().trim();
  if (!s) return "unknown";
  if ([...COMPLETED_STATUS].some((k) => s === k || s.includes(k))) return "completed";
  if ([...PENDING_STATUS].some((k) => s === k || s.includes(k))) return "pending";
  return "unknown";
}

function maskAmount(n: number | null): string | null {
  if (n == null) return null;
  return "•••";
}

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const m = a.length, n = b.length;
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

function isSimilar(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a))) return true;
  const d = editDistance(a, b);
  const maxLen = Math.max(a.length, b.length);
  if (maxLen <= 4) return d <= 1;
  return d <= 2 || d / maxLen <= 0.34;
}

async function fetchAll<T>(fn: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>, pageSize = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fn(from, from + pageSize - 1);
    if (error) throw error;
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}

function pickField(map: Map<string, string> | undefined, ...types: string[]): string | null {
  if (!map) return null;
  for (const t of types) {
    const id = map.get(t);
    if (id) return id;
  }
  return null;
}

async function resolveLiveJobScope(organizationId: string, filters?: LiveJobScopeFilters): Promise<LiveJobScopeResult> {
  const supabase = await createServiceClient();
  const tIST = getTodayIST();

  const { data: boardsData, error: bErr } = await supabase
    .from("boards")
    .select("id,name,status,workspace_id,slug")
    .eq("organization_id", organizationId)
    .eq("status", "active");
  if (bErr) throw bErr;

  let activeBoards = (boardsData ?? []).filter((b) => !PRACTICE_RE.test(b.name ?? ""));
  if (filters?.boardIds && filters.boardIds.length > 0) {
    const allowed = new Set(filters.boardIds);
    activeBoards = activeBoards.filter((b) => allowed.has(b.id));
  }
  const boardIds = activeBoards.map((b) => b.id);

  if (boardIds.length === 0) {
    return {
      organizationId, jobs: [], missingReceivedDate: [], unmatchedClients: [], aliasConflicts: [],
      boards: [], boardsWithoutDueDate: [], boardsWithoutUploadDate: [], boardsWithoutUploadMapping: [], boardsWithUploadDate: [],
      todayIST: tIST, generatedAt: new Date().toISOString(),
      clientAliasMapSize: 0, isAdminViewReady: true,
    };
  }

  const [mRes, cRes, aRes, clRes, wRes, gRes] = await Promise.all([
    supabase.from("client_360_field_mappings").select("board_id,field_type,resolved_column_ref").eq("organization_id", organizationId).in("board_id", boardIds),
    supabase.from("columns").select("id,board_id,label,type").eq("organization_id", organizationId).in("board_id", boardIds),
    supabase.from("client_360_client_aliases").select("id,client_id,alias_text").eq("organization_id", organizationId),
    supabase.from("client_360_clients").select("id,canonical_name,needs_confirmation,merged_into_client_id").eq("organization_id", organizationId),
    supabase.from("workspaces").select("id,name").eq("organization_id", organizationId),
    supabase.from("groups").select("id,name,board_id").eq("organization_id", organizationId).in("board_id", boardIds),
  ]);
  // Tolerate environments where merged_into_client_id column does not exist yet.
  let clientsData = clRes.data as any[] | null;
  let clErr = clRes.error;
  if (clErr && /merged_into_client_id/i.test(String((clErr as any).message ?? clErr))) {
    const fallback = await supabase.from("client_360_clients").select("id,canonical_name,needs_confirmation").eq("organization_id", organizationId);
    clientsData = fallback.data as any[] | null;
    clErr = fallback.error;
  }
  const mappings = mRes.data;
  const columns = cRes.data;
  const aliases = aRes.data;
  const workspaces = wRes.data;
  const groups = gRes.data;
  if (mRes.error) throw mRes.error;
  if (cRes.error) throw cRes.error;
  if (aRes.error) throw aRes.error;
  if (clErr) throw clErr;

  const workspaceNameById = new Map((workspaces ?? []).map((w: any) => [String(w.id), String(w.name ?? "")]));
  const groupNameById = new Map((groups ?? []).map((g: any) => [String(g.id), String(g.name ?? "")]));
  const colById = new Map((columns ?? []).map((c: any) => [String(c.id), c]));
  const mapsByBoard = new Map<string, Map<string, string>>();
  for (const m of mappings ?? []) {
    if (!mapsByBoard.has(m.board_id)) mapsByBoard.set(m.board_id, new Map());
    mapsByBoard.get(m.board_id)!.set(m.field_type, m.resolved_column_ref);
  }

  const allClients = (clientsData ?? []) as any[];
  const activeClients = allClients.filter((c) => c.merged_into_client_id == null);
  const clientById = new Map(activeClients.map((c: any) => [String(c.id), c]));
  const canonicalByNorm = new Map<string, Array<{ id: string; canonical_name: string; needs_confirmation: boolean }>>();
  for (const c of activeClients) {
    const key = normalizeClientKey(c.canonical_name);
    if (!key) continue;
    const list = canonicalByNorm.get(key) ?? [];
    list.push({ id: String(c.id), canonical_name: String(c.canonical_name ?? ""), needs_confirmation: !!c.needs_confirmation });
    canonicalByNorm.set(key, list);
  }

  // Alias table wins: resolve client by alias row. Keep resolution deterministic when
  // duplicate normalized alias texts exist by preferring the lexicographically smallest
  // alias id, then smallest client id.
  const sortedAliases = [...(aliases ?? [])].sort((a: any, b: any) => {
    const ak = normalizeClientKey(a.alias_text).localeCompare(normalizeClientKey(b.alias_text));
    if (ak !== 0) return ak;
    const ai = String(a.id ?? "").localeCompare(String(b.id ?? ""));
    if (ai !== 0) return ai;
    return String(a.client_id ?? "").localeCompare(String(b.client_id ?? ""));
  });
  const aliasToClient = new Map<string, { client_id: string; canonical_name: string; needs_confirmation: boolean }>();
  for (const a of sortedAliases) {
    const c = clientById.get(String(a.client_id));
    if (!c) continue; // skip aliases pointing to retired/missing clients
    const key = normalizeClientKey(a.alias_text);
    if (!key) continue;
    if (!aliasToClient.has(key)) {
      aliasToClient.set(key, {
        client_id: String(a.client_id),
        canonical_name: String(c.canonical_name ?? a.alias_text),
        needs_confirmation: !!c.needs_confirmation,
      });
    }
  }

  const aliasConflicts: AliasConflict[] = [];
  const seenConflictAlias = new Set<string>();
  for (const a of sortedAliases) {
    const ak = normalizeClientKey(a.alias_text);
    if (!ak) continue;
    const pointsTo = clientById.get(String(a.client_id));
    if (!pointsTo) continue;
    const sameNamed = (canonicalByNorm.get(ak) ?? []).filter((c) => c.id !== String(a.client_id));
    if (sameNamed.length === 0) continue;
    const dedupeKey = `${String(a.id ?? ak)}:${String(a.client_id)}`;
    if (seenConflictAlias.has(dedupeKey)) continue;
    seenConflictAlias.add(dedupeKey);
    aliasConflicts.push({
      alias_id: a.id ? String(a.id) : null,
      alias_text: String(a.alias_text ?? ""),
      normalized_alias: ak,
      points_to_client_id: String(a.client_id),
      points_to_canonical: String(pointsTo.canonical_name ?? ""),
      points_to_needs_confirmation: !!pointsTo.needs_confirmation,
      same_named_canonicals: sameNamed,
    });
  }
  aliasConflicts.sort((a, b) => a.normalized_alias.localeCompare(b.normalized_alias) || a.alias_text.localeCompare(b.alias_text));

  const canonicalEntries = activeClients.map((c: any) => ({ id: String(c.id), name: String(c.canonical_name ?? ""), key: normalizeClientKey(c.canonical_name) })).filter((c: any) => c.key);

  const records = await fetchAll<any>((from, to) =>
    supabase
      .from("records")
      .select("id,board_id,workspace_id,group_id,title,status,archived_at")
      .eq("organization_id", organizationId)
      .in("board_id", boardIds)
      .eq("status", "active")
      .is("archived_at", null)
      .range(from, to),
  );

  const recordsByBoard = new Map<string, any[]>();
  for (const r of records) {
    if (!recordsByBoard.has(r.board_id)) recordsByBoard.set(r.board_id, []);
    recordsByBoard.get(r.board_id)!.push(r);
  }

  const jobs: LiveJobRow[] = [];
  const missingReceivedDate: LiveJobScopeResult["missingReceivedDate"] = [];
  const unmatchedAgg = new Map<string, { rawName: string; normalizedName: string; count: number; boards: Map<string, string>; sampleRecordIds: string[] }>();
  const boardsWithoutDueDate: Array<{ board_id: string; board_name: string }> = [];
  const boardsWithoutUploadDate: Array<{ board_id: string; board_name: string }> = [];
  const boardsWithoutUploadMapping: Array<{ board_id: string; board_name: string }> = [];
  const boardsWithUploadDate: Array<{ board_id: string; board_name: string; column_label: string; source: "mapping" | "label" }> = [];

  for (const board of activeBoards) {
    const bm = mapsByBoard.get(board.id);
    if (!bm || !bm.get("due_date")) {
      boardsWithoutDueDate.push({ board_id: board.id, board_name: board.name });
    }

    const mappedUploadCol = pickField(bm, "upload_date", "completed_date");
    if (!mappedUploadCol) {
      boardsWithoutUploadMapping.push({ board_id: board.id, board_name: board.name });
    }

    const recs = recordsByBoard.get(board.id) ?? [];
    const recIds = recs.map((r) => r.id);

    // Reuse current Overview upload/completion column resolution: mapping wins,
    // else pick a label-matched upload/completed column (by populated count,
    // then stable label order) so numbers do not jump when mapping lands.
    let effectiveUploadCol = mappedUploadCol;
    let effectiveUploadSource: "mapping" | "label" | null = mappedUploadCol ? "mapping" : null;
    if (!effectiveUploadCol) {
      const boardCols = (columns ?? [])
        .filter((c: any) => String(c.board_id) === board.id && UPLOAD_LABEL_NAMES.has(normalizeColLabel(c.label)))
        .sort((a: any, b: any) => normalizeColLabel(a.label).localeCompare(normalizeColLabel(b.label)) || String(a.id).localeCompare(String(b.id)));
      if (boardCols.length > 0 && recIds.length > 0) {
        const colIds = boardCols.map((c: any) => String(c.id));
        const counts = new Map<string, number>();
        for (let i = 0; i < recIds.length; i += 80) {
          const chunk = recIds.slice(i, i + 80);
          const { data: cvCount, error: cvCountErr } = await supabase
            .from("cell_values")
            .select("record_id,column_id,value,value_text")
            .eq("board_id", board.id)
            .in("record_id", chunk)
            .in("column_id", colIds);
          if (cvCountErr) throw cvCountErr;
          for (const row of cvCount ?? []) {
            const hasVal = (row.value !== null && row.value !== undefined && row.value !== "") || (row.value_text != null && String(row.value_text).trim() !== "");
            if (hasVal) counts.set(String(row.column_id), (counts.get(String(row.column_id)) ?? 0) + 1);
          }
        }
        boardCols.sort((a: any, b: any) => {
          const da = counts.get(String(a.id)) ?? 0;
          const db = counts.get(String(b.id)) ?? 0;
          if (db !== da) return db - da;
          return normalizeColLabel(a.label).localeCompare(normalizeColLabel(b.label)) || String(a.id).localeCompare(String(b.id));
        });
        effectiveUploadCol = String(boardCols[0].id);
        effectiveUploadSource = "label";
      }
    }

    const hasEffectiveUpload = !!effectiveUploadCol;
    if (hasEffectiveUpload) {
      boardsWithUploadDate.push({
        board_id: board.id,
        board_name: board.name,
        column_label: String(colById.get(effectiveUploadCol!)?.label ?? effectiveUploadCol),
        source: effectiveUploadSource ?? "mapping",
      });
    } else {
      boardsWithoutUploadDate.push({ board_id: board.id, board_name: board.name });
    }

    if (recs.length === 0) continue;

    const usedColIds = [...new Set([...(bm ? [...bm.values()] : []), effectiveUploadCol].filter(Boolean) as string[])];
    const cellsByRecord = new Map<string, Map<string, any>>();

    if (usedColIds.length > 0) {
      for (let i = 0; i < recIds.length; i += 50) {
        const chunk = recIds.slice(i, i + 50);
        const { data: cv, error: cvErr } = await supabase
          .from("cell_values")
          .select("record_id,column_id,value,value_text")
          .eq("board_id", board.id)
          .in("record_id", chunk)
          .in("column_id", usedColIds);
        if (cvErr) throw cvErr;
        for (const row of cv ?? []) {
          if (!cellsByRecord.has(row.record_id)) cellsByRecord.set(row.record_id, new Map());
          cellsByRecord.get(row.record_id)!.set(String(row.column_id), row);
        }
      }
    }

    const clientCol = pickField(bm, "client");
    const recvCol = pickField(bm, "receive_date", "job_date");
    const uploadCol = effectiveUploadCol;
    const dueCol = pickField(bm, "due_date");
    const statusCol = pickField(bm, "job_status", "status");
    const batchCol = pickField(bm, "batch_job_id");
    const skuCol = pickField(bm, "sku_count", "volume");
    const imgCol = pickField(bm, "image_count");
    const assigneeCol = pickField(bm, "assignee_owner", "assignee");
    const invAmtCol = pickField(bm, "invoice_amount");
    const invStatusCol = pickField(bm, "invoice_status");
    const jobTypeCol = pickField(bm, "job_type");
    const colMeta = (id: string | null) => (id ? { id, label: String(colById.get(id)?.label ?? id) } : null);

    for (const r of recs) {
      const byCol = cellsByRecord.get(r.id) ?? new Map<string, any>();
      const cell = (id: string | null) => (id ? byCol.get(id) : null);
      const clientCell = cell(clientCol);
      const recvCell = cell(recvCol);
      const uploadCell = cell(uploadCol);
      const dueCell = cell(dueCol);
      const statusCell = cell(statusCol);

      const clientRaw = normalizeDisplayClient(extractText(clientCell?.value, clientCell?.value_text));
      const clientKey = normalizeClientKey(clientRaw);

      let client_id: string | null = null;
      let canonical_client_name: string | null = null;
      let client_unmatched = false;
      let needs_confirmation = false;

      if (clientKey) {
        const match = aliasToClient.get(clientKey);
        if (match) {
          client_id = match.client_id;
          canonical_client_name = match.canonical_name;
          needs_confirmation = match.needs_confirmation;
        } else {
          client_unmatched = true;
          const agg = unmatchedAgg.get(clientKey) ?? { rawName: clientRaw!, normalizedName: clientKey, count: 0, boards: new Map<string, string>(), sampleRecordIds: [] as string[] };
          agg.count += 1;
          agg.boards.set(board.id, board.name);
          if (agg.sampleRecordIds.length < 20) agg.sampleRecordIds.push(String(r.id));
          unmatchedAgg.set(clientKey, agg);
        }
      }

      const received_date = parseDateToISTDay(recvCell?.value, recvCell?.value_text);
      const title = String(r.title ?? "Untitled");
      const client_display = canonical_client_name ?? clientRaw;
      if (!received_date) {
        missingReceivedDate.push({ record_id: String(r.id), board_id: board.id, board_name: board.name, title, client_display });
      }

      const status = resolveStatusText(statusCell?.value, statusCell?.value_text);
      const invAmt = parseNumber(cell(invAmtCol)?.value, cell(invAmtCol)?.value_text);
      const groupNameRaw = r.group_id ? (groupNameById.get(String(r.group_id)) ?? null) : null;

      jobs.push({
        record_id: String(r.id),
        board_id: String(board.id),
        board_name: String(board.name),
        board_slug: (board as any).slug ?? null,
        workspace_id: r.workspace_id ? String(r.workspace_id) : null,
        workspace_name: r.workspace_id ? (workspaceNameById.get(String(r.workspace_id)) ?? null) : null,
        group_id: r.group_id ? String(r.group_id) : null,
        group_name: groupNameRaw,
        title,
        client_raw: clientRaw,
        client_id,
        canonical_client_name,
        client_display,
        client_unmatched,
        needs_confirmation,
        batch_id: extractText(cell(batchCol)?.value, cell(batchCol)?.value_text),
        received_date,
        upload_date: parseDateToISTDay(uploadCell?.value, uploadCell?.value_text),
        due_date: parseDateToISTDay(dueCell?.value, dueCell?.value_text),
        status,
        status_class: classifyStatus(status),
        sku_count: parseNumber(cell(skuCol)?.value, cell(skuCol)?.value_text),
        image_count: parseNumber(cell(imgCol)?.value, cell(imgCol)?.value_text),
        assignee: extractText(cell(assigneeCol)?.value, cell(assigneeCol)?.value_text),
        invoice_amount_masked: maskAmount(invAmt),
        invoice_status: extractText(cell(invStatusCol)?.value, cell(invStatusCol)?.value_text),
        job_type: extractText(cell(jobTypeCol)?.value, cell(jobTypeCol)?.value_text),
        received_column: colMeta(recvCol),
        client_column: colMeta(clientCol),
        upload_column: colMeta(uploadCol),
      });
    }
  }

  const unmatchedClients = [...unmatchedAgg.values()]
    .map((u) => {
      const similarTo = canonicalEntries
        .filter((c) => isSimilar(u.normalizedName, c.key))
        .slice(0, 5)
        .map((c) => c.name);
      return {
        rawName: u.rawName,
        normalizedName: u.normalizedName,
        count: u.count,
        boards: [...u.boards.entries()].map(([board_id, board_name]) => ({ board_id, board_name })).sort((a, b) => a.board_name.localeCompare(b.board_name)),
        similarTo: [...new Set(similarTo)],
        sampleRecordIds: u.sampleRecordIds,
      };
    })
    .sort((a, b) => b.count - a.count || a.rawName.localeCompare(b.rawName));

  return {
    organizationId,
    jobs,
    missingReceivedDate,
    unmatchedClients,
    aliasConflicts,
    boards: activeBoards.map((b: any) => ({ id: b.id, name: b.name, slug: b.slug ?? null, status: b.status, workspace_id: b.workspace_id ?? null })),
    boardsWithoutDueDate,
    boardsWithoutUploadDate,
    boardsWithoutUploadMapping,
    boardsWithUploadDate,
    todayIST: tIST,
    generatedAt: new Date().toISOString(),
    clientAliasMapSize: aliasToClient.size,
    isAdminViewReady: true,
  };
}

export const getLiveJobScope = cache(async (organizationId: string, filters?: LiveJobScopeFilters) => {
  return resolveLiveJobScope(organizationId, filters);
});

export function isCompletedUploaded(job: Pick<LiveJobRow, "upload_date">): boolean {
  return !!job.upload_date;
}

export function isJobReceivedInRange(job: Pick<LiveJobRow, "received_date">, from: string, to: string): boolean {
  return !!job.received_date && job.received_date >= from && job.received_date <= to;
}

export function isJobUploadedInRange(job: Pick<LiveJobRow, "upload_date">, from: string, to: string): boolean {
  return !!job.upload_date && job.upload_date >= from && job.upload_date <= to;
}

/**
 * Shared selector used by the Completed (Uploaded) KPI card, the drill-down
 * table, its CSV export, and the prior-period comparison.
 *
 * Returns unique jobs (deduped by record_id) that are in a completed status
 * AND have an upload date inside [from, to]. Both ends of the window are
 * inclusive. Status is the source of truth for "completed"; an upload date
 * alone never counts.
 */
export function completedUploadedJobs(
  jobs: LiveJobRow[],
  from: string,
  to: string,
): LiveJobRow[] {
  const seen = new Set<string>();
  const out: LiveJobRow[] = [];
  for (const j of jobs) {
    if (j.status_class !== "completed") continue;
    if (!isJobUploadedInRange(j, from, to)) continue;
    if (seen.has(j.record_id)) continue;
    seen.add(j.record_id);
    out.push(j);
  }
  return out;
}

export function effectiveClientLabel(job: Pick<LiveJobRow, "canonical_client_name" | "client_raw">): string | null {
  return job.canonical_client_name ?? job.client_raw ?? null;
}

