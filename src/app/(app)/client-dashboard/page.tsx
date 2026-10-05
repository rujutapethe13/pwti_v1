"use client";

/**
 * Client Dashboard — single-page snapshot of the studio's order pipeline.
 *
 * All charts and the table read from the unified cross-workspace data
 * fetched by `fetchAllClient360DataAction` (the same source the rest of
 * the Client 360 system uses). Filters drive a single `filteredRows`
 * useMemo, and every chart below derives from that — so the page can
 * never drift out of sync with the table.
 *
 * Theme colors are plain rgb()/hex literals (not oklch / hsl tokens) so
 * the page exports cleanly to PDF without needing an oklch→rgb conversion step.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CheckCircle2,
  Clock,
  Download,
  Filter,
  ListChecks,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusPill } from "@/components/shared/status-pill";
import { fetchAllClient360DataAction } from "@/features/client-360/actions";
import type { Client360Match } from "@/features/client-360/types";
import { cn } from "@/lib/utils";

const STATUS_COLORS: Record<string, string> = {
  Completed: "#16a34a",
  "In progress": "#f59e0b",
  QA: "#3b82f6",
  Review: "#8b5cf6",
  Overdue: "#dc2626",
  "Not started": "#94a3b8",
  Other: "#94a3b8",
};

type StatusBucket = keyof typeof STATUS_COLORS;

const STATUS_BUCKETS: StatusBucket[] = [
  "Completed",
  "In progress",
  "QA",
  "Review",
  "Overdue",
  "Not started",
  "Other",
];

const POLL_INTERVAL_MS = 60_000;

function rgbHex(input: string | null | undefined): string {
  if (!input) return STATUS_COLORS.Other;
  const s = input.toLowerCase();
  if (s.includes("done") || s.includes("complete") || s.includes("delivered") || s === "approved" || s === "closed")
    return STATUS_COLORS.Completed;
  if (s.includes("progress") || s.includes("working"))
    return STATUS_COLORS["In progress"];
  if (s.includes("qa") || s.includes("testing"))
    return STATUS_COLORS.QA;
  if (s.includes("review"))
    return STATUS_COLORS.Review;
  if (s.includes("stuck") || s.includes("block") || s.includes("delay") || s.includes("hold") || s.includes("overdue") || s.includes("at risk"))
    return STATUS_COLORS.Overdue;
  if (s.includes("todo") || s.includes("backlog") || s.includes("pending") || s.includes("open") || s === "not started")
    return STATUS_COLORS["Not started"];
  return STATUS_COLORS.Other;
}

function bucketStatus(input: string | null | undefined): StatusBucket {
  if (!input) return "Other";
  const s = input.toLowerCase();
  if (s.includes("done") || s.includes("complete") || s.includes("delivered") || s === "approved" || s === "closed")
    return "Completed";
  if (s.includes("progress") || s.includes("working"))
    return "In progress";
  if (s.includes("qa") || s.includes("testing"))
    return "QA";
  if (s.includes("review"))
    return "Review";
  if (s.includes("stuck") || s.includes("block") || s.includes("delay") || s.includes("hold") || s.includes("overdue") || s.includes("at risk"))
    return "Overdue";
  if (s.includes("todo") || s.includes("backlog") || s.includes("pending") || s.includes("open") || s === "not started")
    return "Not started";
  return "Other";
}

function statusBucketToPill(key: StatusBucket): Parameters<typeof StatusPill>[0]["status"] {
  switch (key) {
    case "Completed":
      return "done";
    case "In progress":
      return "post-production";
    case "Overdue":
      return "delayed";
    case "QA":
      return "qc";
    case "Review":
      return "approval-pending";
    case "Not started":
      return "not-started";
    default:
      return "not-started";
  }
}

/** Resolve a cell value from a match using the unified columns as a guide. */
function getCellValue(match: Client360Match, labels: string[]): string | undefined {
  for (const label of labels) {
    const byLabel = match.cellValueByLabel[label.toLowerCase()];
    if (byLabel) return byLabel;
  }
  return undefined;
}

/**
 * Derive a normalized "dashboard row" view from a Client360Match.
 * This replaces the old hardcoded UnifiedJobRow fields with dynamic
 * label-based lookups against the unified column set.
 */
