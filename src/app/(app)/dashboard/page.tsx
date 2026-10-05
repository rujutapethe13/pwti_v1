"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

import { BoardLayout } from "@/components/shared/board-layout";
import { Widget, WidgetGrid, KpiValue } from "@/components/shared/widget";
import { StatusPill } from "@/components/shared/status-pill";
import { Separator } from "@/components/ui/separator";
import { useWorkspace } from "@/lib/workspace-context";
import { fetchClientSearchData } from "@/features/analytics/aggregation/actions";
import type { UnifiedJobRow } from "@/features/analytics/aggregation/types";
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

const POLL_INTERVAL_MS = 60_000;

export default function DashboardPage() {
  const { activeWorkspaceId } = useWorkspace();

  const [rows, setRows] = useState<UnifiedJobRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadData = useCallback(async () => {
    if (!activeWorkspaceId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const result = await fetchClientSearchData(activeWorkspaceId);
      if (result.error) {
        console.error("Dashboard data fetch error:", result.error);
        setRows([]);
      } else if (result.data) {
        setRows(result.data.rows);
        setLastUpdated(new Date());
      }
    } catch (err) {
      console.error("Dashboard data fetch failed:", err);
      setRows([]);
    } finally {
      setIsLoading(false);
    }
  }, [activeWorkspaceId]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [loadData]);

  const kpis = useMemo(() => computeKpis(rows), [rows]);
  const deadlines = useMemo(() => computeDeadlines(rows), [rows]);
  const workload = useMemo(() => computeWorkload(rows), [rows]);
  const activity = useMemo(() => computeActivity(rows), [rows]);

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
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {rows.length} jobs across all boards
            {lastUpdated && (
              <span className="text-xs ml-2">
                Updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
          </p>
          <button
            onClick={loadData}
            disabled={isLoading}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {/* ── KPI Widgets ────────────────────────────────── */}
        {isLoading && rows.length === 0 ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <RefreshCw className="h-5 w-5 animate-spin mr-2" />
            Loading dashboard data...
          </div>
        ) : (
          <>
            <WidgetGrid cols={4}>
              {kpis.map((kpi) => (
                <Widget key={kpi.id} variant="kpi">
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">
                      {kpi.label}
                    </p>
                    <KpiValue
                      value={kpi.value}
                      trend={kpi.trend}
                      trendDirection={kpi.trendDirection}
                    />
                  </div>
                  <div
                    className="mt-3 h-1 w-full rounded-full bg-muted"
                    role="progressbar"
                    aria-valuenow={kpi.value}
                    aria-valuemin={0}
                    aria-valuemax={Math.max(kpi.value, 1)}
                    aria-label={`${kpi.label}: ${kpi.value}`}
                  >
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        backgroundColor: `hsl(var(--${kpi.statusColor}))`,
                        width: `${Math.min((kpi.value / Math.max(kpi.value, 1)) * 100, 100)}%`,
                      }}
                    />
                  </div>
                </Widget>
              ))}
            </WidgetGrid>

            {/* ── Activity + Deadlines ───────────────────────── */}
            <WidgetGrid cols={2}>
              {/* Recent Activity */}
              <Widget
                title="Recent Activity"
                icon={Activity}
                action={{ label: "View all" }}
              >
                <div className="space-y-0">
                  {activity.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4">No recent activity</p>
                  ) : (
                    activity.map((item, i) => (
                      <div key={item.id}>
                        <div className="flex items-start gap-3 py-2.5">
                          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
                            {item.type === "approval" && (
                              <CheckCheck className="size-3.5 text-success" aria-hidden="true" />
                            )}
                            {item.type === "qc" && (
                              <ListChecks className="size-3.5 text-info" aria-hidden="true" />
                            )}
                            {item.type === "po" && (
                              <Clock className="size-3.5 text-warning" aria-hidden="true" />
                            )}
                            {item.type === "invoice" && (
                              <Activity className="size-3.5 text-muted-foreground" aria-hidden="true" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-foreground">{item.action}</p>
                            <p className="text-xs text-muted-foreground">
                              {item.user} &middot; {item.timestamp}
                            </p>
                          </div>
                        </div>
                        {i < activity.length - 1 && (
                          <Separator />
                        )}
                      </div>
                    ))
                  )}
                </div>
              </Widget>

              {/* Upcoming Deadlines */}
              <Widget
                title="Upcoming Deadlines"
                icon={CalendarDays}
                action={{ label: "View all" }}
              >
                <div className="space-y-2">
                  {deadlines.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4">No upcoming deadlines</p>
                  ) : (
                    deadlines.map((deadline) => (
                      <div
                        key={deadline.id}
                        className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
                      >
                        <div
                          className={cn(
                            "flex size-8 shrink-0 items-center justify-center rounded-full",
                            deadline.priority === "high" && "bg-destructive/10 text-destructive",
                            deadline.priority === "medium" && "bg-warning/10 text-warning",
                            deadline.priority === "low" && "bg-muted text-muted-foreground",
                          )}
                        >
                          <AlertTriangle className="size-4" aria-hidden="true" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {deadline.task}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Due: {deadline.due}
                          </p>
                        </div>
                        <StatusPill
                          status={
                            deadline.priority === "high"
                              ? "delayed"
                              : deadline.priority === "medium"
                                ? "qc"
                                : "not-started"
                          }
                          dotOnly
                        />
                      </div>
                    ))
                  )}
                </div>
              </Widget>
            </WidgetGrid>

            {/* ── Workload Overview + Status Breakdown ──────────── */}
            <WidgetGrid cols={2}>
              {/* Workload Overview */}
              <Widget
                title="Workload by Board"
                icon={Users}
                action={{ label: "Details" }}
              >
                <div className="space-y-4">
                  {workload.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4">No boards found</p>
                  ) : (
                    workload.map((dept) => {
                      const pct = dept.total > 0 ? (dept.active / dept.total) * 100 : 0;
                      return (
                        <div key={dept.department} className="space-y-1.5">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-foreground">{dept.department}</span>
                            <span className="text-xs text-muted-foreground">
                              {dept.active}/{dept.total}
                            </span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-primary/60 transition-all duration-300"
                              style={{ width: `${pct}%` }}
                              role="progressbar"
                              aria-valuenow={pct}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-label={`${dept.department}: ${dept.active} of ${dept.total} active`}
                            />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </Widget>

              {/* Status Breakdown */}
              <Widget
                title="Status Breakdown"
                icon={Clock}
                action={{ label: "View all" }}
              >
                <div className="space-y-2">
                  {rows.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4">No data available</p>
                  ) : (
                    computeStatusBreakdown(rows).map((item) => (
                      <div key={item.status} className="flex items-center gap-3 rounded-lg border p-3">
                        <StatusPill status={item.statusKey} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {item.status}
                          </p>
                        </div>
                        <span className="text-sm font-medium">{item.count}</span>
                        <span className="text-xs text-muted-foreground">({item.pct}%)</span>
                      </div>
                    ))
                  )}
                </div>
              </Widget>
            </WidgetGrid>
          </>
        )}
      </div>
    </BoardLayout>
  );
}

function computeKpis(rows: UnifiedJobRow[]): DashboardKpi[] {
  const totalJobs = rows.length;

  let delayed = 0;
  let pendingApprovals = 0;
  let qcQueue = 0;
  let activeBatches = 0;

  const now = new Date();

  const statusLower = (s: string) => (s || "").toLowerCase();

  for (const row of rows) {
    const s = statusLower(row.status);
    const isDone = s.includes("done") || s.includes("complete") || s.includes("delivered") || s === "approved";
    const isReview = s === "review" || s === "qc" || s.includes("quality");
    const isBlocked = s.includes("block") || s.includes("delay") || s.includes("hold");
    const isOverdue = row.dueDate && !isDone && new Date(row.dueDate) < now;

    if (isBlocked || isOverdue) delayed++;
    if (isReview) pendingApprovals++;
    if (s === "qc") qcQueue++;
    if (!isDone) activeBatches++;
  }

  return [
    { id: "delayed", label: "Delayed", value: delayed, trend: "", trendDirection: "up", statusColor: "status-delayed" },
    { id: "pending", label: "Pending Review", value: pendingApprovals, trend: "", trendDirection: "down", statusColor: "status-review" },
    { id: "qc", label: "QC Queue", value: qcQueue, trend: "", trendDirection: "up", statusColor: "status-in-progress" },
    { id: "active", label: "Active Jobs", value: activeBatches, trend: "", trendDirection: "up", statusColor: "status-approved" },
  ];
}

function computeDeadlines(rows: UnifiedJobRow[]): DashboardDeadline[] {
  const now = new Date();
  const deadlines: DashboardDeadline[] = [];

  for (const row of rows) {
    if (!row.dueDate) continue;
    const due = new Date(row.dueDate);
    const daysUntilDue = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    const s = (row.status || "").toLowerCase();
    const isDone = s.includes("done") || s.includes("complete") || s.includes("delivered");

    if (isDone) continue;

    let priority: "high" | "medium" | "low" = "low";
    if (daysUntilDue <= 0) priority = "high";
    else if (daysUntilDue <= 2) priority = "high";
    else if (daysUntilDue <= 7) priority = "medium";

    let dueText: string;
    if (daysUntilDue < 0) dueText = "Overdue";
    else if (daysUntilDue === 0) dueText = "Today";
    else if (daysUntilDue === 1) dueText = "Tomorrow";
    else dueText = `In ${daysUntilDue} days`;

    deadlines.push({
      id: row.id,
      task: row.clientName || row.title,
      due: dueText,
      priority,
    });
  }

  return deadlines
    .sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    })
    .slice(0, 8);
}

