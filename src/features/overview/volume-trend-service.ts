import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchDataBounds } from "@/features/overview/data-bounds";

import { checkAndRefreshSnapshotIfNeeded } from "@/features/client-360/daily-activity-service";
import {
  buildVolumeBuckets,
  pickVolumeGranularity,
  type VolumeBucket,
  type VolumeGranularity,
} from "@/features/overview/volume-buckets";
import {
  EMPTY_COVERAGE,
  narrowAllTimeRange,
  type RangeCoverage,
  type ResolvedTimeRange,
} from "@/features/overview/time-range";
import type { VolumeTrendPayload } from "@/features/overview/volume-trend";

export interface VolumeTrendOptions {
  organizationId: string;
  range: ResolvedTimeRange;
  /** Restricts the query to specific workspaces. Null means all in the org. */
  workspaceIds?: string[] | null;
  /** Overridable so tests can pin "today"; defaults to the real clock. */
  today?: Date;
}

interface ServerBucket {
  key: string;
  jobs: number;
}

function toCount(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
}

function toBoolean(value: unknown): boolean {
  return value === true || value === "true" || value === 1;
}

function toDateKeyOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function parseBuckets(value: unknown): ServerBucket[] {
  if (!Array.isArray(value)) return [];
  const buckets: ServerBucket[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.key !== "string" || record.key.length === 0) continue;
    buckets.push({ key: record.key, jobs: toCount(record.jobs) });
  }
  return buckets;
}

function parseCoverage(value: unknown): RangeCoverage {
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

/** Local-midnight `YYYY-MM-DD` for a date, matching the snapshot's date keys. */
function toDateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

/**
 * Rebuilds a full, zero-filled bucket series from the buckets the database
 * grouped.
 *
 * The server returns only buckets that hold data, so the axis still has to be
 * built here — otherwise a quiet fortnight would collapse the chart instead of
 * showing a flat run of zeros. Buckets are matched by the same key function the
 * server used, so day, week and month axes all line up.
 */
function toZeroFilledSeries(
  serverBuckets: ServerBucket[],
  from: string,
  to: string,
  granularity: VolumeGranularity,
): VolumeBucket[] {
  const axis = buildVolumeBuckets(
    new Date(`${from}T00:00:00`),
    new Date(`${to}T00:00:00`),
    granularity,
  );

  const totals = new Map<string, number>();
  for (const bucket of serverBuckets) {
    totals.set(bucket.key, (totals.get(bucket.key) ?? 0) + bucket.jobs);
  }

  for (const [key, bucket] of axis) {
    bucket.jobs = totals.get(key) ?? 0;
  }

  const buckets = Array.from(axis.values());

  // Any server bucket the axis does not contain would otherwise vanish with no
  // error at all. That is exactly how a week-key convention mismatch between SQL
  // and this file turned a populated chart into a flat zero line. Surface the
  // orphan instead of dropping its value.
  const orphaned = [...totals.keys()].filter((key) => !axis.has(key));
  if (orphaned.length > 0) {
    console.warn(
      `Overview volume trend: ${orphaned.length} server bucket(s) fall outside the ` +
        `${granularity} axis and would be dropped, e.g. ${orphaned.slice(0, 3).join(", ")}`,
    );
    for (const key of orphaned) {
      buckets.push({ key, label: key, jobs: totals.get(key) ?? 0 });
    }
    buckets.sort((a, b) => a.key.localeCompare(b.key));
  }

  return buckets;
}

/**
 * Fetches the two bucket series (received + completed) for a range.
 *
 * The range filter AND the bucketing both happen in the database: the window is
 * applied to the real `job_date` / `completed_date` DATE columns and grouped
 * with `date_trunc`. Nothing is parsed or grouped from strings in the browser,
 * which is what previously made a 1-year range build 366 buckets client-side and
 * left the chart empty whenever the underlying dates were not ISO.
 *
 * The received series is always returned. The completed series is returned only
 * when the organization maps a real completion-date column somewhere, and
 * `completedDateAvailable` says so — the client hides the toggle otherwise rather
 * than drawing a flat line that means "no data", not "no completions".
 */
export async function fetchVolumeTrend(
  supabase: SupabaseClient,
  { organizationId, range, workspaceIds = null, today = new Date() }: VolumeTrendOptions,
): Promise<VolumeTrendPayload> {
  // Records written moments ago only reach the snapshot on refresh; without it
  // the chart would under-report today's volume.
  await checkAndRefreshSnapshotIfNeeded(supabase);

  const window =
    range.id === "all"
      ? narrowAllTimeRange(range, await fetchDataBounds(supabase, organizationId, workspaceIds))
      : range;

  const granularity = pickVolumeGranularity(window.days);

  const { data, error } = await supabase.rpc("overview_volume_trend", {
    p_organization_id: organizationId,
    p_workspace_ids: workspaceIds,
    p_from: window.from,
    p_to: window.to,
    p_granularity: granularity,
  });

  if (error) {
    console.error("Failed to fetch volume trend:", error);
    throw new Error(
      `Failed to fetch volume trend data: ${error.message || String(error)}`,
    );
  }

  const root = (data ?? {}) as Record<string, unknown>;

  const received = toZeroFilledSeries(
    parseBuckets(root.received),
    window.from,
    window.to,
    granularity,
  );
  const completed = toZeroFilledSeries(
    parseBuckets(root.completed),
    window.from,
    window.to,
    granularity,
  );

  return {
    range: {
      id: window.id,
      label: window.label,
      from: window.from,
      to: window.to,
      days: window.days,
      granularity,
      today: toDateKey(today),
    },
    received,
    completed,
    completedDateAvailable: toBoolean(root.completed_date_available),
    coverage: parseCoverage(root.coverage),
  };
}


