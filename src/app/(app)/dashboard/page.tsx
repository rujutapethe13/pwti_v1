"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CalendarDays,
  CheckCheck,
  Clock,
  ListChecks,
  RefreshCw,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Virtualizer, useVirtualizer } from "@tanstack/react-virtual";

import { BoardLayout } from "@/components/shared/board-layout";
import { Widget, WidgetGrid, KpiValue } from "@/components/shared/widget";
import { StatusPill } from "@/components/shared/status-pill";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/shared/skeleton";
import { useSharedData } from "@/lib/use-shared-data";
import { cn } from "@/lib/utils";

interface DashboardKpi {
  id: string;
  label: string;
  value: number;
  trend: string;
  trendDirection: "up" | "down";
  statusColor: string;
}

interface DashboardActivityItem {
  id: string;
  action: string;
  user: string;
  timestamp: string;
  type: "approval" | "qc" | "po" | "invoice";
}

interface DashboardDeadline {
  id: string;
  task: string;
  due: string;
  priority: "high" | "medium" | "low";
}

interface DashboardWorkloadItem {
  department: string;
  active: number;
  total: number;
}

interface JobTypeMixItem {
  jobType: string;
  count: number;
}

interface JobsByBoardItem {
  boardId: string;
  boardName: string;
  count: number;
}

interface DashboardSummary {
  totalJobs: number;
  delayed: number;
  pendingReview: number;
  qcQueue: number;
  activeJobs: number;
  jobTypeMix: JobTypeMixItem[];
  jobsByBoard: JobsByBoardItem[];
  generatedAt: string;
  cached?: boolean;
}

const POLL_INTERVAL_MS = 60_000;

async function fetchDashboardSummary(force = false): Promise<DashboardSummary> {
  const res = await fetch(`/api/dashboard-summary${force ? "?refresh=1" : ""}`, {
    cache: "no-store",
    headers: force ? { "x-refresh": "1" } : {},
  });
  if (!res.ok) throw new Error("Failed to load dashboard summary");
  return (await res.json()) as DashboardSummary;
}

function KpiSkeleton() {
  return (
    <Widget variant="kpi" className="h-24">
      <div className="space-y-1">
        <Skeleton.Base className="h-4 w-1/3" />
        <Skeleton.Base className="h-8 w-1/2" />
      </div>
    </Widget>
  );
}

function ListSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-4">
      <Skeleton.List rows={3} />
    </div>
  );
}

function computeKpis(summary: DashboardSummary): DashboardKpi[] {
  return [
    { id: "delayed", label: "Delayed", value: summary.delayed, trend: "", trendDirection: "up", statusColor: "status-delayed" },
    { id: "pending", label: "Pending Review", value: summary.pendingReview, trend: "", trendDirection: "down", statusColor: "status-review" },
    { id: "qc", label: "QC Queue", value: summary.qcQueue, trend: "", trendDirection: "up", statusColor: "status-in-progress" },
    { id: "active", label: "Active Jobs", value: summary.activeJobs, trend: "", trendDirection: "up", statusColor: "status-approved" },
  ];
}

function mapStatusKey(status: string): Parameters<typeof StatusPill>[0]["status"] {
  const s = status.toLowerCase().trim();
  if (s.includes("done") || s.includes("complete") || s.includes("delivered") || s === "approved") return "done";
  if (s.includes("progress") || s === "editing" || s === "rendering" || s === "retouching" || s === "working") return "post-production";
  if (s === "review" || s === "qc" || s.includes("quality")) return "qc";
  if (s.includes("queue") || s.includes("not started") || s.includes("todo") || s.includes("backlog")) return "not-started";
  if (s.includes("block") || s.includes("delay") || s.includes("hold")) return "delayed";
  return "not-started";
}