function normalizeRow(match: Client360Match): DashboardRow {
  return {
    id: match.recordId,
    clientName: getCellValue(match, ["client name", "client", "customer", "account", "account name"]) ?? match.recordTitle,
    jobType: getCellValue(match, ["job type", "type", "service type", "project type"]) ?? "",
    status: getCellValue(match, ["status", "stage", "pipeline stage", "workflow status"]) ?? "",
    date: getCellValue(match, ["date", "start date", "created date", "order date"]) ?? match.createdAt.slice(0, 10),
    dueDate: getCellValue(match, ["due date", "deadline", "delivery date"]) ?? "",
    assignedTo: getCellValue(match, ["assigned to", "assignee", "assigned", "owner"])
      ? [getCellValue(match, ["assigned to", "assignee", "assigned", "owner"])!]
      : [],
    updatedAt: match.updatedAt,
    workspaceName: match.workspaceName,
    boardName: match.boardName,
    reference: getCellValue(match, ["reference", "reference number", "job id", "order id", "project id"]) ?? match.recordId,
  };
}

interface DashboardRow {
  id: string;
  clientName: string;
  jobType: string;
  status: string;
  date: string;
  dueDate: string;
  assignedTo: string[];
  updatedAt: string;
  workspaceName: string;
  boardName: string;
  reference: string;
}

