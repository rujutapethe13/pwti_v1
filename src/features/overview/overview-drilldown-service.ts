import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getLiveJobScope, isCompletedUploaded, isJobReceivedInRange, completedUploadedJobs, effectiveClientLabel, type LiveJobRow } from "@/features/client-360/live-job-scope";
import { fetchDataBounds } from "@/features/overview/data-bounds";
import { narrowAllTimeRange, priorPeriod, type ResolvedTimeRange } from "@/features/overview/time-range";
import { normalizeJobType } from "@/features/overview/volume-breakdown";
import { normalizeClientName } from "@/features/overview/stat-cards";

export interface OverviewDrilldownItem {
  item_id: string;
  job_name: string;
  client: string | null;
  workspace_id: string;
  workspace_name: string;
  board_id: string;
  board_slug: string | null;
  board_name: string;
  group_name: string | null;
  job_type: string | null;
  status: string | null;
  assignee_name: string | null;
  received_at: string | null;
  completed_date: string | null;
  turnaround_days: number | null;
  due_date: string | null;
  days_from_today: number | null;
  bucket: string;
  priority: string | null;
  sku_volume: number;
  is_finished: boolean;
  assigned_to_me: boolean;
  client_unmatched: boolean;
  client_raw: string | null;
  client_column_label: string | null;
}

export interface OverviewDrilldownPayload {
  range: { id: string; label: string; from: string; to: string; days: number };
  today: string;
  periodItems: OverviewDrilldownItem[];
  todayItems: OverviewDrilldownItem[];
  overdueItems: OverviewDrilldownItem[];
  upcomingItems: OverviewDrilldownItem[];
  boardsWithoutDueDate: Array<{ board_id: string; board_name: string }>;
  boardsWithCompletionDate: Array<{ board_id: string; board_name: string; column_label: string }>;
  boardsWithoutUploadDate: Array<{ board_id: string; board_name: string }>;
  boardsWithoutUploadMapping: Array<{ board_id: string; board_name: string }>;
  missingReceivedDate: Array<{ record_id: string; board_id: string; board_name: string; title: string; client_display: string | null }>;
  unmatchedClients: ReturnType<typeof getLiveJobScope> extends Promise<infer R> ? R extends { unmatchedClients: infer U } ? U : never : never;
  aliasConflicts: ReturnType<typeof getLiveJobScope> extends Promise<infer R> ? R extends { aliasConflicts: infer U } ? U : never : never;
  /** Completed (uploaded) jobs in the window: same list the KPI card counts. */
  completedItems: OverviewDrilldownItem[];
  resolvedSummary: {
    jobsReceived: number;
    jobsCompleted: number;
    clientsActive: number;
    priorClientsActive: number;
    boardsTouched: number;
    busiestClient: { name: string; count: number; priorCount: number } | null;
    turnaroundAvgDays: number | null;
    turnaroundSample: number;
    turnaroundExcluded: number;
    completedWithUpload: number;
    /** Completed jobs split by where their received date falls relative to the window. */
    completedReconciliation: {
      total: number;
      receivedInPeriod: number;
      receivedEarlier: number;
      noReceivedDate: number;
    };
    priorJobsReceived: number;
    priorJobsCompleted: number;
    priorBoardsTouched: number;
    priorTurnaroundAvgDays: number | null;
    priorTurnaroundSample: number;
    jobTypeSlices: Array<{ key: string; label: string; jobs: number; percentage: number }>;
  };
  generatedAt: string;
}

function diffDays(targetISO: string, baseISO: string): number {
  const [ty, tm, td] = targetISO.split("-").map(Number);
  const [by, bm, bd] = baseISO.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(by, bm - 1, bd)) / 86400000);
}

function computeDueBucket(dueISO: string | null, todayISO: string): { daysFromToday: number | null; bucket: string } {
  if (!dueISO) return { daysFromToday: null, bucket: "No due date" };
  const diff = diffDays(dueISO, todayISO);
  if (diff < 0) return { daysFromToday: diff, bucket: "Overdue" };
  if (diff === 0) return { daysFromToday: 0, bucket: "Due today" };
  if (diff === 1) return { daysFromToday: 1, bucket: "Tomorrow" };
  if (diff <= 7) return { daysFromToday: diff, bucket: "This week" };
  return { daysFromToday: diff, bucket: "Later" };
}

async function getCurrentUserHints() {
  try {
    const sessionClient = await createClient();
    const { data: { user } } = await sessionClient.auth.getUser();
    return {
      id: user?.id ?? null,
      email: user?.email?.toLowerCase() ?? null,
      name: (user?.user_metadata?.full_name as string | undefined)?.toLowerCase() ?? null,
    };
  } catch {
    return { id: null, email: null, name: null };
  }
}

