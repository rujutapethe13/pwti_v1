import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getLiveJobScope, isJobReceivedInRange, isJobUploadedInRange, type LiveJobRow } from "@/features/client-360/live-job-scope";
import { fetchDataBounds } from "@/features/overview/data-bounds";
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
  workspaceIds?: string[] | null;
  boardIds?: string[] | null;
  today?: Date;
}

function toDateKeyIST(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function bucketKeyForDate(dayKey: string, granularity: VolumeGranularity): string {
  const d = new Date(`${dayKey}T00:00:00Z`);
  if (granularity === "month") return dayKey.slice(0, 7);
  if (granularity === "week") {
    const day = d.getUTCDay();
    d.setUTCDate(d.getUTCDate() - day);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const da = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${da}`;
  }
  return dayKey;
}

function toZeroFilled(from: string, to: string, granularity: VolumeGranularity, counts: Map<string, number>): VolumeBucket[] {
  const axis = buildVolumeBuckets(new Date(`${from}T00:00:00`), new Date(`${to}T00:00:00`), granularity);
  const totals = new Map<string, number>();
  for (const [key, value] of counts.entries()) totals.set(key, (totals.get(key) ?? 0) + value);
  for (const [key, bucket] of axis) bucket.jobs = totals.get(key) ?? 0;
  return Array.from(axis.values());
}

function computeCoverage(jobs: LiveJobRow[], from: string, to: string): RangeCoverage {
  let datedRows = 0;
  let inRange = 0;
  let beforeRange = 0;
  let afterRange = 0;
  let undated = 0;
  let earliest: string | null = null;
  let latest: string | null = null;
  for (const job of jobs) {
    if (!job.received_date) { undated += 1; continue; }
    datedRows += 1;
    const d = job.received_date;
    if (earliest == null || d < earliest) earliest = d;
    if (latest == null || d > latest) latest = d;
    if (d >= from && d <= to) inRange += 1;
    else if (d < from) beforeRange += 1;
    else afterRange += 1;
  }
  return { totalRows: jobs.length, datedRows, inRange, beforeRange, afterRange, undated, earliest, latest };
}

export async function fetchVolumeTrend(
  _supabase: SupabaseClient,
  { organizationId, range, boardIds = null, today = new Date() }: VolumeTrendOptions,
): Promise<VolumeTrendPayload & { generatedAt: string; todayIST: string; boardsWithoutUploadMapping: Array<{ board_id: string; board_name: string }>; boardsWithoutUploadDate: Array<{ board_id: string; board_name: string }>; missingReceivedDateCount: number }> {
  const scope = await getLiveJobScope(organizationId);
  let jobs = scope.jobs;
  if (boardIds && boardIds.length > 0) {
    const allowed = new Set(boardIds);
    jobs = jobs.filter((j) => allowed.has(j.board_id));
  }

  const bounds = await fetchDataBounds(_supabase, organizationId, null);
  const window = range.id === "all" ? narrowAllTimeRange(range, bounds) : range;
  const granularity = pickVolumeGranularity(window.days);

  const receivedCounts = new Map<string, number>();
  const completedCounts = new Map<string, number>();
  for (const job of jobs) {
    if (isJobReceivedInRange(job, window.from, window.to)) {
      const key = bucketKeyForDate(job.received_date!, granularity);
      receivedCounts.set(key, (receivedCounts.get(key) ?? 0) + 1);
    }
    if (isJobUploadedInRange(job, window.from, window.to)) {
      const key = bucketKeyForDate(job.upload_date!, granularity);
      completedCounts.set(key, (completedCounts.get(key) ?? 0) + 1);
    }
  }

  const received = toZeroFilled(window.from, window.to, granularity, receivedCounts);
  const completed = toZeroFilled(window.from, window.to, granularity, completedCounts);
  const coverage = computeCoverage(jobs, window.from, window.to);
  const completedDateAvailable = jobs.some((j) => j.upload_date != null) || scope.boardsWithUploadDate.length > 0;

  return {
    range: { id: window.id, label: window.label, from: window.from, to: window.to, days: window.days, granularity, today: toDateKeyIST(today) },
    received,
    completed,
    completedDateAvailable,
    coverage,
    generatedAt: scope.generatedAt,
    todayIST: scope.todayIST,
    boardsWithoutUploadMapping: scope.boardsWithoutUploadMapping,
    boardsWithoutUploadDate: scope.boardsWithoutUploadDate,
    missingReceivedDateCount: scope.missingReceivedDate.length,
  };
}
