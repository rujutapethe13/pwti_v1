import "server-only";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getUserOrganizationId } from "@/lib/organization";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActivityData, ActivityMode, Client360DailyActivity } from "./types";

const HISTORICAL_DAYS = 60;

export async function fetchActivity(options: {
  selectedDate?: string;
  mode?: ActivityMode;
  onlyMine?: boolean;
} = {}): Promise<ActivityData> {
  const selectedDate = options.selectedDate ?? formatDate(getBusinessTimezoneToday());
  const mode = options.mode ?? "received";
  const supabase = await createServiceClient();
  const sessionClient = await createClient();
  const { data: { user } } = await sessionClient.auth.getUser();
  const { data, error } = await supabase.rpc("get_activity_items", {
    p_mode: mode,
    p_day: selectedDate,
    p_only_mine: options.onlyMine ?? false,
    p_user_id: user?.id ?? null,
  });
  if (error) {
    console.error("Failed to fetch activity items:", error);
    throw new Error(error.message);
  }
  const rows = (data ?? []) as ActivityData["items"];
  const today = formatDate(getBusinessTimezoneToday());
  const counts = new Map<string, number>();
  for (const row of rows) {
    const day = mode === "due" ? row.due_date : row.received_at.slice(0, 10);
    if (day) counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  const end = new Date(selectedDate + "T12:00:00");
  const start = new Date(end);
  start.setDate(start.getDate() - HISTORICAL_DAYS + 1);
  const daily_breakdown = Array.from({ length: HISTORICAL_DAYS }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const key = formatDate(date);
    return { date: key, total: counts.get(key) ?? 0 };
  });
  return {
    selectedDate,
    today,
    mode,
    items: rows,
    daily_breakdown,
    boards_without_due_date: Array.from(new Set(rows.filter((r) => !r.due_column).map((r) => r.board_name))),
    finished_statuses: Array.from(new Set(rows.filter((r) => r.is_finished && r.status).map((r) => r.status as string))),
  };
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getBusinessTimezoneToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * Parse a date string that may be in any of several formats:
 *   - ISO 8601:  "2026-09-23"  (primary, used by Supabase date columns)
 *   - DD-MM-YYYY: "23-09-2026"  (board cell values displayed in this format)
 *   - DD/MM/YYYY: "23/09/2026"  (alternative board cell format)
 *   - MM/DD/YYYY: "09/23/2026"  (US-style with slashes)
 *   - ISO timestamp: "2026-09-23T10:00:00Z"
 *
 * Returns null if the string cannot be parsed.
 */
export function parseDateInput(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;

  const trimmed = String(dateStr).trim();

  // 1. ISO 8601 date or timestamp (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SSZ)
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
  }

  // 2. DD-MM-YYYY or MM-DD-YYYY (with dashes)
  // Try DD-MM-YYYY first (day-first, which is the format used by the board
  // cell values per the bug report), then fall back to MM-DD-YYYY.
  const dashMatch = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (dashMatch) {
    const d = Number(dashMatch[1]);
    const m = Number(dashMatch[2]);
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
      return new Date(Number(dashMatch[3]), m - 1, d);
    }
  }

  // 3. DD/MM/YYYY or MM/DD/YYYY (with slashes)
  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slashMatch) {
    const d = Number(slashMatch[1]);
    const m = Number(slashMatch[2]);
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
      return new Date(Number(slashMatch[3]), m - 1, d);
    }
  }

  // 4. DD.MM.YYYY (with dots)
  const dotMatch = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (dotMatch) {
    const d = Number(dotMatch[1]);
    const m = Number(dotMatch[2]);
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
      return new Date(Number(dotMatch[3]), m - 1, d);
    }
  }

  // 5. Fallback: let JS try to parse it
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) return parsed;

  return null;
}

// Backwards-compatible alias for callers that pass a known ISO string
function parseISODate(dateStr: string): Date {
  const parsed = parseDateInput(dateStr);
  if (parsed) return parsed;
  // An unparseable date is an input error, not "the epoch". This used to return
  // new Date(0), which turned into a 1969-1970 window and a plausible-looking
  // all-zero activity breakdown — indistinguishable from a studio that genuinely
  // did no work. Fail loudly instead.
  throw new Error(`Invalid date: ${JSON.stringify(dateStr)}`);
}

/**
 * The in-flight refresh, shared by every caller in this process.
 *
 * A single Overview page load starts its sections in parallel — stat cards,
 * volume trend, volume breakdown and the three daily lists — and each of them
 * calls `checkAndRefreshSnapshotIfNeeded`. Without this, all of them read
 * `needs_refresh` before the first refresh clears it, and the same full
 * organization rebuild runs once per request.
 */
let inFlightRefresh: Promise<void> | null = null;

/**
 * Check the lightweight `client_360_refresh_state` dirty flag and, if set,
 * call `refresh_client_360_snapshot()` to bring the materialized snapshot
 * up-to-date.  The DB trigger `_client_360_mark_dirty()` sets this flag
 * whenever `records` or `cell_values` are inserted/updated.  This keeps the
 * snapshot fresh without re-processing every fetch.
 *
 * Concurrent callers share one refresh rather than each starting their own.
 */