export default function ClientDashboardPage() {
  const [rows, setRows] = useState<DashboardRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // ── Filters ───────────────────────────────────────────────
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [jobTypeFilter, setJobTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusBucket | "all">("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [workspaceFilter, setWorkspaceFilter] = useState<string>("all");

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await fetchAllClient360DataAction({ debug: false });
      if (result.error) {
        console.error("Client dashboard fetch error:", result.error);
        setRows([]);
      } else if (result.data) {
        const matches: Client360Match[] = result.data.matches ?? [];
        setRows(matches.map(normalizeRow));
        setLastUpdated(new Date());
      }
    } catch (err) {
      console.error("Client dashboard fetch failed:", err);
      setRows([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [loadData]);

  // ── Distinct values for filter dropdowns ──────────────────
  const distinctClients = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.clientName) set.add(r.clientName);
    return Array.from(set).sort();
  }, [rows]);

  const distinctJobTypes = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.jobType) set.add(r.jobType);
    return Array.from(set).sort();
  }, [rows]);

  const distinctWorkspaces = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.workspaceName) set.add(r.workspaceName);
    return Array.from(set).sort();
  }, [rows]);

  // ── Filtered rows drive every widget on the page ──────────
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (clientFilter !== "all" && r.clientName !== clientFilter) return false;
      if (jobTypeFilter !== "all" && r.jobType !== jobTypeFilter) return false;
      if (statusFilter !== "all" && bucketStatus(r.status) !== statusFilter) return false;
      if (workspaceFilter !== "all" && r.workspaceName !== workspaceFilter) return false;
      if (dateFrom) {
        const rowDate = r.date ?? r.dueDate;
        if (!rowDate || rowDate < dateFrom) return false;
      }
      if (dateTo) {
        const rowDate = r.date ?? r.dueDate;
        if (!rowDate || rowDate > dateTo) return false;
      }
      return true;
    });
  }, [rows, clientFilter, jobTypeFilter, statusFilter, dateFrom, dateTo, workspaceFilter]);

  // ── KPI derivations ───────────────────────────────────────
  const kpis = useMemo(() => {
    const total = filteredRows.length;
    let completed = 0;
    let inProgress = 0;
    let qa = 0;
    let review = 0;
    let overdue = 0;
    let other = 0;
    const today = new Date().toISOString().slice(0, 10);
    for (const r of filteredRows) {
      const k = bucketStatus(r.status);
      if (k === "Completed") completed++;
      else if (k === "In progress") inProgress++;
      else if (k === "QA") qa++;
      else if (k === "Review") review++;
      else if (k === "Overdue") overdue++;
      else other++;
      if (r.dueDate && r.dueDate < today && k !== "Completed") overdue++;
    }
    const uniqueClients = new Set(filteredRows.map((r) => r.clientName).filter(Boolean)).size;
    const completionPct = total > 0 ? Math.round((completed / total) * 100) : 0;
    return {
      total,
      completed,
      inProgress,
      qa,
      review,
      overdue,
      other,
      uniqueClients,
      completionPct,
    };
  }, [filteredRows]);

  // ── Items per client, stacked by status ───────────────────
  const clientStatusSeries = useMemo(() => {
    const map = new Map<string, Record<StatusBucket, number>>();
    for (const r of filteredRows) {
      if (!r.clientName) continue;
      const entry = map.get(r.clientName) ?? {
        Completed: 0,
        "In progress": 0,
        QA: 0,
        Review: 0,
        Overdue: 0,
        "Not started": 0,
        Other: 0,
      };
      entry[bucketStatus(r.status)] += 1;
      map.set(r.clientName, entry);
    }
    return Array.from(map.entries())
      .map(([client, counts]) => ({
        client,
        ...counts,
        total: counts.Completed + counts["In progress"] + counts.QA + counts.Review + counts.Overdue + counts["Not started"] + counts.Other,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [filteredRows]);

  // ── Status distribution pie ───────────────────────────────
  const statusDistribution = useMemo(() => {
    const counts: Record<StatusBucket, number> = {
      Completed: 0,
      "In progress": 0,
      QA: 0,
      Review: 0,
      Overdue: 0,
      "Not started": 0,
      Other: 0,
    };
    for (const r of filteredRows) counts[bucketStatus(r.status)] += 1;
    return STATUS_BUCKETS.map((k) => ({ name: k, value: counts[k] }));
  }, [filteredRows]);

  // ── Items completed over time (line chart) ────────────────
  const completionTrend = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filteredRows) {
      if (bucketStatus(r.status) !== "Completed") continue;
      const day = r.date ?? r.dueDate;
      if (!day) continue;
      map.set(day, (map.get(day) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, count]) => ({ date: day, count }));
  }, [filteredRows]);

  // ── Table data (read-only snapshot) ───────────────────────
  const tableRows = useMemo(() => {
    return filteredRows
      .slice()
      .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))
      .slice(0, 200);
  }, [filteredRows]);

  // ── CSV export ────────────────────────────────────────────
  const handleExportCsv = () => {
    const headers = ["Client", "Job Type", "Status", "Date", "Workspace", "Board", "Reference"];
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = [headers.map(escape).join(",")];
    for (const r of filteredRows) {
      lines.push(
        [r.clientName, r.jobType, r.status ?? "", r.date ?? "", r.workspaceName, r.boardName, r.reference]
          .map((c) => escape(String(c ?? "")))
          .join(","),
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `client-dashboard-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const hasNoData = !isLoading && rows.length === 0;

  return (
    <div className="space-y-4" id="client-dashboard-root">
      {/* ── Header ───────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Client Dashboard</h1>
          <p className="text-xs text-muted-foreground">
            {kpis.total} of {rows.length} item{rows.length === 1 ? "" : "s"} shown
            {lastUpdated && (
              <span className="ml-2 text-[10px]">Updated {lastUpdated.toLocaleTimeString()}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1 text-xs"
            onClick={handleExportCsv}
            disabled={filteredRows.length === 0}
          >
            <Download className="size-3.5" />
            Export CSV
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1 text-xs"
            onClick={loadData}
            disabled={isLoading}
          >
            <RefreshCw className={cn("size-3.5", isLoading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {/* ── Filters bar ──────────────────────────────────── */}
      <section
        className="rounded-lg border bg-card p-3"
        aria-label="Dashboard filters"
      >
        <div className="flex items-center gap-2 pb-2 text-xs font-medium text-muted-foreground">
          <Filter className="size-3.5" />
          Filters
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
          <label className="block text-xs">
            <span className="text-muted-foreground">Client</span>
            <select
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
              className="mt-0.5 h-8 w-full rounded-md border border-border bg-background px-2 text-sm"
            >
              <option value="all">All clients</option>
              {distinctClients.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs">
            <span className="text-muted-foreground">Job Type</span>
            <select
              value={jobTypeFilter}
              onChange={(e) => setJobTypeFilter(e.target.value)}
              className="mt-0.5 h-8 w-full rounded-md border border-border bg-background px-2 text-sm"
            >
              <option value="all">All job types</option>
              {distinctJobTypes.map((j) => (
                <option key={j} value={j}>
                  {j}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs">
            <span className="text-muted-foreground">Status</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusBucket | "all")}
              className="mt-0.5 h-8 w-full rounded-md border border-border bg-background px-2 text-sm"
            >
              <option value="all">All statuses</option>
              {STATUS_BUCKETS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs">
            <span className="text-muted-foreground">Workspace</span>
            <select
              value={workspaceFilter}
              onChange={(e) => setWorkspaceFilter(e.target.value)}
              className="mt-0.5 h-8 w-full rounded-md border border-border bg-background px-2 text-sm"
            >
              <option value="all">All workspaces</option>
              {distinctWorkspaces.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs">
            <span className="text-muted-foreground">From</span>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="mt-0.5 h-8 w-full text-sm"
            />
          </label>
          <label className="block text-xs">
            <span className="text-muted-foreground">To</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="mt-0.5 h-8 w-full text-sm"
            />
          </label>
        </div>
      </section>

      {/* ── Loading state ─────────────────────────────────── */}
      {isLoading && rows.length === 0 ? (
        <div className="flex items-center justify-center rounded-lg border bg-card py-16 text-muted-foreground">
          <RefreshCw className="mr-2 size-4 animate-spin" />
          Loading client data…
        </div>
      ) : hasNoData ? (
        <div className="flex flex-col items-center justify-center rounded-lg border bg-card py-16 text-center">
          <ListChecks className="size-8 text-muted-foreground/40" />
          <p className="mt-2 text-sm font-medium text-foreground">No data yet</p>
          <p className="text-xs text-muted-foreground">
            Create some items on a board to see them here.
          </p>
        </div>
      ) : (
        <>
          {/* ── KPI cards ──────────────────────────────── */}
          <section
            className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-7"
            aria-label="KPI summary"
          >
            <KpiCard label="Total Orders" value={kpis.total} icon={ListChecks} accent="#3b82f6" />
            <KpiCard label="Completed" value={kpis.completed} icon={CheckCircle2} accent={STATUS_COLORS.Completed} />
            <KpiCard label="In Progress" value={kpis.inProgress} icon={Clock} accent={STATUS_COLORS["In progress"]} />
            <KpiCard label="QA" value={kpis.qa} icon={CheckCircle2} accent={STATUS_COLORS.QA} />
            <KpiCard label="Review" value={kpis.review} icon={Clock} accent={STATUS_COLORS.Review} />
            <KpiCard label="Stuck/Overdue" value={kpis.overdue} icon={AlertTriangle} accent={STATUS_COLORS.Overdue} />
            <KpiCard label="Completion" value={`${kpis.completionPct}%`} icon={CheckCircle2} accent="#0ea5e9" />
          </section>

          {/* ── Charts row ────────────────────────────── */}
          <section className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <DashboardCard title="Items per Client (by Status)" className="lg:col-span-2">
              {clientStatusSeries.length === 0 ? (
                <EmptyChart />
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={clientStatusSeries} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                    <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="client"
                      tick={{ fontSize: 10, fill: "#475569" }}
                      interval={0}
                      angle={-15}
                      textAnchor="end"
                      height={50}
                    />
                    <YAxis tick={{ fontSize: 10, fill: "#475569" }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
                        fontSize: 12,
                        color: "hsl(var(--popover-foreground))",
                        opacity: 1,
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Completed" stackId="status" fill={STATUS_COLORS.Completed} name="Completed" />
                    <Bar dataKey="In progress" stackId="status" fill={STATUS_COLORS["In progress"]} name="In progress" />
                    <Bar dataKey="QA" stackId="status" fill={STATUS_COLORS.QA} name="QA" />
                    <Bar dataKey="Review" stackId="status" fill={STATUS_COLORS.Review} name="Review" />
                    <Bar dataKey="Overdue" stackId="status" fill={STATUS_COLORS.Overdue} name="Overdue" />
                    <Bar dataKey="Not started" stackId="status" fill={STATUS_COLORS["Not started"]} name="Not started" />
                    <Bar dataKey="Other" stackId="status" fill={STATUS_COLORS.Other} name="Other" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </DashboardCard>

            <DashboardCard title="Status Distribution">
              {statusDistribution.every((d) => d.value === 0) ? (
                <EmptyChart />
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
                        fontSize: 12,
                        color: "hsl(var(--popover-foreground))",
                        opacity: 1,
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Pie
                      data={statusDistribution}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={45}
                      outerRadius={75}
                      paddingAngle={2}
                    >
                      {statusDistribution.map((entry) => (
                        <Cell key={entry.name} fill={rgbHex(entry.name)} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              )}
            </DashboardCard>
          </section>

          {/* ── Trend line ────────────────────────────── */}
          <DashboardCard title="Items Completed Over Time">
            {completionTrend.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={completionTrend} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                  <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#475569" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#475569" }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
                      fontSize: 12,
                      color: "hsl(var(--popover-foreground))",
                      opacity: 1,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke={STATUS_COLORS.Completed}
                    strokeWidth={2}
                    dot={{ r: 3, fill: STATUS_COLORS.Completed }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </DashboardCard>

          {/* ── Table ─────────────────────────────────── */}
          <DashboardCard title="Client Entries" subtitle="Read-only snapshot, filterable above">
            <div className="max-h-[420px] overflow-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-muted/70 text-left text-xs font-medium text-muted-foreground backdrop-blur">
                  <tr>
                    <th className="px-3 py-2">Client</th>
                    <th className="px-3 py-2">Job Type</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Workspace</th>
                    <th className="px-3 py-2">Board</th>
                    <th className="px-3 py-2">Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-8 text-center text-sm text-muted-foreground">
                        No items match the current filters.
                      </td>
                    </tr>
                  ) : (
                    tableRows.map((r) => {
                      const key = bucketStatus(r.status);
                      return (
                        <tr key={r.id} className="border-t border-border">
                          <td className="px-3 py-2 text-foreground">{r.clientName || "—"}</td>
                          <td className="px-3 py-2 text-foreground">{r.jobType || "—"}</td>
                          <td className="px-3 py-2">
                            <StatusPill status={statusBucketToPill(key)} dotOnly />
                            <span className="ml-2 text-xs text-muted-foreground">{r.status || "—"}</span>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{r.date ?? "—"}</td>
                          <td className="px-3 py-2 text-muted-foreground">{r.workspaceName || "—"}</td>
                          <td className="px-3 py-2 text-muted-foreground">{r.boardName || "—"}</td>
                          <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">
                            {r.reference}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </DashboardCard>
        </>
      )}
    </div>
  );
}

/* ── Internal presentation components ────────────────────────── */

interface KpiCardProps {
  label: string;
  value: number | string;
  icon: typeof ListChecks;
  accent: string;
}

function KpiCard({ label, value, icon: Icon, accent }: KpiCardProps) {
  return (
    <div className="rounded-lg border bg-card p-3 shadow-sm">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <Icon className="size-3.5" style={{ color: accent }} aria-hidden="true" />
      </div>
      <div className="mt-1.5 text-2xl font-light tracking-tight text-foreground">{value}</div>
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full" style={{ backgroundColor: "#e5e7eb" }}>
        <div className="h-full rounded-full" style={{ backgroundColor: accent, width: "100%" }} />
      </div>
    </div>
  );
}

interface DashboardCardProps {
  title: string;
  subtitle?: string;
  className?: string;
  children: React.ReactNode;
}

function DashboardCard({ title, subtitle, className, children }: DashboardCardProps) {
  return (
    <section
      className={cn("rounded-lg border bg-card p-4 shadow-sm", className)}
      aria-label={title}
    >
      <header className="mb-2">
        <h2 className="text-sm font-medium text-foreground">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </header>
      {children}
    </section>
  );
}

function EmptyChart() {
  return (
    <div
      className="flex h-[180px] items-center justify-center text-xs text-muted-foreground"
      role="status"
    >
      No data for the current filters.
    </div>
  );
}
