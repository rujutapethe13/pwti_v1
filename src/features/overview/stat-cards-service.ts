import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getLiveJobScope, effectiveClientLabel, isCompletedUploaded, isJobReceivedInRange, completedUploadedJobs, type LiveJobRow } from "@/features/client-360/live-job-scope";
import { fetchDataBounds } from "@/features/overview/data-bounds";
import {
  EMPTY_COVERAGE,
  narrowAllTimeRange,
  priorPeriod,
  type RangeCoverage,
  type ResolvedTimeRange,
} from "@/features/overview/time-range";
import {
  buildStatCards,
  normalizeClientName,
  type BusiestClient,
  type PeriodAggregate,
  type PeriodComparison,
  type StatCardsResult,
} from "@/features/overview/stat-cards";

export interface OverviewStatCardsOptions {
  organizationId: string;
  range: ResolvedTimeRange;
  workspaceIds?: string[] | null;
  boardIds?: string[] | null;
}

function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86400000);
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
    if (!job.received_date) {
      undated += 1;
      continue;
    }
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

function aggregateWindow(jobs: LiveJobRow[], from: string, to: string): PeriodAggregate {
  const receivedInWindow = jobs.filter((j) => isJobReceivedInRange(j, from, to));
  const clients = new Set<string>();
  const boards = new Set<string>();
  const clientCounts = new Map<string, { clientId: string; name: string | null; count: number }>();
  let turnaroundSum = 0;
  let turnaroundSample = 0;

  for (const job of receivedInWindow) {
    boards.add(job.board_id);
    const clientLabel = effectiveClientLabel(job);
    const clientId = job.client_id ?? (job.client_unmatched ? `unmatched:${job.client_raw ?? job.record_id}` : null);
    if (clientId) {
      clients.add(clientId);
      const existing = clientCounts.get(clientId);
      if (existing) existing.count += 1;
      else clientCounts.set(clientId, { clientId, name: normalizeClientName(clientLabel), count: 1 });
    }
    if (isCompletedUploaded(job) && job.upload_date && job.received_date) {
      const diff = daysBetween(job.received_date, job.upload_date);
      if (diff >= 0) {
        turnaroundSum += diff;
        turnaroundSample += 1;
      }
    }
  }

  const busiestClient: BusiestClient | null = [...clientCounts.values()].sort((a, b) => b.count - a.count || (a.name ?? "").localeCompare(b.name ?? ""))[0] ?? null;
  const completedUploaded = completedUploadedJobs(jobs, from, to);
  const jobsCompleted = completedUploaded.length;
  const completedByStatus = receivedInWindow.filter((j) => j.status_class === "completed" || isCompletedUploaded(j)).length;
  const completedDateAvailable = jobs.some((j) => j.upload_date != null);

  return {
    recordsInWindow: receivedInWindow.length,
    jobsReceived: receivedInWindow.length,
    clientsActive: clients.size,
    boardsTouched: boards.size,
    completedByStatus,
    jobsCompleted,
    receivedTimestamps: receivedInWindow.length,
    completedTimestamps: jobsCompleted,
    turnaroundSample,
    turnaroundAvgDays: turnaroundSample > 0 ? Number((turnaroundSum / turnaroundSample).toFixed(1)) : null,
    completedDateAvailable,
    busiestClient,
  };
}

export async function fetchOverviewStatCards(
  _supabase: SupabaseClient,
  { organizationId, range, boardIds = null }: OverviewStatCardsOptions,
): Promise<StatCardsResult & { generatedAt: string; todayIST: string; boardsWithoutUploadMapping: Array<{ board_id: string; board_name: string }>; missingReceivedDateCount: number }> {
  const scope = await getLiveJobScope(organizationId);
  let jobs = scope.jobs;
  if (boardIds && boardIds.length > 0) {
    const allowed = new Set(boardIds);
    jobs = jobs.filter((j) => allowed.has(j.board_id));
  }

  const bounds = await fetchDataBounds(_supabase, organizationId, null);
  const window = narrowAllTimeRange(range, bounds);
  const prior = priorPeriod(window);

  const current = aggregateWindow(jobs, window.from, window.to);
  const priorAgg = aggregateWindow(jobs, prior.from, prior.to);
  const currentTopClientPriorCount = current.busiestClient
    ? jobs.filter((j) => isJobReceivedInRange(j, prior.from, prior.to) && (j.client_id ?? (j.client_unmatched ? `unmatched:${j.client_raw ?? j.record_id}` : null)) === current.busiestClient!.clientId).length
    : 0;

  const comparison: PeriodComparison = { current, prior: priorAgg, currentTopClientPriorCount };
  const coverage = computeCoverage(jobs, window.from, window.to);
  const cards = buildStatCards(comparison, {
    id: window.id,
    label: window.label,
    from: window.from,
    to: window.to,
    days: window.days,
    priorFrom: prior.from,
    priorTo: prior.to,
  }, coverage);

  return {
    ...cards,
    generatedAt: scope.generatedAt,
    todayIST: scope.todayIST,
    boardsWithoutUploadMapping: scope.boardsWithoutUploadMapping,
    missingReceivedDateCount: scope.missingReceivedDate.length,
  };
}