export async function checkAndRefreshSnapshotIfNeeded(
  supabase: SupabaseClient,
): Promise<void> {
  if (!inFlightRefresh) {
    inFlightRefresh = runSnapshotRefresh(supabase).finally(() => {
      inFlightRefresh = null;
    });
  }
  await inFlightRefresh;
}

async function runSnapshotRefresh(supabase: SupabaseClient): Promise<void> {
  try {
    const { data: state } = await supabase
      .from("client_360_refresh_state")
      .select("needs_refresh")
      .eq("id", true)
      .maybeSingle();

    console.log("[TEMP-LOG] Snapshot refresh state:", JSON.stringify(state));
    if (state?.needs_refresh) {
      console.warn("[Client 360] Snapshot is stale — refreshing...");
      const { data: refreshData, error: refreshError } = await supabase.rpc("refresh_client_360_snapshot");
      console.log("[TEMP-LOG] refresh_client_360_snapshot result:", JSON.stringify(refreshData), "error:", refreshError?.message ?? "none");

      await supabase
        .from("client_360_refresh_state")
        .update({ needs_refresh: false, updated_at: new Date().toISOString() })
        .eq("id", true);
    }
  } catch (err) {
    // Refresh is best-effort: if it fails, we still want to serve whatever
    // data is currently in the snapshot rather than blocking the request.
    console.warn("[Client 360] Snapshot refresh check failed:", err);
  }
}

/**
 * Aggregate daily activity for a selected date, optionally scoped to a single
 * client.  When `clientId` is omitted the data is aggregated across ALL
 * clients in the organization (the global Daily Activity dashboard).
 *
 * When `organizationId` is supplied it is used directly (the caller — e.g. the
 * API route — has already resolved it from the user's session). Otherwise the
 * service resolves it via `getUserOrganizationId()`. Runs server-side with a
 * service client so RLS is bypassed for the data query.
 */
