import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchDataBounds } from "@/features/overview/data-bounds";

import { checkAndRefreshSnapshotIfNeeded } from "@/features/client-360/daily-activity-service";
import { narrowAllTimeRange, type ResolvedTimeRange } from "@/features/overview/time-range";
import {
  BREAKDOWN_FIELD,
  BREAKDOWN_FIELD_LABEL,
  type BreakdownItem,
  type BreakdownPayload,
} from "@/features/overview/volume-breakdown";

export interface VolumeBreakdownOptions {
  organizationId: string;
  range: ResolvedTimeRange;
  /** Restricts the aggregate to specific workspaces. Null means all in the org. */
  workspaceIds?: string[] | null;
}

/** Coerces a JSONB number to a non-negative integer, defaulting to 0. */
function toCount(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed);
}

function toBoolean(value: unknown): boolean {
  return value === true || value === "true" || value === 1;
}

function parseItems(value: unknown): BreakdownItem[] {
  if (!Array.isArray(value)) return [];
  const items: BreakdownItem[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const key = typeof record.key === "string" ? record.key : "";
    const volume = toCount(record.volume);
    // A group with no volume cannot be drawn and has no share of the total, so
    // it is dropped here rather than becoming a 0% legend row downstream.
    if (volume <= 0) continue;
    items.push({ key, volume, jobs: toCount(record.jobs) });
  }
  return items;
}

/**
 * Loads the job-type breakdown for a range in a single database round trip.
 *
 * `overview_volume_breakdown()` counts real snapshot rows whose `job_date` falls
 * inside the window; the totals and the per-group counts both come from those
 * rows, so the legend can never disagree with the donut. Records with no job
 * type come back under an empty key rather than being dropped, which is what
 * lets the UI surface them as an explicit "Unclassified" slice.
 *
 * Throws when the aggregation fails. There is no fallback data path: a breakdown
 * that quietly returned zero slices would be indistinguishable from a studio
 * that genuinely did no work.
 */
export async function fetchVolumeBreakdown(
  supabase: SupabaseClient,
  { organizationId, range, workspaceIds = null }: VolumeBreakdownOptions,
): Promise<BreakdownPayload> {
  // Records written moments ago only reach the snapshot on refresh; without it
  // the breakdown would under-report the current range.
  await checkAndRefreshSnapshotIfNeeded(supabase);

  const window =
    range.id === "all"
      ? narrowAllTimeRange(range, await fetchDataBounds(supabase, organizationId, workspaceIds))
      : range;

  const { data, error } = await supabase.rpc("overview_volume_breakdown", {
    p_organization_id: organizationId,
    p_workspace_ids: workspaceIds,
    p_from: window.from,
    p_to: window.to,
  });

  if (error) {
    console.error("Failed to fetch volume breakdown:", error);
    throw new Error(
      `Failed to fetch volume breakdown: ${error.message || String(error)}`,
    );
  }

  const root = (data ?? {}) as Record<string, unknown>;

  return {
    range: window,
    grouping: {
      field: BREAKDOWN_FIELD,
      label: BREAKDOWN_FIELD_LABEL,
      available: toBoolean(root.job_type_available),
    },
    total: {
      volume: toCount(root.total_volume),
      jobs: toCount(root.total_jobs),
    },
    items: parseItems(root.items),
  };
}


