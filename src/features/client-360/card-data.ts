"use server";

import { getUserOrganizationId } from "@/lib/organization";
import { createServiceClient } from "@/lib/supabase/server";
import { getLiveJobScope, type LiveJobRow, normalizeClientKey } from "./live-job-scope";
import { resolveClientGroup, type ClientGroup } from "./client-group";
import {
  formatDateUI,
  isInvoicePending,
  statusBucketFromConfig,
  isCompletedJob,
} from "./card-types";
import type { CardResult, JobRow, MissingMapping } from "./card-types";

async function getOrgId(): Promise<string | null> {
  try {
    return await getUserOrganizationId();
  } catch {
    return null;
  }
}

function toDate(day: string | null): Date | null {
  if (!day) return null;
  const d = new Date(day + "T00:00:00+05:30");
  return isNaN(d.getTime()) ? null : d;
}

function toJobRow(
  j: LiveJobRow,
  paymentTermDays: number | null,
  paymentTermDaysOverride: number | null,
): JobRow {
  const receiveDate = toDate(j.received_date);
  const uploadDate = toDate(j.upload_date);
  const turnaroundDays =
    receiveDate && uploadDate
      ? Math.max(
          0,
          Math.round(
            (uploadDate.getTime() - receiveDate.getTime()) / (1000 * 60 * 60 * 24),
          ),
        )
      : null;
  return {
    recordId: j.record_id,
    boardId: j.board_id,
    boardName: j.board_name,
    title: j.title || j.batch_id || "Untitled job",
    batchId: j.batch_id || "",
    receiveDate,
    uploadDate,
    status: j.status || "Unspecified",
    statusBucket: statusBucketFromConfig(j.status || "Unspecified"),
    skuCount: j.sku_count,
    imageCount: j.image_count,
    invoiceAmount: null, // masked in live scope; no numeric amount exposed
    invoiceStatus: j.invoice_status || "",
    assignee: j.assignee || "",
    jobDate: j.received_date,
    jobType: j.job_type || "",
    turnaroundDays,
    paymentTermDays,
    paymentTermDaysOverride,
    alsoLinkedOn: j.also_linked_on,
  };
}

function buildMissingMappings(jobs: LiveJobRow[]): MissingMapping[] {
  // Best-effort: derive from jobs' known column presence per board.
  // Live scope already exposes board-level upload mapping metadata; callers that
  // need upload-specific messaging should use scope.boardsWithoutUploadMapping.
  return [];
}

// ── Per-client job classification ──────────────────────────────────────────────

export type NeedsReviewRow = {
  recordId: string;
  title: string;
  boardId: string;
  boardName: string;
  matchedVia: "Job name" | "Batch";
};

export type NotCountedRow = {
  recordId: string;
  title: string;
  boardId: string;
  boardName: string;
  reason: string;
};

export interface ClientJobClassification {
  counted: LiveJobRow[];
  needsReview: Array<{ job: LiveJobRow; matchedVia: "Job name" | "Batch" }>;
  notCounted: NotCountedRow[];
}

