import "server-only";
import { getLiveJobScope } from "./live-job-scope";
import type { LiveJobRow } from "./live-job-scope";
import { mapStatus } from "./status-mapping";

export interface ClientAnalyticsDateRange { from: string; to: string; }

export interface ClientAnalytics {
  kpis: {
    totalJobs: number;
    inProgress: number;
    done: number;
    totalSkus: number;
    totalImages: number;
    avgTurnaroundDays: number | null;
    shareOfStudioVolume: number;
  };
  statusBreakdown: Array<{ status: string; count: number }>;
  jobTypeMix: Array<{ jobType: string; count: number }>;
  jobsByBoard: Array<{ boardId: string; boardName: string; volume: number }>;
  skuByMonth: Array<{ month: string; skus: number }>;
  receivedVsCompletedByMonth: Array<{ month: string; received: number; completed: number }>;
  turnaroundByMonth: Array<{ month: string; avgDays: number | null }>;
  studioAvgTurnaroundDays: number | null;
  workloadByOwner: Array<{ owner: string; count: number }>;
  recentJobs: Array<{ name: string; board: string; jobType: string | null; receivedDate: string | null; uploadDate: string | null; status: string | null }>;
  excluded: { noReceivedDate: number; noUploadDate: number; brokenLinks: number };
}

const EMPTY: ClientAnalytics = {
  kpis: { totalJobs: 0, inProgress: 0, done: 0, totalSkus: 0, totalImages: 0, avgTurnaroundDays: null, shareOfStudioVolume: 0 },
  statusBreakdown: [], jobTypeMix: [], jobsByBoard: [], skuByMonth: [], receivedVsCompletedByMonth: [],
  turnaroundByMonth: [], studioAvgTurnaroundDays: null, workloadByOwner: [], recentJobs: [],
  excluded: { noReceivedDate: 0, noUploadDate: 0, brokenLinks: 0 },
};

const key = (value: string | null | undefined) => (value ?? "").trim().toLowerCase().replace(/[\W_]+/g, " ").replace(/\s+/g, " ").trim();
const monthKey = (date: string) => date.slice(0, 7);
const inRange = (date: string | null, range?: ClientAnalyticsDateRange | null) => !range || (!!date && date >= range.from && date <= range.to);

export function aggregateClientAnalytics(clientId: string, jobs: LiveJobRow[], dateRange?: ClientAnalyticsDateRange | null): ClientAnalytics {
  if (!clientId) return EMPTY;
  const selected = jobs.filter((job) => job.client_id === clientId && (!dateRange || inRange(job.received_date, dateRange) || inRange(job.upload_date, dateRange)));
  const studioJobs = jobs.filter((job) => !dateRange || inRange(job.received_date, dateRange) || inRange(job.upload_date, dateRange));
  const count = (values: string[], empty: string) => {
    const map = new Map<string, number>();
    for (const value of values) { const label = value.trim() || empty; map.set(label, (map.get(label) ?? 0) + 1); }
    return [...map.entries()].map(([label, total]) => ({ label, count: total })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  };
  const turnaround = selected.filter((j) => j.received_date && j.upload_date).map((j) => (Date.parse(j.upload_date!) - Date.parse(j.received_date!)) / 86400000).filter(Number.isFinite);
  const statusMap = new Map<string, number>();
  for (const j of selected) {
    const bucket = mapStatus(j.status);
    statusMap.set(bucket, (statusMap.get(bucket) ?? 0) + 1);
  }
  const status = [...statusMap.entries()].map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count || a.status.localeCompare(b.status));
  const jobType = count(selected.map((j) => j.job_type ?? ""), "No value").map((x) => ({ jobType: x.label, count: x.count }));
  const boardMap = new Map<string, { boardId: string; boardName: string; volume: number }>();
  const skuMap = new Map<string, number>();
  const receivedMap = new Map<string, { received: number; completed: number }>();
  const turnMap = new Map<string, number[]>();
  for (const j of selected) {
    const board = boardMap.get(j.board_id) ?? { boardId: j.board_id, boardName: j.board_name, volume: 0 };
    board.volume++; boardMap.set(j.board_id, board);
    if (j.sku_count != null && j.received_date) skuMap.set(monthKey(j.received_date), (skuMap.get(monthKey(j.received_date)) ?? 0) + j.sku_count);
    if (j.received_date) { const m = monthKey(j.received_date); const v = receivedMap.get(m) ?? { received: 0, completed: 0 }; v.received++; receivedMap.set(m, v); }
    if (j.upload_date) { const m = monthKey(j.upload_date); const v = receivedMap.get(m) ?? { received: 0, completed: 0 }; v.completed++; receivedMap.set(m, v); }
    if (j.received_date && j.upload_date) { const m = monthKey(j.upload_date); const days = (Date.parse(j.upload_date) - Date.parse(j.received_date)) / 86400000; if (Number.isFinite(days)) (turnMap.get(m) ?? (turnMap.set(m, []), turnMap.get(m)!)).push(days); }
  }
  const owner = count(selected.map((j) => j.assignee ?? ""), "Unassigned").map((x) => ({ owner: x.label, count: x.count }));
  const totalSkus = selected.reduce((n, j) => n + (j.sku_count ?? 0), 0);
  const totalImages = selected.reduce((n, j) => n + (j.image_count ?? 0), 0);
  const studioTurn = studioJobs.filter((j) => j.received_date && j.upload_date).map((j) => (Date.parse(j.upload_date!) - Date.parse(j.received_date!)) / 86400000).filter(Number.isFinite);
  return {
    kpis: { totalJobs: selected.length, inProgress: statusMap.get("In progress") ?? 0, done: statusMap.get("Completed") ?? 0, totalSkus, totalImages, avgTurnaroundDays: turnaround.length ? turnaround.reduce((a, b) => a + b, 0) / turnaround.length : null, shareOfStudioVolume: studioJobs.length ? (selected.length / studioJobs.length) * 100 : 0 },
    statusBreakdown: status, jobTypeMix: jobType,
    jobsByBoard: [...boardMap.values()].sort((a, b) => b.volume - a.volume || a.boardName.localeCompare(b.boardName)),
    skuByMonth: [...skuMap.entries()].sort().map(([month, skus]) => ({ month, skus })),
    receivedVsCompletedByMonth: [...receivedMap.entries()].sort().map(([month, values]) => ({ month, ...values })),
    turnaroundByMonth: [...turnMap.entries()].sort().map(([month, values]) => ({ month, avgDays: values.reduce((a, b) => a + b, 0) / values.length })),
    studioAvgTurnaroundDays: studioTurn.length ? studioTurn.reduce((a, b) => a + b, 0) / studioTurn.length : null,
    workloadByOwner: owner,
    recentJobs: [...selected].sort((a, b) => String(b.received_date ?? "").localeCompare(String(a.received_date ?? ""))).slice(0, 10).map((j) => ({ name: j.title, board: j.board_name, jobType: j.job_type, receivedDate: j.received_date, uploadDate: j.upload_date, status: j.status })),
    excluded: { noReceivedDate: selected.filter((j) => !j.received_date).length, noUploadDate: selected.filter((j) => !j.upload_date).length, brokenLinks: 0 },
  };
}

export async function getClientAnalytics(clientId: string, organizationId: string, boardIds?: string[] | null, dateRange?: ClientAnalyticsDateRange | null, includePracticeArchived = false): Promise<ClientAnalytics> {
  if (!clientId || !organizationId) return EMPTY;
  const scope = await getLiveJobScope(organizationId, { boardIds });
  return aggregateClientAnalytics(clientId, scope.jobs, dateRange);
}
