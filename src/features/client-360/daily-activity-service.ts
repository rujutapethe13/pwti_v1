import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import { getUserOrganizationId } from "@/lib/organization";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Client360DailyActivity } from "./types";

const HISTORICAL_DAYS = 60;

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

    if (state?.needs_refresh) {
      console.warn("[Client 360] Snapshot is stale — refreshing...");
      await supabase.rpc("refresh_client_360_snapshot");

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
  const dailyClientMap = new Map<string, Map<string, number>>();
  const dailyBoardMap = new Map<string, Set<string>>();

  for (const s of snapshots) {
    const parsedDate = parseDateInput(s.job_date as string | null);
    if (!parsedDate) continue;
    const dateStr = formatDate(parsedDate);
    const vol = (s.volume as number) || 1;

    dailyVolumeMap.set(dateStr, (dailyVolumeMap.get(dateStr) || 0) + vol);

    if (!dailyClientMap.has(dateStr)) dailyClientMap.set(dateStr, new Map());
    if (s.client_id) {
      const clientMap = dailyClientMap.get(dateStr)!;
      clientMap.set(s.client_id as string, (clientMap.get(s.client_id as string) || 0) + vol);
    }

    if (!dailyBoardMap.has(dateStr)) dailyBoardMap.set(dateStr, new Set());
    dailyBoardMap.get(dateStr)!.add(s.board_id as string);
  }

  const dailyBreakdown: Array<{ date: string; total: number }> = [];
  const current = new Date(startDate);
  while (current <= endDate) {
    const dateStr = formatDate(current);
    dailyBreakdown.push({
      date: dateStr,
      total: dailyVolumeMap.get(dateStr) || 0,
    });
    current.setDate(current.getDate() + 1);
  }

  const selectedDateStr = formatDate(endDate);
  const selectedDayVolume = dailyVolumeMap.get(selectedDateStr) || 0;
  const selectedDayClientMap = dailyClientMap.get(selectedDateStr) || new Map();
  const selectedDayBoardSet = dailyBoardMap.get(selectedDateStr) || new Set();

  const clientsActive = selectedDayClientMap.size;
  const boardsTouched = selectedDayBoardSet.size;

  const clientVolumeMap = new Map<string, { client_id: string; client_name: string; volume: number }>();
  for (const [clientId, vol] of selectedDayClientMap) {
    clientVolumeMap.set(clientId, {
      client_id: clientId,
      client_name: "",
      volume: vol,
    });
  }

  let busiestClient: { client_id: string; client_name: string; count: number } | null = null;
  let sortedClients: Array<{ client_id: string; client_name: string; count: number }> = [];
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
  };
}