function toItem(job: LiveJobRow, todayIST: string, user: { id: string | null; email: string | null; name: string | null }): OverviewDrilldownItem {
  const received_at = job.received_date;
  const completed_date = job.upload_date;
  let turnaround_days: number | null = null;
  if (received_at && completed_date) {
    const diff = diffDays(completed_date, received_at);
    if (diff >= 0) turnaround_days = diff;
  }
  const due_date = job.due_date;
  const { daysFromToday, bucket } = computeDueBucket(due_date, todayIST);
  const is_finished = isCompletedUploaded(job) || job.status_class === "completed";
  const assignee = job.assignee ?? null;
  const assigned_to_me = Boolean(assignee && ((user.id && assignee === user.id) || (user.email && assignee.toLowerCase().includes(user.email)) || (user.name && assignee.toLowerCase().includes(user.name))));
  return {
    item_id: job.record_id,
    job_name: job.title,
    client: normalizeClientName(effectiveClientLabel(job)),
    workspace_id: job.workspace_id ?? "",
    workspace_name: job.workspace_name ?? "Workspace",
    board_id: job.board_id,
    board_slug: job.board_slug,
    board_name: job.board_name,
    group_name: job.group_name,
    job_type: normalizeJobType(job.job_type ?? "") || null,
    status: job.status ?? (completed_date ? "Uploaded" : "In Progress"),
    assignee_name: assignee,
    received_at,
    completed_date,
    turnaround_days,
    due_date,
    days_from_today: daysFromToday,
    bucket,
    priority: null,
    sku_volume: job.sku_count ?? job.image_count ?? 1,
    is_finished,
    assigned_to_me,
    client_unmatched: job.client_unmatched ?? false,
    client_raw: job.client_raw,
    client_column_label: job.client_column?.label ?? null,
  };
}