export default function DashboardPage() {
  const { data, loading, refreshing, error, lastUpdated, refresh } = useSharedData<DashboardSummary>(
    "dashboard-summary",
    () => fetchDashboardSummary(),
    { ttlMs: 3 * 60 * 1000 },
  );

  const router = useRouter();

  const kpis = useMemo(() => computeKpis(data ?? { totalJobs: 0, delayed: 0, pendingReview: 0, qcQueue: 0, activeJobs: 0, jobTypeMix: [], jobsByBoard: [], generatedAt: "" }), [data]);

  // Job type mix — memoized, precomputed on the server; only formatted here.
  const jobTypeMix = useMemo(() => data?.jobTypeMix ?? [], [data]);
  const jobsByBoard = useMemo(() => data?.jobsByBoard ?? [], [data]);

  // Synthetic activity items built from the summary (kept small; virtualized below).
  const activity = useMemo(() => {
    const items: DashboardActivityItem[] = [];
    if (data?.delayed) items.push({ id: "a1", action: `${data.delayed} delayed jobs need attention`, user: "System", timestamp: "Just now", type: "po" });
    if (data?.qcQueue) items.push({ id: "a2", action: `${data.qcQueue} jobs in QC queue`, user: "System", timestamp: "Just now", type: "qc" });
    if (data?.pendingReview) items.push({ id: "a3", action: `${data.pendingReview} jobs pending review`, user: "System", timestamp: "Just now", type: "approval" });
    if (data?.activeJobs) items.push({ id: "a4", action: `${data.activeJobs} active jobs across boards`, user: "System", timestamp: "Just now", type: "invoice" });
    return items;
  }, [data]);

  const deadlines: DashboardDeadline[] = useMemo(() => [], []);
  const workload: DashboardWorkloadItem[] = useMemo(() => jobsByBoard.map((b) => ({ department: b.boardName, active: b.count, total: b.count })), [jobsByBoard]);

  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: activity.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 44,
    overscan: 5,
  });

  return (
    <BoardLayout
      boardId="dashboard"
      description="Real-time overview of studio operations"
      views={[]}
      activeViewId=""
      onViewChange={() => {}}
      onRenameView={async () => {}}
      onDuplicateView={async () => {}}
      onDeleteView={async () => {}}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">
              {data ? data.totalJobs : 0} jobs across all boards
              {lastUpdated && (
                <span className="text-xs ml-2">
                  Updated {lastUpdated.toLocaleTimeString()} {data?.cached ? "· cached" : ""}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={refresh}
              disabled={refreshing}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
              Synced just now
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive text-sm">
            {error}
          </div>
        )}

        {/* ── KPI Widgets ────────────────────────────────── */}
        {loading && data === null ? (
          <WidgetGrid cols={4}>
            {[...Array(4)].map((_, i) => <KpiSkeleton key={i} />)}
          </WidgetGrid>
        ) : (
          <>
            <WidgetGrid cols={4}>
              {kpis.map((kpi) => (
                <Widget key={kpi.id} variant="kpi">
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">{kpi.label}</p>
                    <KpiValue value={kpi.value} trend={kpi.trend} trendDirection={kpi.trendDirection} />
                  </div>
                  <div className="mt-3 h-1 w-full rounded-full bg-muted" role="progressbar" aria-valuenow={kpi.value} aria-valuemin={0} aria-valuemax={Math.max(kpi.value, 1)} aria-label={`${kpi.label}: ${kpi.value}`}>
                    <div className="h-full rounded-full transition-all duration-500" style={{ backgroundColor: `hsl(var(--${kpi.statusColor}))`, width: `${Math.min((kpi.value / Math.max(kpi.value, 1)) * 100, 100)}%` }} />
                  </div>
                </Widget>
              ))}
            </WidgetGrid>

            {/* ── Activity + Deadlines ───────────────────────── */}
            <WidgetGrid cols={2}>
              <Widget title="Recent Activity" icon={Activity} action={{ label: "View all", onClick: () => router.push("/my-work") }}>
                <div ref={parentRef} className="h-[260px] overflow-y-auto space-y-0" style={{ height: `${Math.min(activity.length * 44 + 16, 260)}px` }}>
                  {loading && data === null ? (
                    <ListSkeleton />
                  ) : activity.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4">No recent activity</p>
                  ) : (
                    <>
                      {rowVirtualizer.getVirtualItems().map((virtualItem: { index: number; start: number; size: number }) => {
                        const item = activity[virtualItem.index];
                        if (!item) return null;
                        return (
                          <div
                            key={item.id}
                            className="flex items-start gap-3 py-2.5"
                            style={{ position: "relative", top: `${virtualItem.start}px`, height: `${virtualItem.size}px` }}
                          >
                            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
                              {item.type === "approval" && <CheckCheck className="size-3.5 text-success" aria-hidden="true" />}
                              {item.type === "qc" && <ListChecks className="size-3.5 text-info" aria-hidden="true" />}
                              {item.type === "po" && <Clock className="size-3.5 text-warning" aria-hidden="true" />}
                              {item.type === "invoice" && <Activity className="size-3.5 text-muted-foreground" aria-hidden="true" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-foreground">{item.action}</p>
                              <p className="text-xs text-muted-foreground">{item.user} &middot; {item.timestamp}</p>
                            </div>
                            {virtualItem.index < activity.length - 1 && <Separator />}
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              </Widget>

              <Widget title="Upcoming Deadlines" icon={CalendarDays} action={{ label: "View all" }}>
                <div className="space-y-2">
                  {loading && data === null ? <ListSkeleton /> : deadlines.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4">No upcoming deadlines</p>
                  ) : (
                    deadlines.map((deadline) => (
                      <div key={deadline.id} className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50">
                        <div className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", deadline.priority === "high" && "bg-destructive/10 text-destructive", deadline.priority === "medium" && "bg-warning/10 text-warning", deadline.priority === "low" && "bg-muted text-muted-foreground")}>
                          <AlertTriangle className="size-4" aria-hidden="true" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{deadline.task}</p>
                          <p className="text-xs text-muted-foreground">Due: {deadline.due}</p>
                        </div>
                        <StatusPill status={deadline.priority === "high" ? "delayed" : deadline.priority === "medium" ? "qc" : "not-started"} dotOnly />
                      </div>
                    ))
                  )}
                </div>
              </Widget>
            </WidgetGrid>

            {/* ── Workload Overview + Status Breakdown ──────────── */}
            <WidgetGrid cols={2}>
              <Widget title="Workload by Board" icon={Users} action={{ label: "Details" }}>
                <div className="space-y-4">
                  {loading && data === null ? <ListSkeleton /> : workload.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4">No boards found</p>
                  ) : (
                    workload.map((dept) => {
                      const pct = dept.total > 0 ? (dept.active / dept.total) * 100 : 0;
                      return (
                        <div key={dept.department} className="space-y-1.5">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-foreground">{dept.department}</span>
                            <span className="text-xs text-muted-foreground">{dept.active}/{dept.total}</span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-primary/60 transition-all duration-300" style={{ width: `${pct}%` }} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${dept.department}: ${dept.active} of ${dept.total} active`} />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </Widget>

              <Widget title="Job Type Mix" icon={Clock} action={{ label: "View all", onClick: () => router.push("/client-search") }}>
                <div className="space-y-2">
                  {loading && data === null ? <ListSkeleton /> : jobTypeMix.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4">No job types</p>
                  ) : (
                    jobTypeMix.map((item) => (
                      <div key={item.jobType} className="flex items-center gap-3 rounded-lg border p-3">
                        <span className="text-sm font-medium text-foreground truncate">{item.jobType}</span>
                        <span className="text-sm font-medium">{item.count}</span>
                      </div>
                    ))
                  )}
                </div>
              </Widget>
            </WidgetGrid>

            {/* ── Jobs by Board ────────────────────────────────── */}
            <Widget title="Jobs by Board" icon={Users} action={{ label: "View all", onClick: () => router.push("/boards-hub") }}>
              <div className="space-y-2">
                {loading && data === null ? <ListSkeleton /> : jobsByBoard.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">No boards</p>
                ) : (
                  jobsByBoard.map((board) => (
                    <div key={board.boardId} className="flex items-center gap-3 rounded-lg border p-3">
                      <span className="text-sm font-medium text-foreground truncate">{board.boardName}</span>
                      <span className="text-sm font-medium">{board.count}</span>
                    </div>
                  ))
                )}
              </div>
            </Widget>
          </>
        )}
      </div>
    </BoardLayout>
  );
}