export async function fetchClient360DailyActivity(
  options: {
    selectedDate?: string;
    clientId?: string;
    organizationId?: string;
  } = {},
): Promise<Client360DailyActivity> {
  const {
    selectedDate: selectedDateParam,
    clientId: clientIdParam,
    organizationId: providedOrgId,
  } = options;

  const today = getBusinessTimezoneToday();
  const endDate = selectedDateParam ? parseISODate(selectedDateParam) : today;
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - HISTORICAL_DAYS + 1);

  const startStr = formatDate(startDate);
  const endStr = formatDate(endDate);

  const organizationId = providedOrgId ?? (await getUserOrganizationId());
  if (!organizationId) {
    throw new Error("Unable to determine organization. Please ensure you are a member of a workspace.");
  }

  const supabase = await createServiceClient();

  // Ensure the materialized snapshot is fresh before querying it.
  await checkAndRefreshSnapshotIfNeeded(supabase);

  let query = supabase
    .from("client_360_daily_snapshot")
    .select("job_date, client_id, volume, board_id, record_id")
    .eq("organization_id", organizationId)
    .gte("job_date", startStr)
    .lte("job_date", endStr);

  if (clientIdParam) {
    query = query.eq("client_id", clientIdParam);
  }

  const { data: snapshots, error } = await query;

  if (error) {
    console.error("Failed to fetch client_360_daily_snapshot:", error);
    throw new Error(`Failed to fetch daily activity data: ${(error as { message?: string }).message || String(error)}`);
  }

  if (!snapshots || snapshots.length === 0) {
    const dailyBreakdown: Array<{ date: string; total: number }> = [];
    const current = new Date(startDate);
    while (current <= endDate) {
      dailyBreakdown.push({ date: formatDate(current), total: 0 });
      current.setDate(current.getDate() + 1);
    }
    return {
      selectedDate: endStr,
      start: startStr,
      end: endStr,
      total_jobs: 0,
      clients_active: 0,
      boards_touched: 0,
      busiest_client: null,
      clients: [],
      daily_breakdown: dailyBreakdown,
      unmapped_boards: 0,
    };
  }

  const dailyVolumeMap = new Map<string, number>();
  const dailyRowSetMap = new Map<string, Set<string>>();
  const dailyClientMap = new Map<string, Map<string, number>>();
  const dailyClientRowMap = new Map<string, Map<string, number>>();
  const dailyBoardMap = new Map<string, Set<string>>();

  for (const s of snapshots) {
    const parsedDate = parseDateInput(s.job_date as string | null);
    if (!parsedDate) continue;
    const dateStr = formatDate(parsedDate);
    const vol = (s.volume as number) || 1;
    const recId = String(s.record_id || "");

    dailyVolumeMap.set(dateStr, (dailyVolumeMap.get(dateStr) || 0) + vol);

    if (!dailyRowSetMap.has(dateStr)) dailyRowSetMap.set(dateStr, new Set());
    if (recId) dailyRowSetMap.get(dateStr)!.add(recId);

    if (!dailyClientMap.has(dateStr)) dailyClientMap.set(dateStr, new Map());
    if (!dailyClientRowMap.has(dateStr)) dailyClientRowMap.set(dateStr, new Map());
    if (s.client_id) {
      const clientMap = dailyClientMap.get(dateStr)!;
      clientMap.set(s.client_id as string, (clientMap.get(s.client_id as string) || 0) + vol);
      const clientRowMap = dailyClientRowMap.get(dateStr)!;
      clientRowMap.set(s.client_id as string, (clientRowMap.get(s.client_id as string) || 0) + 1);
    }

    if (!dailyBoardMap.has(dateStr)) dailyBoardMap.set(dateStr, new Set());
    dailyBoardMap.get(dateStr)!.add(s.board_id as string);
  }

  const dailyBreakdown: Array<{ date: string; total: number }> = [];
  const rowDailyBreakdown: Array<{ date: string; total: number }> = [];
  const current = new Date(startDate);
  while (current <= endDate) {
    const dateStr = formatDate(current);
    dailyBreakdown.push({
      date: dateStr,
      total: dailyVolumeMap.get(dateStr) || 0,
    });
    rowDailyBreakdown.push({
      date: dateStr,
      total: dailyRowSetMap.get(dateStr)?.size || 0,
    });
    current.setDate(current.getDate() + 1);
  }

  const selectedDateStr = formatDate(endDate);
  const selectedDayVolume = dailyVolumeMap.get(selectedDateStr) || 0;
  const selectedDayRowCount = dailyRowSetMap.get(selectedDateStr)?.size || 0;
  const selectedDayClientMap = dailyClientMap.get(selectedDateStr) || new Map();
  const selectedDayClientRowMap = dailyClientRowMap.get(selectedDateStr) || new Map();
  const selectedDayBoardSet = dailyBoardMap.get(selectedDateStr) || new Set();

  const clientsActive = selectedDayClientMap.size;
  const boardsTouched = selectedDayBoardSet.size;

  const clientVolumeMap = new Map<string, { client_id: string; client_name: string; volume: number; rowCount: number }>();
  for (const [clientId, vol] of selectedDayClientMap) {
    clientVolumeMap.set(clientId, {
      client_id: clientId,
      client_name: "",
      volume: vol,
      rowCount: selectedDayClientRowMap.get(clientId) || 1,
    });
  }

  let busiestClient: { client_id: string; client_name: string; count: number } | null = null;
  let sortedClients: Array<{ client_id: string; client_name: string; count: number }> = [];
  let rowBusiestClient: { client_id: string; client_name: string; count: number } | null = null;
  let rowSortedClients: Array<{ client_id: string; client_name: string; count: number }> = [];
  if (clientVolumeMap.size > 0) {
    const clientIds = Array.from(clientVolumeMap.keys());
    const { data: clients } = await supabase
      .from("client_360_clients")
      .select("id, canonical_name")
      .in("id", clientIds);

    if (clients) {
      for (const c of clients) {
        const info = clientVolumeMap.get(c.id);
        if (info) {
          info.client_name = c.canonical_name;
        }
      }
    }

    for (const [clientId, info] of clientVolumeMap) {
      if (!info.client_name) {
        info.client_name = `Client ${clientId.slice(0, 8)}`;
      }
    }

    sortedClients = Array.from(clientVolumeMap.values())
      .sort((a, b) => b.volume - a.volume)
      .map((c) => ({
        client_id: c.client_id,
        client_name: c.client_name,
        count: c.volume,
      }));

    busiestClient = sortedClients[0] || null;

    rowSortedClients = Array.from(clientVolumeMap.values())
      .sort((a, b) => b.rowCount - a.rowCount)
      .map((c) => ({
        client_id: c.client_id,
        client_name: c.client_name,
        count: c.rowCount,
      }));

    rowBusiestClient = rowSortedClients[0] || null;
  }

  let unmappedBoards = 0;
  if (selectedDayBoardSet.size > 0) {
    const boardIdsArray = Array.from(selectedDayBoardSet);
    const { data: mappings } = await supabase
      .from("client_360_field_mappings")
      .select("board_id")
      .in("board_id", boardIdsArray)
      .eq("field_type", "job_date")
      .eq("organization_id", organizationId);

    const mappedBoardIds = new Set(mappings?.map((m) => m.board_id) || []);
    for (const bid of boardIdsArray) {
      if (!mappedBoardIds.has(bid)) {
        unmappedBoards++;
      }
    }
  }

  return {
    selectedDate: selectedDateStr,
    start: startStr,
    end: endStr,
    total_jobs: selectedDayVolume,
    clients_active: clientsActive,
    boards_touched: boardsTouched,
    busiest_client: busiestClient,
    clients: sortedClients,
    daily_breakdown: dailyBreakdown,
    unmapped_boards: unmappedBoards,
    row_total_jobs: selectedDayRowCount,
    row_clients: rowSortedClients,
    row_busiest_client: rowBusiestClient,
    row_daily_breakdown: rowDailyBreakdown,
  };
}

// ── Additive Activity Tasks (Due-date / Task View & Inline Day Details) ─────

const FINISHED_STATUS_SET = new Set([
  "done",
  "completed",
  "complete",
  "delivered",
  "closed",
  "cancelled",
  "archived",
]);

function getTodayISTString(): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return formatDate(getBusinessTimezoneToday());
  }
}

