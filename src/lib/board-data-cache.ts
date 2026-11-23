/**
 * Shared board data layer.
 *
 * Fetch all boards / items once and share them across the Overview, Client 360,
 * Boards hub and Dashboard pages instead of re-fetching on every navigation.
 *
 * - A module-level TTL cache (default 3 minutes, within the 2-5 min window)
 *   keeps fetched data alive across page navigations in a long-running server
 *   (next start / next dev). React's `cache()` (used by getLiveJobScope) still
 *   dedupes within a single request.
 * - Only the columns actually needed are requested (name, client, status,
 *   received date, upload date, job type) — getLiveJobScope selects a fixed
 *   column set rather than whole items.
 * - All per-board fetches run in parallel via Promise.all inside getLiveJobScope.
 * - `timeApi` wraps every API/DB call with timing logs so the slowest call is
 *   visible in the console.
 * - `invalidateDataCache()` clears the cache, backing the "Synced just now"
 *   manual refresh button.
 */

import { createServiceClient } from "@/lib/supabase/server";
import { getUserOrganizationId } from "@/lib/organization";
import { getLiveJobScope, type LiveJobScopeResult } from "@/features/client-360/live-job-scope";

const DEFAULT_TTL_MS = 3 * 60 * 1000; // 3 minutes

interface CacheEntry<T> {
  data: T;
  ts: number;
}

class TtlCache<T> {
  private map = new Map<string, CacheEntry<T>>();
  constructor(private readonly ttlMs: number) {}
  get(key: string): T | null {
    const entry = this.map.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > this.ttlMs) {
      this.map.delete(key);
      return null;
    }
    return entry.data;
  }
  set(key: string, data: T): void {
    this.map.set(key, { data, ts: Date.now() });
  }
  invalidate(key?: string): void {
    if (key) this.map.delete(key);
    else this.map.clear();
  }
  size(): number {
    let n = 0;
    let now = Date.now();
    for (const [key, entry] of this.map) {
      if (now - entry.ts > this.ttlMs) { this.map.delete(key); continue; }
      n++;
    }
    return n;
  }
}

const scopeCache = new TtlCache<LiveJobScopeResult>(DEFAULT_TTL_MS);
const boardsCache = new TtlCache<Array<{ id: string; name: string; slug: string | null; workspace_id: string | null }>>(DEFAULT_TTL_MS);

/**
 * Time an async operation and log the duration. Failed calls are logged too so
 * the slowest (or failing) API call stands out.
 */
export async function timeApi<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  try {
    const data = await fn();
    console.log(`[perf] ${label} — ${Date.now() - start}ms`);
    return data;
  } catch (err) {
    console.log(`[perf] ${label} — FAILED after ${Date.now() - start}ms`);
    throw err;
  }
}

/**
 * Resolve the caller's organization, with timing.
 */
export async function resolveOrganizationId(): Promise<string | null> {
  return timeApi("resolve organization", getUserOrganizationId);
}

/**
 * Fetch the shared live job scope (all boards + items for the org), cached for
 * the TTL. This is the single source of truth shared across pages.
 *
 * Needed columns only: getLiveJobScope selects client/status/received-date/
 * upload-date/job-type/etc. columns rather than whole items, and fetches every
 * board in parallel.
 */
export async function fetchLiveJobScope(orgId: string, opts?: { forceRefresh?: boolean }): Promise<LiveJobScopeResult> {
  if (!opts?.forceRefresh) {
    const cached = scopeCache.get(orgId);
    if (cached) return cached;
  }
  const data = await timeApi(`getLiveJobScope(org=${orgId})`, () => getLiveJobScope(orgId));
  scopeCache.set(orgId, data);
  return data;
}

/**
 * Fetch the board list for the org (lightweight), cached for the TTL.
 */
