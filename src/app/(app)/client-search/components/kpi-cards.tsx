"use client";

import { useMemo } from "react";
import {
  BarChart3,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Users,
  TrendingUp,
} from "lucide-react";
import { Widget, WidgetGrid, KpiValue } from "@/components/shared/widget";
import type { UnifiedJobRow } from "@/features/analytics/aggregation/types";

interface KpiCardsProps {
  rows: UnifiedJobRow[];
}

export function KpiCards({ rows }: KpiCardsProps) {
  const kpis = useMemo(() => computeKpis(rows), [rows]);

  return (
    <WidgetGrid cols={4}>
      <Widget variant="kpi">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Total Jobs</p>
          <KpiValue value={kpis.totalJobs} />
        </div>
        <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <BarChart3 className="h-3.5 w-3.5" />
          <span>Across all boards</span>
        </div>
      </Widget>

      <Widget variant="kpi">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">In Progress</p>
          <KpiValue value={kpis.inProgress} />
        </div>
        <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <TrendingUp className="h-3.5 w-3.5 text-amber-500" />
          <span>{kpis.inProgressPct}% of total</span>
        </div>
      </Widget>

      <Widget variant="kpi">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Done</p>
          <KpiValue value={kpis.done} />
        </div>
        <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
          <span>{kpis.donePct}% completion rate</span>
        </div>
      </Widget>

      <Widget variant="kpi">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Total Clients</p>
          <KpiValue value={kpis.totalClients} />
        </div>
        <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          <span>Unique clients</span>
        </div>
      </Widget>

      <Widget variant="kpi">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Avg. Turnaround</p>
          <KpiValue value={kpis.avgTurnaroundDays} />
        </div>
        <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          <span>Days (created → done)</span>
        </div>
      </Widget>

      <Widget variant="kpi">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Overdue</p>
          <KpiValue value={kpis.overdue} />
        </div>
        <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
          <span>Past due date</span>
        </div>
      </Widget>

      <Widget variant="kpi">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Status Breakdown</p>
          <div className="mt-2 space-y-1.5">
            {kpis.statusBreakdown.map((item) => (
              <div key={item.status} className="flex items-center gap-2 text-xs">
                <div
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-muted-foreground flex-1 truncate">{item.status}</span>
                <span className="font-medium">{item.count}</span>
                <span className="text-muted-foreground">({item.pct}%)</span>
              </div>
            ))}
          </div>
        </div>
      </Widget>
    </WidgetGrid>
  );
}

interface StatusBreakdownItem {
  status: string;
  count: number;
  pct: number;
  color: string;
}

const STATUS_COLORS: Record<string, string> = {
  Done: "#22c55e",
  Approved: "#22c55e",
  "In Progress": "#f59e0b",
  Editing: "#f59e0b",
  Rendering: "#f59e0b",
  Retouching: "#f59e0b",
  Review: "#8b5cf6",
  QC: "#8b5cf6",
  Queued: "#94a3b8",
  "Not Started": "#94a3b8",
  Blocked: "#ef4444",
};

function getStatusColor(status: string): string {
  const lower = status.toLowerCase();
  if (lower.includes("done") || lower.includes("complete") || lower.includes("deliver")) return "#22c55e";
  if (lower.includes("progress") || lower === "editing" || lower === "rendering" || lower === "retouching" || lower === "working") return "#f59e0b";
  if (lower === "review" || lower === "qc" || lower.includes("quality")) return "#8b5cf6";
  if (lower.includes("queue") || lower.includes("not started") || lower.includes("todo") || lower.includes("backlog")) return "#94a3b8";
  if (lower.includes("block") || lower.includes("delay") || lower.includes("hold")) return "#ef4444";
  return "#6b7280";
}

function computeKpis(rows: UnifiedJobRow[]) {
  const totalJobs = rows.length;

  let done = 0;
  let inProgress = 0;
  let overdue = 0;
  const clients = new Set<string>();
  const statusCounts = new Map<string, number>();
  const turnaroundDays: number[] = [];

  const now = new Date();

  const statusLower = (s: string) => (s || "").toLowerCase();

  for (const row of rows) {
    // Status counts
    const status = row.status || "Unknown";
    statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);

    const s = statusLower(status);
    const isDone = s.includes("done") || s.includes("complete") || s.includes("delivered") || s === "approved";
    const isInProgress = s.includes("progress") || s === "editing" || s === "rendering" || s === "retouching" || s === "working" || s === "review" || s === "qc" || s.includes("post-prod");

    if (isDone) {
      done++;
      // Calculate turnaround for done jobs
      if (row.date) {
        const created = new Date(row.date);
        const updated = new Date(row.updatedAt);
        const days = Math.round((updated.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
        if (days >= 0) turnaroundDays.push(days);
      }
    } else if (isInProgress) {
      inProgress++;
    }

    // Clients
    if (row.clientName) clients.add(row.clientName);

    // Overdue: has dueDate in the past and not done
    if (row.dueDate && !isDone) {
      const due = new Date(row.dueDate);
      if (due < now) overdue++;
    }
  }

  const donePct = totalJobs > 0 ? Math.round((done / totalJobs) * 100) : 0;
  const inProgressPct = totalJobs > 0 ? Math.round((inProgress / totalJobs) * 100) : 0;
  const avgTurnaroundDays = turnaroundDays.length > 0
    ? Math.round(turnaroundDays.reduce((a, b) => a + b, 0) / turnaroundDays.length)
    : 0;

  // Status breakdown sorted by count desc
  const statusBreakdown: StatusBreakdownItem[] = Array.from(statusCounts.entries())
    .map(([status, count]) => ({
      status,
      count,
      pct: totalJobs > 0 ? Math.round((count / totalJobs) * 100) : 0,
      color: getStatusColor(status),
    }))
    .sort((a, b) => b.count - a.count);

  return {
    totalJobs,
    inProgress,
    inProgressPct,
    done,
    donePct,
    totalClients: clients.size,
    avgTurnaroundDays,
    overdue,
    statusBreakdown,
  };
}