function diffCalendarDaysIST(dueISO: string, todayISO: string): number {
  const [dy, dm, dd] = dueISO.split("-").map(Number);
  const [ty, tm, td] = todayISO.split("-").map(Number);
  const dueUtc = Date.UTC(dy, dm - 1, dd);
  const todayUtc = Date.UTC(ty, tm - 1, td);
  return Math.round((dueUtc - todayUtc) / 86400000);
}

function computeDueBucket(dueISO: string | null, todayISO: string): {
  daysFromToday: number | null;
  bucket: string;
} {
  if (!dueISO) return { daysFromToday: null, bucket: "No due date" };
  const diff = diffCalendarDaysIST(dueISO, todayISO);
  if (diff < 0) return { daysFromToday: diff, bucket: "Overdue" };
  if (diff === 0) return { daysFromToday: 0, bucket: "Due today" };
  if (diff === 1) return { daysFromToday: 1, bucket: "Tomorrow" };
  if (diff <= 7) return { daysFromToday: diff, bucket: "This week" };
  return { daysFromToday: diff, bucket: "Later" };
}

function normalizeColLabel(label: string | null | undefined): string {
  return String(label ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function cleanDisplayLabel(label: string | null | undefined): string {
  return String(label ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

const DUE_COL_NAMES = new Set([
  "due date",
  "due",
  "deadline",
  "delivery date",
  "target date",
  "date",
]);

const RECEIVED_COL_NAMES = new Set([
  "receive date post production",
  "receive date",
  "received date",
  "inward date",
  "received",
  "created date",
  "job date",
]);

const CLIENT_COL_NAMES = new Set([
  "client / company name",
  "client name",
  "client",
  "customer",
  "company",
]);

const ITEM_FALLBACK_COL_NAMES = new Set([
  "item name",
  "files name",
]);

const BATCH_COL_NAMES = new Set([
  "batch details (pfm1_no)",
  "saleno.",
]);

const TYPE_COL_NAMES = new Set([
  "type of job",
  "job type",
  "type",
  "job category",
  "requirement",
  "comment",
  "remarks",
]);

const STATUS_COL_NAMES = new Set([
  "status",
  "upload status",
  "tat",
  "state",
]);

const ASSIGNEE_COL_NAMES = new Set([
  "assigned to",
  "assignee",
  "owner",
  "artist name",
]);

const PRIORITY_COL_NAMES = new Set([
  "priority",
  "urgency",
]);

function extractCellText(
  rawVal: unknown,
  rawText: string | null | undefined,
  optionMap: Map<string, string>,
): string | null {
  let candidate: string | null = null;
  if (rawVal !== null && rawVal !== undefined) {
    if (typeof rawVal === "string") {
      candidate = rawVal.trim();
    } else if (typeof rawVal === "number" || typeof rawVal === "boolean") {
      candidate = String(rawVal);
    } else if (Array.isArray(rawVal)) {
      const parts = rawVal
        .map((item) => {
          if (typeof item === "string") return optionMap.get(item) ?? item;
          if (item && typeof item === "object") {
            const obj = item as Record<string, unknown>;
            const id = String(obj.id ?? obj.value ?? "");
            return (
              (id && optionMap.get(id)) ||
              String(obj.label ?? obj.name ?? obj.text ?? obj.value ?? "")
            );
          }
          return "";
        })
        .filter(Boolean);
      candidate = parts.join(", ");
    } else if (typeof rawVal === "object") {
      const obj = rawVal as Record<string, unknown>;
      const id = String(obj.id ?? obj.value ?? "");
      candidate =
        (id && optionMap.get(id)) ||
        String(obj.label ?? obj.name ?? obj.text ?? obj.title ?? obj.value ?? "");
    }
  }
  if (!candidate && rawText) {
    candidate = rawText.trim();
  }
  if (!candidate) return null;
  const cleaned = candidate.replace(/^"+|"+$/g, "").trim();
  if (!cleaned || ["null", "undefined", "-"].includes(cleaned.toLowerCase())) {
    return null;
  }
  return optionMap.get(cleaned) ?? cleaned;
}

function extractCellDateISO(
  rawVal: unknown,
  rawText: string | null | undefined,
): string | null {
  let rawStr: string | null = null;
  if (rawVal && typeof rawVal === "object" && !Array.isArray(rawVal)) {
    const obj = rawVal as Record<string, unknown>;
    // Timeline/range columns use END date per specification
    const picked = obj.end ?? obj.to ?? obj.date ?? obj.start ?? obj.value;
    if (typeof picked === "string") rawStr = picked;
  } else if (typeof rawVal === "string") {
    rawStr = rawVal;
  }
  if (!rawStr && rawText) {
    rawStr = rawText;
  }
  if (!rawStr) return null;
  const parsed = parseDateInput(rawStr);
  if (!parsed) return null;
  return formatDate(parsed);
}

export async function fetchActivityTasks(options: {
  selectedDate?: string;
  mode?: ActivityMode;
  workspaceIds?: string[];
  boardIds?: string[];
  onlyMine?: boolean;
  organizationId?: string;
} = {}): Promise<ActivityTasksResponse> {
  const todayIST = getTodayISTString();
  const selectedDateObj = options.selectedDate
    ? parseISODate(options.selectedDate)
    : parseISODate(todayIST);
  const selectedDateStr = formatDate(selectedDateObj);
  const mode: ActivityMode = options.mode ?? "received";

  const startDate = new Date(selectedDateObj);
  startDate.setDate(startDate.getDate() - HISTORICAL_DAYS + 1);
  const startStr = formatDate(startDate);
  const endStr = selectedDateStr;

  const organizationId = options.organizationId ?? (await getUserOrganizationId());
  if (!organizationId) {
    throw new Error("Unable to determine organization.");
  }

  const supabase = await createServiceClient();
  await checkAndRefreshSnapshotIfNeeded(supabase);

  let currentUserId: string | null = null;
  let currentUserEmail: string | null = null;
  let currentUserName: string | null = null;
  try {
    const sessionClient = await createClient();
    const {
      data: { user },
    } = await sessionClient.auth.getUser();
    currentUserId = user?.id ?? null;
    currentUserEmail = user?.email?.toLowerCase() ?? null;
    currentUserName =
      (user?.user_metadata?.full_name as string | undefined)?.toLowerCase() ?? null;
  } catch {
    // Non-fatal in background/test contexts
  }

  // Load workspaces, boards, groups, and columns in the organization
  const [wsRes, boardsRes, groupsRes, colsRes] = await Promise.all([
    supabase
      .from("workspaces")
      .select("id, name, organization_id")
      .eq("organization_id", organizationId),
    supabase
      .from("boards")
      .select("id, name, slug, workspace_id, status, organization_id")
      .eq("organization_id", organizationId)
      .neq("status", "archived"),
    supabase
      .from("groups")
      .select("id, name, board_id")
      .eq("organization_id", organizationId),
    supabase
      .from("columns")
      .select("id, board_id, label, type, settings, sort_order")
      .eq("organization_id", organizationId)
      .is("deleted_at", null),
  ]);

  const workspaces = wsRes.data ?? [];
  const wsMap = new Map(workspaces.map((w) => [String(w.id), String(w.name)]));

  const allBoards = (boardsRes.data ?? []).filter((b) => {
    if (options.workspaceIds?.length && !options.workspaceIds.includes(String(b.workspace_id))) {
      return false;
    }
    if (options.boardIds?.length && !options.boardIds.includes(String(b.id))) {
      return false;
    }
    return true;
  });
  const boardMap = new Map(allBoards.map((b) => [String(b.id), b]));
  const groupMap = new Map((groupsRes.data ?? []).map((g) => [String(g.id), String(g.name)]));

  // Build option lookup map from column settings (status/dropdown/priority/multi_select)
  const optionLabelMap = new Map<string, string>();
  const colsByBoard = new Map<string, Array<{
    id: string;
    label: string;
    normLabel: string;
    type: string;
    sortOrder: number;
  }>>();

  for (const col of colsRes.data ?? []) {
    const settings = col.settings as { options?: Array<{ id?: string; value?: string; label?: string }> } | null;
    if (settings?.options && Array.isArray(settings.options)) {
      for (const opt of settings.options) {
        if (opt.label) {
          if (opt.id) optionLabelMap.set(String(opt.id), String(opt.label));
          if (opt.value) optionLabelMap.set(String(opt.value), String(opt.label));
        }
      }
    }
    const bId = String(col.board_id);
    if (!colsByBoard.has(bId)) colsByBoard.set(bId, []);
    colsByBoard.get(bId)!.push({
      id: String(col.id),
      label: cleanDisplayLabel(col.label as string),
      normLabel: normalizeColLabel(col.label as string),
      type: String(col.type),
      sortOrder: Number(col.sort_order ?? 0),
    });
  }

  // Discover columns per board (ranking by populated count when duplicate column names exist)
  const boardIds = allBoards.map((b) => String(b.id));
  if (boardIds.length === 0) {
    return {
      selectedDate: selectedDateStr,
      today: todayIST,
      mode,
      start: startStr,
      end: endStr,
      items: [],
      daily_breakdown: [],
      due_summary: {
        due_selected_day: 0,
        overdue: 0,
        upcoming: 0,
        upcoming_next_7_days: 0,
        next_due_date: null,
        no_due_date: 0,
        clients_active: 0,
        boards_touched: 0,
      },
      boards_due_columns: [],
      boards_without_due_date: [],
      finished_statuses: [],
    };
  }

  // Paginate records and client_360_daily_snapshot so PostgREST's 1000-row cap never truncates rows
  const activeRecords: Array<{
    id: string;
    title: string | null;
    board_id: string;
    workspace_id: string;
    group_id: string | null;
    status: string | null;
    archived_at: string | null;
    created_at: string | null;
    due_date: string | null;
  }> = [];
  for (let offset = 0; offset < 15000; offset += 1000) {
    const { data: recPage } = await supabase
      .from("records")
      .select("id, title, board_id, workspace_id, group_id, status, archived_at, created_at, due_date")
      .in("board_id", boardIds)
      .eq("status", "active")
      .is("archived_at", null)
      .range(offset, offset + 999);
    if (!recPage || recPage.length === 0) break;
    activeRecords.push(...(recPage as typeof activeRecords));
    if (recPage.length < 1000) break;
  }

  const allSnapshots: Array<{
    record_id: string;
    board_id: string;
    job_date: string | null;
    due_date: string | null;
    client_id: string | null;
    status: string | null;
    job_type: string | null;
  }> = [];
  for (let offset = 0; offset < 15000; offset += 1000) {
    const { data: snapPage } = await supabase
      .from("client_360_daily_snapshot")
      .select("record_id, board_id, job_date, due_date, client_id, status, job_type")
      .eq("organization_id", organizationId)
      .range(offset, offset + 999);
    if (!snapPage || snapPage.length === 0) break;
    allSnapshots.push(...(snapPage as typeof allSnapshots));
    if (snapPage.length < 1000) break;
  }

  const clientsTableRes = await supabase
    .from("client_360_clients")
    .select("id, canonical_name")
    .eq("organization_id", organizationId);

  const snapByRecordId = new Map(
    allSnapshots.map((s) => [String(s.record_id), s]),
  );
  const canonicalClientById = new Map(
    (clientsTableRes.data ?? []).map((c) => [String(c.id), String(c.canonical_name)]),
  );

  // Fetch all cell_values for candidate columns on these boards (handling PostgREST 1000-row cap)
  const candidateColIds: string[] = [];
  for (const bId of boardIds) {
    for (const c of colsByBoard.get(bId) ?? []) {
      if (
        DUE_COL_NAMES.has(c.normLabel) ||
        RECEIVED_COL_NAMES.has(c.normLabel) ||
        CLIENT_COL_NAMES.has(c.normLabel) ||
        ITEM_FALLBACK_COL_NAMES.has(c.normLabel) ||
        BATCH_COL_NAMES.has(c.normLabel) ||
        TYPE_COL_NAMES.has(c.normLabel) ||
        STATUS_COL_NAMES.has(c.normLabel) ||
        ASSIGNEE_COL_NAMES.has(c.normLabel) ||
        PRIORITY_COL_NAMES.has(c.normLabel)
      ) {
        candidateColIds.push(c.id);
      }
    }
  }

  const allCells: Array<{
    record_id: string;
    column_id: string;
    board_id: string;
    value: unknown;
    value_text: string | null;
  }> = [];

  if (candidateColIds.length > 0) {
    const PAGE_SIZE = 1000;
    let offset = 0;
    while (offset < 15000) {
      const { data: page } = await supabase
        .from("cell_values")
        .select("record_id, column_id, board_id, value, value_text")
        .in("column_id", candidateColIds)
        .range(offset, offset + PAGE_SIZE - 1);
      if (!page || page.length === 0) break;
      allCells.push(
        ...(page as Array<{
          record_id: string;
          column_id: string;
          board_id: string;
          value: unknown;
          value_text: string | null;
        }>),
      );
      if (page.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
  }

  // Count populated cells per column_id and index cells by record_id + column_id
  const colPopCount = new Map<string, number>();
  const cellByRecAndCol = new Map<string, { value: unknown; value_text: string | null }>();
  for (const cv of allCells) {
    const hasVal =
      cv.value !== null && cv.value !== undefined && cv.value !== "" ||
      (cv.value_text !== null && cv.value_text.trim() !== "");
    if (hasVal) {
      colPopCount.set(cv.column_id, (colPopCount.get(cv.column_id) ?? 0) + 1);
      cellByRecAndCol.set(`${cv.record_id}:${cv.column_id}`, {
        value: cv.value,
        value_text: cv.value_text,
      });
    }
  }

  // Resolve the best column for each role on each board
  interface BoardFieldSpec {
    dueCol: { id: string; label: string } | null;
    receivedCols: Array<{ id: string; label: string }>;
    clientCols: Array<{ id: string; label: string }>;
    itemCols: Array<{ id: string; label: string }>;
    batchCols: Array<{ id: string; label: string }>;
    typeCols: Array<{ id: string; label: string }>;
    statusCols: Array<{ id: string; label: string }>;
    assigneeCols: Array<{ id: string; label: string }>;
    priorityCols: Array<{ id: string; label: string }>;
  }

  const boardSpecs = new Map<string, BoardFieldSpec>();
  const boardsDueColumns: Array<{ board_id: string; board_name: string; due_column: string | null }> = [];
  const boardsWithoutDueDate: string[] = [];

  for (const b of allBoards) {
    const bId = String(b.id);
    const cols = (colsByBoard.get(bId) ?? []).slice().sort((a, z) => {
      const popDiff = (colPopCount.get(z.id) ?? 0) - (colPopCount.get(a.id) ?? 0);
      return popDiff !== 0 ? popDiff : a.sortOrder - z.sortOrder;
    });

    const dueCandidates = cols
      .filter((c) => DUE_COL_NAMES.has(c.normLabel))
      .sort((a, z) => {
        const rank = (lbl: string) =>
          lbl === "due date" ? 1 : lbl === "deadline" ? 2 : lbl === "delivery date" ? 3 : lbl === "target date" ? 4 : lbl === "due" ? 5 : 6;
        const rDiff = rank(a.normLabel) - rank(z.normLabel);
        if (rDiff !== 0) return rDiff;
        return (colPopCount.get(z.id) ?? 0) - (colPopCount.get(a.id) ?? 0);
      });

    const dueCol = dueCandidates[0] ? { id: dueCandidates[0].id, label: dueCandidates[0].label } : null;

    const statusCandidates = cols
      .filter((c) => STATUS_COL_NAMES.has(c.normLabel))
      .sort((a, z) => {
        const rank = (lbl: string) => (lbl === "status" ? 1 : lbl === "upload status" ? 2 : lbl === "tat" ? 3 : 4);
        const rDiff = rank(a.normLabel) - rank(z.normLabel);
        if (rDiff !== 0) return rDiff;
        return (colPopCount.get(z.id) ?? 0) - (colPopCount.get(a.id) ?? 0);
      });

    boardSpecs.set(bId, {
      dueCol,
      receivedCols: cols.filter((c) => RECEIVED_COL_NAMES.has(c.normLabel)),
      clientCols: cols.filter((c) => CLIENT_COL_NAMES.has(c.normLabel)),
      itemCols: cols.filter((c) => ITEM_FALLBACK_COL_NAMES.has(c.normLabel)),
      batchCols: cols.filter((c) => BATCH_COL_NAMES.has(c.normLabel)),
      typeCols: cols
        .filter((c) => TYPE_COL_NAMES.has(c.normLabel))
        .sort((a, z) => {
          const rank = (lbl: string) =>
            lbl === "type of job" || lbl === "job type"
              ? 1
              : lbl === "type" || lbl === "job category" || lbl === "requirement"
                ? 2
                : 3;
          const rDiff = rank(a.normLabel) - rank(z.normLabel);
          if (rDiff !== 0) return rDiff;
          return (colPopCount.get(z.id) ?? 0) - (colPopCount.get(a.id) ?? 0);
        }),
      statusCols: statusCandidates,
      assigneeCols: cols.filter((c) => ASSIGNEE_COL_NAMES.has(c.normLabel)),
      priorityCols: cols.filter((c) => PRIORITY_COL_NAMES.has(c.normLabel)),
    });

    const boardCols = colsByBoard.get(bId) ?? [];
    // Only report data boards (boards that actually have columns)
    if (boardCols.length > 0) {
      boardsDueColumns.push({
        board_id: bId,
        board_name: String(b.name),
        due_column: dueCol?.label ?? null,
      });
      if (!dueCol) {
        boardsWithoutDueDate.push(String(b.name));
      }
    }
  }

  const readFirstText = (recId: string, cols: Array<{ id: string }>): string | null => {
    for (const c of cols) {
      const cell = cellByRecAndCol.get(`${recId}:${c.id}`);
      if (cell) {
        const txt = extractCellText(cell.value, cell.value_text, optionLabelMap);
        if (txt) return txt;
      }
    }
    return null;
  };

  const readFirstDate = (recId: string, cols: Array<{ id: string }>): string | null => {
    for (const c of cols) {
      const cell = cellByRecAndCol.get(`${recId}:${c.id}`);
      if (cell) {
        const dt = extractCellDateISO(cell.value, cell.value_text);
        if (dt) return dt;
      }
    }
    return null;
  };

  const seenRecordIds = new Set<string>();
  const allResolvedRows: ActivityTaskRow[] = [];
  const finishedStatusesSet = new Set<string>();

  for (const rec of activeRecords) {
    const recId = String(rec.id);
    if (seenRecordIds.has(recId)) continue;
    seenRecordIds.add(recId);

    const bId = String(rec.board_id);
    const board = boardMap.get(bId);
    const spec = boardSpecs.get(bId);
    if (!board || !spec) continue;

    const snap = snapByRecordId.get(recId);

    const rawClient = readFirstText(recId, spec.clientCols);
    const rawItemName = readFirstText(recId, spec.itemCols);
    const rawBatch = readFirstText(recId, spec.batchCols);
    const snapClient = snap?.client_id ? canonicalClientById.get(String(snap.client_id)) ?? null : null;
    const client = rawClient ?? snapClient ?? rawItemName ?? null;

    const jobType =
      readFirstText(recId, spec.typeCols) ??
      (snap?.job_type ? String(snap.job_type).trim() : null) ??
      null;

    const status =
      readFirstText(recId, spec.statusCols) ??
      (snap?.status ? optionLabelMap.get(String(snap.status)) ?? String(snap.status) : null) ??
      null;

    const assigneeName = readFirstText(recId, spec.assigneeCols);
    const priority = readFirstText(recId, spec.priorityCols);

    const snapJobDate = snap?.job_date ? String(snap.job_date).slice(0, 10) : null;
    const receivedAt = snapJobDate ?? readFirstDate(recId, spec.receivedCols);

    // Due date is ONLY read from the resolved due-date column or record due_date (never guessed from inward/receive/upload date)
    const dueDate =
      (spec.dueCol ? readFirstDate(recId, [spec.dueCol]) : null) ??
      (rec.due_date ? String(rec.due_date).slice(0, 10) : null) ??
      (snap?.due_date ? String(snap.due_date).slice(0, 10) : null);

    const statusNorm = (status ?? "").trim().toLowerCase();
    const isFinished = FINISHED_STATUS_SET.has(statusNorm);
    if (isFinished && status) {
      finishedStatusesSet.add(status);
    }

    const rawTitle = String(rec.title ?? "").trim();
    const isGenericImportTitle = !rawTitle || /^imported row \d+$/i.test(rawTitle);
    const jobName = isGenericImportTitle
      ? [client ?? rawItemName, rawBatch].filter(Boolean).join(" — ") ||
        jobType ||
        rawTitle ||
        "Untitled task"
      : rawTitle;

    const { daysFromToday, bucket } = computeDueBucket(dueDate, todayIST);

    const assignedToMe = Boolean(
      assigneeName &&
        ((currentUserId && assigneeName === currentUserId) ||
          (currentUserEmail && assigneeName.toLowerCase().includes(currentUserEmail)) ||
          (currentUserName && assigneeName.toLowerCase().includes(currentUserName))),
    );

    if (options.onlyMine && !assignedToMe) {
      continue;
    }

    allResolvedRows.push({
      item_id: recId,
      job_name: jobName,
      client,
      workspace_id: String(rec.workspace_id),
      workspace_name: wsMap.get(String(rec.workspace_id)) ?? "Workspace",
      board_id: bId,
      board_slug: (board.slug as string | null) ?? null,
      board_name: String(board.name),
      group_name: rec.group_id ? groupMap.get(String(rec.group_id)) ?? null : null,
      job_type: jobType,
      status,
      assignee_id: null,
      assignee_name: assigneeName,
      received_at: receivedAt,
      due_date: dueDate,
      days_from_today: daysFromToday,
      bucket,
      priority,
      due_column: spec.dueCol?.label ?? null,
      is_finished: isFinished,
      assigned_to_me: assignedToMe,
    });
  }

  // Sort: Overdue (oldest first), then Due today, then Upcoming (nearest first), then No due date
  allResolvedRows.sort((a, b) => {
    if (a.due_date && b.due_date) {
      if (a.due_date !== b.due_date) return a.due_date.localeCompare(b.due_date);
    } else if (a.due_date && !b.due_date) {
      return -1;
    } else if (!a.due_date && b.due_date) {
      return 1;
    }
    const recA = a.received_at ?? "";
    const recB = b.received_at ?? "";
    if (recA !== recB) return recB.localeCompare(recA);
    return a.job_name.localeCompare(b.job_name);
  });

  // Compute Due summary across open tasks
  const openTasks = allResolvedRows.filter((r) => !r.is_finished);
  const dueOnSelectedDay = openTasks.filter((r) => r.due_date === selectedDateStr);
  const overdueTasks = openTasks.filter((r) => r.days_from_today !== null && r.days_from_today < 0);
  const upcomingTasks = openTasks.filter((r) => r.days_from_today !== null && r.days_from_today > 0);
  const upcomingNext7 = upcomingTasks.filter(
    (r) => r.days_from_today !== null && r.days_from_today <= 7,
  );
  const noDueDateTasks = openTasks.filter((r) => r.due_date === null);

  const nextDueDate =
    upcomingTasks
      .map((r) => r.due_date!)
      .sort((a, b) => a.localeCompare(b))[0] ?? null;

  const dueClientsSet = new Set(
    openTasks.map((r) => r.client).filter((c): c is string => Boolean(c)),
  );
  const dueBoardsSet = new Set(openTasks.map((r) => r.board_id));

  // Build daily breakdown (60 days ending at selectedDate)
  const countsByDate = new Map<string, number>();
  if (mode === "due") {
    for (const row of openTasks) {
      if (row.due_date) {
        countsByDate.set(row.due_date, (countsByDate.get(row.due_date) ?? 0) + 1);
      }
    }
  } else {
    for (const row of allResolvedRows) {
      if (row.received_at) {
        countsByDate.set(row.received_at, (countsByDate.get(row.received_at) ?? 0) + 1);
      }
    }
  }

  const dailyBreakdown: Array<{ date: string; total: number }> = [];
  const cursor = new Date(startDate);
  while (cursor <= selectedDateObj) {
    const dStr = formatDate(cursor);
    dailyBreakdown.push({
      date: dStr,
      total: countsByDate.get(dStr) ?? 0,
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  const filteredItems =
    mode === "due"
      ? openTasks
      : allResolvedRows.filter(
          (r) => r.received_at && r.received_at >= startStr && r.received_at <= endStr,
        );

  return {
    selectedDate: selectedDateStr,
    today: todayIST,
    mode,
    start: startStr,
    end: endStr,
    items: filteredItems,
    daily_breakdown: dailyBreakdown,
    due_summary: {
      due_selected_day: dueOnSelectedDay.length,
      overdue: overdueTasks.length,
      upcoming: upcomingTasks.length,
      upcoming_next_7_days: upcomingNext7.length,
      next_due_date: nextDueDate,
      no_due_date: noDueDateTasks.length,
      clients_active: dueClientsSet.size,
      boards_touched: dueBoardsSet.size,
    },
    boards_due_columns: boardsDueColumns,
    boards_without_due_date: Array.from(new Set(boardsWithoutDueDate)),
    finished_statuses: Array.from(finishedStatusesSet),
  };
}