function computeWorkload(rows: UnifiedJobRow[]): DashboardWorkloadItem[] {
  const boardMap = new Map<string, { active: number; total: number }>();

  for (const row of rows) {
    const boardName = row.boardName || "Unknown";
    const entry = boardMap.get(boardName) || { active: 0, total: 0 };
    entry.total++;

    const s = (row.status || "").toLowerCase();
    const isDone = s.includes("done") || s.includes("complete") || s.includes("delivered");
    if (!isDone) entry.active++;

    boardMap.set(boardName, entry);
  }

  return Array.from(boardMap.entries())
    .map(([department, data]) => ({
      department,
      active: data.active,
      total: data.total,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);
}

function computeActivity(rows: UnifiedJobRow[]): DashboardActivityItem[] {
  const sorted = [...rows].sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || "")).slice(0, 5);

  return sorted.map((row, i) => {
    const s = (row.status || "").toLowerCase();
    let type: "approval" | "qc" | "po" | "invoice" = "po";
    if (s.includes("done") || s === "approved") type = "approval";
    else if (s === "qc" || s === "review") type = "qc";

    const assignee = row.assignedTo.length > 0 ? row.assignedTo[0] : "System";

    return {
      id: row.id,
      action: `${row.clientName || row.title} — ${row.status || "updated"}`,
      user: assignee,
      timestamp: row.updatedAt ? formatRelativeTime(row.updatedAt) : "Recently",
      type,
    };
  });
}

function computeStatusBreakdown(rows: UnifiedJobRow[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const status = row.status || "Unknown";
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }

  const total = rows.length;
  return Array.from(counts.entries())
    .map(([status, count]) => ({
      status,
      count,
      pct: total > 0 ? Math.round((count / total) * 100) : 0,
      statusKey: mapStatusKey(status),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
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

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hr ago`;
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString();
}