function clientNameKey(name: string | null | undefined): string {
  return String(name ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

function textTokens(text: string): string[] {
  return String(text).toLowerCase().split(/\W+/).filter((token) => token.length > 0);
}

/**
 * A blank-client row still "matches Hokipo" when the client name appears in
 * another column (job name / batch). Those rows are candidates for review:
 * shown, matched column named, but not counted until confirmed.
 */
function matchClientElsewhere(
  job: Pick<LiveJobRow, "title" | "batch_id">,
  clientKey: string,
  knownBatchIds: Set<string>
): "Job name" | "Batch" | null {
  if (!clientKey) return null;
  if (textTokens(job.title ?? "").includes(clientKey)) return "Job name";
  if (job.batch_id && textTokens(job.batch_id).includes(clientKey)) return "Batch";
  // Also match if the batch_id is known to belong to this client (from other counted jobs or job-name matches)
  if (job.batch_id && knownBatchIds.has(job.batch_id)) return "Batch";
  return null;
}

export async function classifyClientJobs(jobs: LiveJobRow[], clientId: string, group: ClientGroup): Promise<ClientJobClassification> {
  const clientKey = clientNameKey(group.canonicalName);
  const counted: LiveJobRow[] = [];
  const needsReview: ClientJobClassification["needsReview"] = [];
  const notCounted: NotCountedRow[] = [];
  const ids = group.ids;
  
  // First pass: identify counted jobs and collect their batch_ids
  // Also collect batch_ids from jobs that match via Job name (title contains client)
  const knownBatchIds = new Set<string>();
  const jobNameMatched: LiveJobRow[] = [];
  
  for (const job of jobs) {
    const rawKey = clientNameKey(job.client_raw);
    if ((job.client_id && ids.has(job.client_id)) || rawKey === clientKey) {
      counted.push(job);
      if (job.batch_id) knownBatchIds.add(job.batch_id);
    } else if (textTokens(job.title ?? "").includes(clientKey)) {
      // This job matches via Job name - it will be needsReview, but its batch_id is known
      jobNameMatched.push(job);
      if (job.batch_id) knownBatchIds.add(job.batch_id);
    }
  }
  
  // Second pass: classify remaining jobs
  for (const job of jobs) {
    // Skip already counted jobs
    if (counted.some(c => c.record_id === job.record_id)) continue;
    // Skip already job-name-matched jobs (they'll be added as needsReview)
    if (jobNameMatched.some(j => j.record_id === job.record_id)) continue;
    
    const via = matchClientElsewhere(job, clientKey, knownBatchIds);
    if (via) {
      needsReview.push({ job, matchedVia: via });
      continue;
    }
    notCounted.push({
      recordId: job.record_id,
      title: job.title,
      boardId: job.board_id,
      boardName: job.board_name,
      reason: job.client_id ? "Belongs to another client" : job.client_raw ? "No matching client" : "No client value",
    });
  }
  
  // Add job-name-matched jobs to needsReview
  for (const job of jobNameMatched) {
    needsReview.push({ job, matchedVia: "Job name" });
  }
  
  return { counted, needsReview, notCounted };
}

function boardsFromJobs(jobs: JobRow[]): Array<{ boardId: string; boardName: string; jobCount: number; lastUpdated: string | null }> {
  const byBoard = new Map<string, { boardName: string; count: number; lastUpdated: string | null }>();
  for (const j of jobs) {
    const cur = byBoard.get(j.boardId) ?? { boardName: j.boardName, count: 0, lastUpdated: null };
    cur.count += 1;
    const cand = j.uploadDate ?? j.receiveDate;
    if (cand && (!cur.lastUpdated || cand.getTime() > new Date(cur.lastUpdated).getTime())) {
      cur.lastUpdated = cand.toISOString();
    }
    byBoard.set(j.boardId, cur);
  }
  return Array.from(byBoard.entries()).map(([boardId, v]) => ({
    boardId,
    boardName: v.boardName,
    jobCount: v.count,
    lastUpdated: v.lastUpdated ? formatDateUI(v.lastUpdated) : null,
  }));
}

async function loadPaymentTermOverrides(
  organizationId: string,
  recordIds: string[],
): Promise<Map<string, number>> {
  const overrides = new Map<string, number>();
  if (recordIds.length === 0) return overrides;
  const supabase = await createServiceClient();
  const chunkSize = 500;
  for (let i = 0; i < recordIds.length; i += chunkSize) {
    const chunk = recordIds.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("records")
      .select("id, payment_term_days")
      .eq("organization_id", organizationId)
      .in("id", chunk);
    if (error) {
      // Column may not be migrated yet; inheritance from the client still works.
      if (!/payment_term_days/i.test(error.message)) {
        console.warn("[client-360] failed to load job payment terms:", error.message);
      }
      return overrides;
    }
    for (const row of data ?? []) {
      if (typeof row.payment_term_days === "number") {
        overrides.set(String(row.id), row.payment_term_days as number);
      }
    }
  }
  return overrides;
}

async function getClientJobs(clientId: string): Promise<{
  jobs: JobRow[];
  raw: LiveJobRow[];
  scope: Awaited<ReturnType<typeof getLiveJobScope>> | null;
  clientPaymentTermDays: number | null;
  error: string | null;
  needsReview: NeedsReviewRow[];
  notCounted: NotCountedRow[];
}> {
  const orgId = await getOrgId();
  if (!orgId) {
    return {
      jobs: [],
      raw: [],
      scope: null,
      clientPaymentTermDays: null,
      error: "Unable to determine organization",
      needsReview: [],
      notCounted: [],
    };
  }
  const scope = await getLiveJobScope(orgId);
  // Resolve alias-group siblings exactly like the profile action so the card,
  // tile and drawer always report the same client job count.
  const group = await resolveClientGroup(orgId, clientId);
  const classification = await classifyClientJobs(scope.jobs, clientId, group);
  const matched = classification.counted;
  const overrides = await loadPaymentTermOverrides(
    orgId,
    matched.map((j) => j.record_id),
  );
  const jobs = matched.map((j) => {
    const override = overrides.get(j.record_id) ?? null;
    return toJobRow(j, override ?? group.paymentTermDays, override);
  });
  return {
    jobs,
    raw: matched,
    scope,
    clientPaymentTermDays: group.paymentTermDays,
    error: null,
    needsReview: classification.needsReview.map(({ job, matchedVia }) => ({
      recordId: job.record_id,
      title: job.title,
      boardId: job.board_id,
      boardName: job.board_name,
      matchedVia,
    })),
    notCounted: classification.notCounted,
  };
}

function resultBase(jobs: JobRow[], raw: LiveJobRow[], scope: any, needsReview: NeedsReviewRow[] = [], notCounted: NotCountedRow[] = []): Pick<CardResult<any>, "boardsContributing" | "missingMappings" | "unmatchedCount"> & { needsReview: NeedsReviewRow[]; notCounted: NotCountedRow[]; skippedBoards: Array<{ boardId: string; boardName: string; reason: string }> } {
  return {
    boardsContributing: boardsFromJobs(jobs),
    missingMappings: [] as MissingMapping[],
    unmatchedCount: scope?.unmatchedClients?.length ?? 0,
    needsReview,
    notCounted,
    // Boards skipped by the live scope (archived, inactive, practice) are
    // reported explicitly instead of being dropped silently.
    skippedBoards: scope?.skippedBoards ?? [],
  };
}

// total-jobs
export async function getTotalProductionJobs(clientId: string): Promise<CardResult<{ jobs: number; jobsByMonth: Array<{ month: string; count: number }> }>> {
  const { jobs, raw, scope, error, needsReview, notCounted } = await getClientJobs(clientId);
  if (error) return { data: null, error, boardsContributing: [], missingMappings: [], unmatchedCount: 0 };

  const byMonth = new Map<string, number>();
  for (const j of jobs) {
    const d = j.receiveDate ?? j.uploadDate;
    if (!d) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    byMonth.set(key, (byMonth.get(key) ?? 0) + 1);
  }
  const jobsByMonth = Array.from(byMonth.entries())
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => a.month.localeCompare(b.month));

  return {
    data: { jobs: jobs.length, jobsByMonth },
    error: null,
    ...resultBase(jobs, raw, scope, needsReview, notCounted),
  };
}

// batches-in-progress
export async function getBatchesInProgress(clientId: string): Promise<CardResult<{ batches: Array<{ batchId: string; jobs: number; done: number; pending: number; oldestReceived: Date | null; daysWaiting: number | null; assignee: string }> }>> {
  const { jobs, raw, scope, error, needsReview, notCounted } = await getClientJobs(clientId);
  if (error) return { data: null, error, boardsContributing: [], missingMappings: [], unmatchedCount: 0 };

  const byBatch = new Map<string, { batchId: string; jobs: JobRow[]; assignee: string }>();
  for (const j of jobs) {
    const key = j.batchId || `(no batch)`;
    if (!byBatch.has(key)) byBatch.set(key, { batchId: key, jobs: [], assignee: j.assignee });
    byBatch.get(key)!.jobs.push(j);
  }

  const batches = Array.from(byBatch.values()).map((b) => {
    const done = b.jobs.filter(isCompletedJob).length;
    const pending = b.jobs.filter((j) => !isCompletedJob(j)).length;
    const oldest = b.jobs
      .map((j) => j.receiveDate ?? j.uploadDate)
      .filter((d): d is Date => d !== null)
      .sort((a, b) => a.getTime() - b.getTime())[0];
    const daysWaiting = oldest
      ? Math.max(0, Math.floor((Date.now() - oldest.getTime()) / (1000 * 60 * 60 * 24)))
      : null;
    return {
      batchId: b.batchId,
      jobs: b.jobs.length,
      done,
      pending,
      oldestReceived: oldest ?? null,
      daysWaiting,
      assignee: b.assignee || "Unassigned",
    };
  });

  return { data: { batches }, error: null, ...resultBase(jobs, raw, scope, needsReview, notCounted) };
}

// average-delivery-time
export async function getAverageDeliveryTime(clientId: string): Promise<CardResult<{ avgDays: number | null; counted: number; skipped: number; byMonth: Array<{ month: string; avgDays: number }>; histogram: Array<{ days: string; count: number }>; slowest: JobRow[] }>> {
  const { jobs, raw, scope, error, needsReview, notCounted } = await getClientJobs(clientId);
  if (error) return { data: null, error, boardsContributing: [], missingMappings: [], unmatchedCount: 0 };

  const withDates = jobs.filter((j) => j.receiveDate && j.uploadDate);
  const skipped = jobs.length - withDates.length;

  let avgDays: number | null = null;
  if (withDates.length > 0) {
    const total = withDates.reduce(
      (sum, j) => sum + (j.uploadDate!.getTime() - j.receiveDate!.getTime()) / (1000 * 60 * 60 * 24),
      0,
    );
    avgDays = total / withDates.length;
  }

  const byMonth = new Map<string, { sum: number; count: number }>();
  for (const j of withDates) {
    const d = j.receiveDate!;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const days = (j.uploadDate!.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
    const cur = byMonth.get(key) ?? { sum: 0, count: 0 };
    cur.sum += days;
    cur.count += 1;
    byMonth.set(key, cur);
  }
  const monthlyAvg = Array.from(byMonth.entries())
    .map(([month, v]) => ({ month, avgDays: v.sum / v.count }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const histogram = [
    { days: "1 day", count: 0 },
    { days: "2 days", count: 0 },
    { days: "3 days", count: 0 },
    { days: "4+ days", count: 0 },
  ];
  for (const j of withDates) {
    const days = Math.ceil((j.uploadDate!.getTime() - j.receiveDate!.getTime()) / (1000 * 60 * 60 * 24));
    if (days <= 1) histogram[0].count += 1;
    else if (days === 2) histogram[1].count += 1;
    else if (days === 3) histogram[2].count += 1;
    else histogram[3].count += 1;
  }

  const slowest = [...withDates]
    .sort(
      (a, b) =>
        (b.uploadDate!.getTime() - b.receiveDate!.getTime()) -
        (a.uploadDate!.getTime() - a.receiveDate!.getTime()),
    )
    .slice(0, 10);

  return {
    data: { avgDays, counted: withDates.length, skipped, byMonth: monthlyAvg, histogram, slowest },
    error: null,
    ...resultBase(jobs, raw, scope, needsReview, notCounted),
  };
}

// skus-processed
export async function getSkusProcessed(clientId: string): Promise<CardResult<{ totalSkus: number; totalImages: number; byMonth: Array<{ month: string; skus: number }>; byBatch: Array<{ batchId: string; skus: number; images: number }> }>> {
  const { jobs, raw, scope, error, needsReview, notCounted } = await getClientJobs(clientId);
  if (error) return { data: null, error, boardsContributing: [], missingMappings: [], unmatchedCount: 0 };

  const totalSkus = jobs.reduce((sum, j) => sum + (j.skuCount ?? 0), 0);
  const totalImages = jobs.reduce((sum, j) => sum + (j.imageCount ?? 0), 0);

  const byMonth = new Map<string, number>();
  const byBatch = new Map<string, { skus: number; images: number }>();
  for (const j of jobs) {
    const d = j.receiveDate ?? j.uploadDate;
    if (d) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      byMonth.set(key, (byMonth.get(key) ?? 0) + (j.skuCount ?? 0));
    }
    const key = j.batchId || "(no batch)";
    const cur = byBatch.get(key) ?? { skus: 0, images: 0 };
    cur.skus += j.skuCount ?? 0;
    cur.images += j.imageCount ?? 0;
    byBatch.set(key, cur);
  }

  return {
    data: {
      totalSkus,
      totalImages,
      byMonth: Array.from(byMonth.entries()).map(([month, skus]) => ({ month, skus })).sort((a, b) => a.month.localeCompare(b.month)),
      byBatch: Array.from(byBatch.entries()).map(([batchId, v]) => ({ batchId, ...v })),
    },
    error: null,
    ...resultBase(jobs, raw, scope, needsReview, notCounted),
  };
}

// invoiced
export async function getInvoiced(clientId: string): Promise<CardResult<{ total: number; byMonth: Array<{ month: string; amount: number }>; statusSplit: Array<{ status: string; count: number; amount: number }>; hasInvoiceColumns: boolean; invoices: Array<{ id: string; jobOrBatch: string; amount: number; status: string }> }>> {
  const { jobs, raw, scope, error, needsReview, notCounted } = await getClientJobs(clientId);
  if (error) return { data: null, error, boardsContributing: [], missingMappings: [], unmatchedCount: 0 };

  // Amounts are masked/unavailable in live scope; report counts/status without fabricating totals.
  const hasInvoiceColumns = raw.some((j) => j.invoice_status != null);
  const invoices = jobs.map((j) => ({
    id: j.recordId,
    jobOrBatch: j.batchId || j.title,
    amount: 0,
    status: j.invoiceStatus || "Not entered",
  }));
  const total = 0;

  const byMonth = new Map<string, number>();
  const statusSplit = new Map<string, { count: number; amount: number }>();
  for (const inv of invoices) {
    const d = jobs.find((j) => j.recordId === inv.id)?.receiveDate ?? jobs.find((j) => j.recordId === inv.id)?.uploadDate;
    if (d) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      byMonth.set(key, (byMonth.get(key) ?? 0) + 0);
    }
    const cur = statusSplit.get(inv.status) ?? { count: 0, amount: 0 };
    cur.count += 1;
    cur.amount += 0;
    statusSplit.set(inv.status, cur);
  }

  return {
    data: {
      total,
      byMonth: Array.from(byMonth.entries()).map(([month, amount]) => ({ month, amount })).sort((a, b) => a.month.localeCompare(b.month)),
      statusSplit: Array.from(statusSplit.entries()).map(([status, v]) => ({ status, ...v })),
      hasInvoiceColumns,
      invoices,
    },
    error: null,
    ...resultBase(jobs, raw, scope, needsReview, notCounted),
  };
}

// next-best-actions
export async function getNextBestActions(clientId: string): Promise<CardResult<{ actions: Array<{ id: string; title: string; reason: string; jobs: Array<{ recordId: string; title: string; boardName: string; batchId: string }> }> }>> {
  const { jobs, raw, scope, error, needsReview, notCounted } = await getClientJobs(clientId);
  if (error) return { data: null, error, boardsContributing: [], missingMappings: [], unmatchedCount: 0 };

  const pendingByBoardBatch = new Map<string, JobRow[]>();
  for (const j of jobs) {
    if (isCompletedJob(j)) continue;
    const key = `${j.boardId}::${j.batchId || "(no batch)"}`;
    if (!pendingByBoardBatch.has(key)) pendingByBoardBatch.set(key, []);
    pendingByBoardBatch.get(key)!.push(j);
  }

  const actions = Array.from(pendingByBoardBatch.entries())
    .map(([key, js]) => {
      const [boardId, batchId] = key.split("::");
      const boardName = js[0]?.boardName || "";
      return {
        id: `nba-${boardId}-${batchId.replace(/\s+/g, "_")}`,
        title: batchId === "(no batch)" ? `Review jobs on ${boardName}` : `Review batch ${batchId}`,
        reason: `${js.length} job${js.length !== 1 ? "s" : ""} not yet done`,
        jobs: js.map((j) => ({ recordId: j.recordId, title: j.title || "Untitled job", boardName: j.boardName, batchId: j.batchId })),
      };
    })
    .sort((a, b) => b.jobs.length - a.jobs.length)
    .slice(0, 5);

  return { data: { actions }, error: null, ...resultBase(jobs, raw, scope, needsReview, notCounted) };
}

// monthly-throughput
export async function getMonthlyThroughput(clientId: string): Promise<CardResult<{ months: Array<{ month: string; jobs: number; skus: number; amount: number }> }>> {
  const { jobs, raw, scope, error, needsReview, notCounted } = await getClientJobs(clientId);
  if (error) return { data: null, error, boardsContributing: [], missingMappings: [], unmatchedCount: 0 };

  const byMonth = new Map<string, { jobs: number; skus: number; amount: number }>();
  for (const j of jobs) {
    const d = j.receiveDate ?? j.uploadDate;
    if (!d) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const cur = byMonth.get(key) ?? { jobs: 0, skus: 0, amount: 0 };
    cur.jobs += 1;
    cur.skus += j.skuCount ?? 0;
    cur.amount += 0;
    byMonth.set(key, cur);
  }

  return {
    data: {
      months: Array.from(byMonth.entries())
        .map(([month, v]) => ({ month, ...v }))
        .sort((a, b) => a.month.localeCompare(b.month)),
    },
    error: null,
    ...resultBase(jobs, raw, scope, needsReview, notCounted),
  };
}

export interface JobsDrawerBoard {
  boardId: string;
  boardName: string;
  jobCount: number;
  pendingCount: number;
}

export interface JobsDrawerPayload {
  total: number;
  boards: number;
  statusCounts: {
    inProgress: number;
    completed: number;
    pending: number;
  };
  jobs: JobRow[];
  boardsPending: JobsDrawerBoard[];
  clientPaymentTermDays: number | null;
}

/**
 * Single source of truth for the Studio Volume card, the Total Production Jobs
 * tile and the production-jobs drawer.
 */
export async function getJobsDrawer(
  clientId: string,
): Promise<CardResult<JobsDrawerPayload>> {
  const { jobs, raw, scope, clientPaymentTermDays, error, needsReview, notCounted } = await getClientJobs(clientId);
  if (error) {
    return {
      data: null,
      error,
      boardsContributing: [],
      missingMappings: [],
      unmatchedCount: 0,
    };
  }

  const completed = jobs.filter(
    isCompletedJob,
  );
  const inProgress = jobs.filter(
    (j) => !completed.includes(j) && j.statusBucket === "In progress",
  );
  const pending = jobs.filter(
    (j) => !completed.includes(j) && !inProgress.includes(j),
  );

  const boardMap = new Map<string, JobsDrawerBoard>();
  for (const job of jobs) {
    const entry =
      boardMap.get(job.boardId) ??
      {
        boardId: job.boardId,
        boardName: job.boardName,
        jobCount: 0,
        pendingCount: 0,
      };
    entry.jobCount += 1;
    if (isInvoicePending(job)) entry.pendingCount += 1;
    boardMap.set(job.boardId, entry);
  }
  // Needs-review rows (blank client matched elsewhere) are not counted in
  // totals, but their boards are still reported so no board is dropped.
  for (const row of needsReview) {
    if (!boardMap.has(row.boardId)) {
      boardMap.set(row.boardId, {
        boardId: row.boardId,
        boardName: row.boardName,
        jobCount: 0,
        pendingCount: 0,
      });
    }
  }
  const boardsPending = [...boardMap.values()].sort((a, b) =>
    a.boardName.localeCompare(b.boardName),
  );
  return {
    data: {
      total: jobs.length,
      boards: boardsPending.length,
      statusCounts: {
        inProgress: inProgress.length,
        completed: completed.length,
        pending: pending.length,
      },
      jobs,
      boardsPending,
      clientPaymentTermDays,
    },
    error: null,
    ...resultBase(jobs, raw, scope, needsReview, notCounted),
  };
}

export async function getJobsDetail(clientId: string, page: number = 1, pageSize: number = 50): Promise<CardResult<{ jobs: JobRow[]; total: number }>> {
  const { jobs, raw, scope, error, needsReview, notCounted } = await getClientJobs(clientId);
  if (error) return { data: null, error, boardsContributing: [], missingMappings: [], unmatchedCount: 0 };
  const total = jobs.length;
  const safePage = Math.max(1, page);
  const start = (safePage - 1) * pageSize;
  const paged = jobs.slice(start, start + pageSize);
  return { data: { jobs: paged, total }, error: null, ...resultBase(jobs, raw, scope, needsReview, notCounted) };
}

export async function boardsContributingList(
  _supabase: unknown,
  _orgId: string,
  _clientIds: string[],
  jobs: JobRow[],
): Promise<Array<{ boardId: string; boardName: string; jobCount: number; lastUpdated: string | null }>> {
  return boardsFromJobs(jobs);
}