export async function fetchOverviewDrilldown(
  _supabase: SupabaseClient,
  options: { organizationId: string; range: ResolvedTimeRange; boardIds?: string[] | null },
): Promise<OverviewDrilldownPayload> {
  const { organizationId, range, boardIds = null } = options;
  const [scope, user] = await Promise.all([getLiveJobScope(organizationId), getCurrentUserHints()]);
  const bounds = await fetchDataBounds(_supabase, organizationId, null);
  const window = narrowAllTimeRange(range, bounds);
  const todayIST = scope.todayIST;

  let jobs = scope.jobs;
  if (boardIds && boardIds.length > 0) {
    const allowed = new Set(boardIds);
    jobs = jobs.filter((j) => allowed.has(j.board_id));
  }

  // Completed is driven only by boards that map an upload date column. Boards
  // without a mapping are excluded from the count and listed in the footnote.
  const unmappedBoards = new Set(scope.boardsWithoutUploadMapping.map((b) => b.board_id));
  const mappedJobs = jobs.filter((j) => !unmappedBoards.has(j.board_id));

  const allItems = jobs.map((j) => toItem(j, todayIST, user));
  const periodJobs = jobs.filter((j) => isJobReceivedInRange(j, window.from, window.to));
  const periodItems = periodJobs.map((j) => toItem(j, todayIST, user)).sort((a, b) => (b.received_at ?? "").localeCompare(a.received_at ?? ""));

  const todayItems = allItems.filter((i) => i.received_at === todayIST || (!i.is_finished && i.due_date === todayIST));
  const overdueItems = allItems.filter((i) => !i.is_finished && i.days_from_today !== null && i.days_from_today < 0);
  const upcomingItems = allItems.filter((i) => !i.is_finished && i.days_from_today !== null && i.days_from_today > 0 && i.days_from_today <= 7);

  const priorWin = priorPeriod(window);
  const priorJobs = jobs.filter((j) => isJobReceivedInRange(j, priorWin.from, priorWin.to));

  const countClients = (arr: LiveJobRow[]) => {
    const set = new Set<string>();
    const map = new Map<string, number>();
    for (const j of arr) {
      const id = j.client_id ?? (j.client_unmatched ? `unmatched:${j.client_raw ?? j.record_id}` : null);
      if (!id) continue;
      set.add(id);
      map.set(id, (map.get(id) ?? 0) + 1);
    }
    return { set, map };
  };

  const curClients = countClients(periodJobs);
  const priorClients = countClients(priorJobs);
  const clientNameFor = (id: string) => {
    const j = periodJobs.find((x) => (x.client_id ?? (x.client_unmatched ? `unmatched:${x.client_raw ?? x.record_id}` : null)) === id) || priorJobs.find((x) => (x.client_id ?? (x.client_unmatched ? `unmatched:${x.client_raw ?? x.record_id}` : null)) === id);
    return normalizeClientName(j ? effectiveClientLabel(j) : null) ?? "Client";
  };
  const sortedClients = [...curClients.map.entries()].sort((a, b) => b[1] - a[1] || clientNameFor(a[0]).localeCompare(clientNameFor(b[0])));
  const busiestClient = sortedClients[0] ? { name: clientNameFor(sortedClients[0][0]), count: sortedClients[0][1], priorCount: priorClients.map.get(sortedClients[0][0]) ?? 0 } : null;

  const turnaroundVals = periodJobs.map((j) => {
    if (!j.received_date || !j.upload_date) return null;
    const d = diffDays(j.upload_date, j.received_date);
    return d >= 0 ? d : null;
  }).filter((v): v is number => v != null);
  const priorTurnVals = priorJobs.map((j) => {
    if (!j.received_date || !j.upload_date) return null;
    const d = diffDays(j.upload_date, j.received_date);
    return d >= 0 ? d : null;
  }).filter((v): v is number => v != null);

  const currentCompleted = completedUploadedJobs(mappedJobs, window.from, window.to);
  const priorCompleted = completedUploadedJobs(mappedJobs, priorWin.from, priorWin.to);
  const jobsCompleted = currentCompleted.length;
  const priorJobsCompleted = priorCompleted.length;
  const completedWithUpload = jobsCompleted;

  const completedReceivedInPeriod = currentCompleted.filter((j) =>
    isJobReceivedInRange(j, window.from, window.to),
  ).length;
  const completedNoReceivedDate = currentCompleted.filter((j) => !j.received_date).length;
  const completedReceivedEarlier =
    jobsCompleted - completedReceivedInPeriod - completedNoReceivedDate;

  const typeCounts = new Map<string, number>();
  for (const j of periodJobs) {
    const key = (normalizeJobType(j.job_type ?? "") || "Unclassified").trim() || "Unclassified";
    typeCounts.set(key, (typeCounts.get(key) ?? 0) + 1);
  }
  const totalPeriodJobs = periodJobs.length;
  const jobTypeSlices = [...typeCounts.entries()].sort((a, b) => b[1] - a[1]).map(([label, count]) => ({
    key: label === "Unclassified" ? "" : label,
    label,
    jobs: count,
    percentage: totalPeriodJobs > 0 ? (count / totalPeriodJobs) * 100 : 0,
  }));

  return {
    range: { id: window.id, label: window.label, from: window.from, to: window.to, days: window.days },
    today: todayIST,
    periodItems,
    completedItems: currentCompleted.map((j) => toItem(j, todayIST, user)).sort((a, b) => (b.completed_date ?? "").localeCompare(a.completed_date ?? "")),
    todayItems,
    overdueItems,
    upcomingItems,
    boardsWithoutDueDate: scope.boardsWithoutDueDate,
    boardsWithCompletionDate: scope.boardsWithUploadDate,
    boardsWithoutUploadDate: scope.boardsWithoutUploadDate,
    boardsWithoutUploadMapping: scope.boardsWithoutUploadMapping,
    missingReceivedDate: scope.missingReceivedDate,
    unmatchedClients: scope.unmatchedClients as any,
    aliasConflicts: scope.aliasConflicts as any,
    resolvedSummary: {
      jobsReceived: totalPeriodJobs,
      jobsCompleted,
      clientsActive: curClients.set.size,
      priorClientsActive: priorClients.set.size,
      boardsTouched: new Set(periodJobs.map((j) => j.board_id)).size,
      busiestClient,
      turnaroundAvgDays: turnaroundVals.length ? Number((turnaroundVals.reduce((a, b) => a + b, 0) / turnaroundVals.length).toFixed(1)) : null,
      turnaroundSample: turnaroundVals.length,
      turnaroundExcluded: periodJobs.length - turnaroundVals.length,
      completedWithUpload,
      completedReconciliation: {
        total: jobsCompleted,
        receivedInPeriod: completedReceivedInPeriod,
        receivedEarlier: completedReceivedEarlier,
        noReceivedDate: completedNoReceivedDate,
      },
      priorJobsReceived: priorJobs.length,
      priorJobsCompleted,
      priorBoardsTouched: new Set(priorJobs.map((j) => j.board_id)).size,
      priorTurnaroundAvgDays: priorTurnVals.length ? Number((priorTurnVals.reduce((a, b) => a + b, 0) / priorTurnVals.length).toFixed(1)) : null,
      priorTurnaroundSample: priorTurnVals.length,
      jobTypeSlices,
    },
    generatedAt: scope.generatedAt,
  };
}
