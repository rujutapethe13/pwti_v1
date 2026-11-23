import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getLiveJobScope, isJobReceivedInRange, type LiveJobRow } from "@/features/client-360/live-job-scope";
import { fetchDataBounds } from "@/features/overview/data-bounds";
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
  boardIds?: string[] | null;
}

export async function fetchVolumeBreakdown(
  _supabase: SupabaseClient,
  { organizationId, range, boardIds = null }: VolumeBreakdownOptions,
): Promise<BreakdownPayload & { generatedAt: string; todayIST: string }> {
  const scope = await getLiveJobScope(organizationId);
  let jobs = scope.jobs;
  if (boardIds && boardIds.length > 0) {
    const allowed = new Set(boardIds);
    jobs = jobs.filter((j) => allowed.has(j.board_id));
  }

  const window = range.id === "all"
    ? narrowAllTimeRange(range, await fetchDataBounds(_supabase, organizationId, null))
    : range;

  const received = jobs.filter((j) => isJobReceivedInRange(j, window.from, window.to));
  const counts = new Map<string, number>();
  let jobTypeAvailable = false;
  for (const job of received) {
    const raw = (job.job_type ?? "").trim();
    if (raw) jobTypeAvailable = true;
    const key = raw || "";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const items: BreakdownItem[] = [...counts.entries()]
    .map(([key, jobsCount]) => ({ key, volume: jobsCount, jobs: jobsCount }))
    .filter((item) => item.volume > 0);

  return {
    range: window,
    grouping: { field: BREAKDOWN_FIELD, label: BREAKDOWN_FIELD_LABEL, available: jobTypeAvailable },
    total: { volume: received.length, jobs: received.length },
    items,
    generatedAt: scope.generatedAt,
    todayIST: scope.todayIST,
  };
}
