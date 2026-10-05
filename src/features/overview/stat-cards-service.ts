import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchDataBounds } from "@/features/overview/data-bounds";

import { checkAndRefreshSnapshotIfNeeded } from "@/features/client-360/daily-activity-service";
import {
  EMPTY_COVERAGE,
  narrowAllTimeRange,
  priorPeriod,
  type RangeCoverage,
  type ResolvedTimeRange,
} from "@/features/overview/time-range";
import {
  buildStatCards,
  type BusiestClient,
  type PeriodAggregate,
  type PeriodComparison,
  type StatCardsResult,
} from "@/features/overview/stat-cards";

/** Coerces a JSONB number to a finite number, defaulting to 0. */
function toCount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

/** Coerces a JSONB number to a finite number, or null when it is absent. */
function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = toCount(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toBoolean(value: unknown): boolean {
  return value === true || value === "true" || value === 1;
}

function toDateKeyOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function parseCoverage(value: unknown): RangeCoverage {
  if (!value || typeof value !== "object") return EMPTY_COVERAGE;
  const record = value as Record<string, unknown>;
  return {
    totalRows: toCount(record.total_rows),
    datedRows: toCount(record.dated_rows),
    inRange: toCount(record.in_range),
    beforeRange: toCount(record.before_range),
    afterRange: toCount(record.after_range),
    undated: toCount(record.undated),
    earliest: toDateKeyOrNull(record.earliest),
    latest: toDateKeyOrNull(record.latest),
  };
}

function parseBusiestClient(value: unknown): BusiestClient | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const clientId = typeof record.client_id === "string" ? record.client_id : null;
  if (!clientId) return null;
  return {
    clientId,
    name: typeof record.name === "string" && record.name.length > 0 ? record.name : null,
    count: toCount(record.count),
  };
}

/**
 * Normalizes the `overview_period_stats` payload. Every field is coerced rather
 * than trusted, and an absent number reads as a real 0 — never as a placeholder.
 */
export function parsePeriodComparison(payload: unknown): PeriodComparison {
  const root = (payload ?? {}) as Record<string, unknown>;
  const parseWindow = (value: unknown): PeriodAggregate => {
    const window = (value ?? {}) as Record<string, unknown>;
    return {
      recordsInWindow: toCount(window.records_in_window),
      jobsReceived: toCount(window.jobs_received),
      clientsActive: toCount(window.clients_active),
      boardsTouched: toCount(window.boards_touched),
      completedByStatus: toCount(window.completed_by_status),
      jobsCompleted: toCount(window.jobs_completed),
      receivedTimestamps: toCount(window.received_timestamps),
      completedTimestamps: toCount(window.completed_timestamps),
      turnaroundSample: toCount(window.turnaround_sample),
      turnaroundAvgDays: toNullableNumber(window.turnaround_avg_days),
      completedDateAvailable: toBoolean(window.completed_date_available),
      busiestClient: parseBusiestClient(window.busiest_client),
    };
  };

  return {
    current: parseWindow(root.current),
    prior: parseWindow(root.prior),
    currentTopClientPriorCount: toCount(root.current_top_client_prior_count),
  };
}

export interface OverviewStatCardsOptions {
  organizationId: string;
  range: ResolvedTimeRange;
  /** Restricts the aggregate to specific workspaces. Null means all in the org. */
  workspaceIds?: string[] | null;
}

/**
 * Loads the Overview stat cards for `range` together with the immediately
 * preceding window of the same length, aggregated by PostgreSQL. Throws when the
 * aggregation itself fails so the caller can surface a real error state — there
 * is no fallback data path.
 *
 * An "All time" selection is narrowed to the earliest and latest received dates
 * the workspace actually holds before the window is used, so the aggregate never
 * scans from a sentinel date and the prior-period comparison stays meaningful.
 */
export async function fetchOverviewStatCards(
  supabase: SupabaseClient,
  { organizationId, range, workspaceIds = null }: OverviewStatCardsOptions,
): Promise<StatCardsResult> {
  // Newly written records land in the snapshot only after a refresh; without it
  // the cards would under-report.
  await checkAndRefreshSnapshotIfNeeded(supabase);

  const window = narrowAllTimeRange(
    range,
    await fetchDataBounds(supabase, organizationId, workspaceIds),
  );

  const prior = priorPeriod(window);

  const { data, error } = await supabase.rpc("overview_period_stats", {
    p_organization_id: organizationId,
    p_workspace_ids: workspaceIds,
    p_from: window.from,
    p_to: window.to,
    p_prior_from: prior.from,
    p_prior_to: prior.to,
  });

  if (error) {
    throw new Error(
      `Failed to aggregate period stats: ${error.message || String(error)}`,
    );
  }

  const root = (data ?? {}) as Record<string, unknown>;
  const comparison = parsePeriodComparison(data);
  const coverage = parseCoverage(root.coverage);

  return buildStatCards(comparison, {
    id: window.id,
    label: window.label,
    from: window.from,
    to: window.to,
    days: window.days,
    priorFrom: prior.from,
    priorTo: prior.to,
  }, coverage);
}