export async function fetchBoards(orgId: string, opts?: { forceRefresh?: boolean }): Promise<Array<{ id: string; name: string; slug: string | null; workspace_id: string | null }>> {
  if (!opts?.forceRefresh) {
    const cached = boardsCache.get(orgId);
    if (cached) return cached;
  }
  const data = await timeApi(`fetch boards(org=${orgId})`, async () => {
    const supabase = await createServiceClient();
    const { data: rows, error } = await supabase
      .from("boards")
      .select("id, name, slug, workspace_id")
      .eq("organization_id", orgId)
      .neq("status", "archived")
      .order("name", { ascending: true });
    if (error) throw error;
    return (rows ?? []).map((r) => ({ id: r.id, name: r.name, slug: r.slug ?? null, workspace_id: r.workspace_id ?? null }));
  });
  boardsCache.set(orgId, data);
  return data;
}

export interface DashboardSummary {
  totalJobs: number;
  delayed: number;
  pendingReview: number;
  qcQueue: number;
  activeJobs: number;
  jobTypeMix: Array<{ jobType: string; count: number }>;
  jobsByBoard: Array<{ boardId: string; boardName: string; count: number }>;
  generatedAt: string;
}

const COMPLETED_STATUS = new Set(["done", "completed", "complete", "delivered", "approved", "finished", "resolved", "closed", "uploaded"]);
const PENDING_STATUS = new Set(["in progress", "working on it", "active", "queued", "started", "in-progress", "not started", "pending", "todo", "backlog", "stuck", "blocked", "overdue", "review", "qa", "on hold", "waiting", "wip"]);

function statusClass(status: string | null): "completed" | "pending" | "unknown" {
  const s = (status ?? "").toLowerCase().trim();
  if (!s) return "unknown";
  if ([...COMPLETED_STATUS].some((k) => s === k || s.includes(k))) return "completed";
  if ([...PENDING_STATUS].some((k) => s === k || s.includes(k))) return "pending";
  return "unknown";
}

/**
 * Precompute dashboard numbers (KPIs, job type mix, jobs by board) on the
 * server in one aggregated endpoint and return only the summary to the browser.
 */
export async function fetchDashboardSummary(orgId: string, opts?: { forceRefresh?: boolean }): Promise<DashboardSummary> {
  const scope = await fetchLiveJobScope(orgId, opts);
  const jobs = scope.jobs;
  const now = new Date();

  let delayed = 0, pendingReview = 0, qcQueue = 0, activeJobs = 0;
  const jobTypeMix = new Map<string, number>();
  const jobsByBoard = new Map<string, { boardId: string; boardName: string; count: number }>();

  for (const j of jobs) {
    const s = (j.status ?? "").toLowerCase();
    const isDone = COMPLETED_STATUS.has(s) || [...COMPLETED_STATUS].some((k) => s.includes(k));
    const isReview = s === "review" || s === "qc" || s.includes("quality");
    const isBlocked = s.includes("block") || s.includes("delay") || s.includes("hold");
    const isOverdue = j.due_date && !isDone && new Date(j.due_date) < now;

    if (isBlocked || isOverdue) delayed++;
    if (isReview) pendingReview++;
    if (s === "qc") qcQueue++;
    if (!isDone) activeJobs++;

    const jobType = j.job_type || "Unknown";
    jobTypeMix.set(jobType, (jobTypeMix.get(jobType) ?? 0) + 1);

    const entry = jobsByBoard.get(j.board_id) ?? { boardId: j.board_id, boardName: j.board_name, count: 0 };
    entry.count++;
    jobsByBoard.set(j.board_id, entry);
  }

  return {
    totalJobs: jobs.length,
    delayed,
    pendingReview,
    qcQueue,
    activeJobs,
    jobTypeMix: [...jobTypeMix.entries()].map(([jobType, count]) => ({ jobType, count })).sort((a, b) => b.count - a.count),
    jobsByBoard: [...jobsByBoard.values()].sort((a, b) => b.count - a.count),
    generatedAt: scope.generatedAt,
  };
}

/**
 * Clear the shared data cache. Backs the "Synced just now" manual refresh.
 * Pass an orgId to clear just that org, or nothing to clear everything.
 */
export async function invalidateDataCache(orgId?: string): Promise<void> {
  if (orgId) {
    scopeCache.invalidate(orgId);
    boardsCache.invalidate(orgId);
  } else {
    scopeCache.invalidate();
    boardsCache.invalidate();
  }
  console.log(`[perf] data cache invalidated${orgId ? ` (org=${orgId})` : " (all)"}`);
}
