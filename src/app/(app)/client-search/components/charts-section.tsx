"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { Widget, WidgetGrid } from "@/components/shared/widget";
import type { UnifiedJobRow } from "@/features/analytics/aggregation/types";

interface ChartsSectionProps {
  rows: UnifiedJobRow[];
}

const CHART_COLORS = [
  "#3b82f6",
  "#22c55e",
  "#f59e0b",
  "#8b5cf6",
  "#ef4444",
  "#06b6d4",
  "#ec4899",
  "#f97316",
  "#14b8a6",
  "#6366f1",
];

function getStatusColor(status: string): string {
  const lower = status.toLowerCase();
  if (lower.includes("done") || lower.includes("complete") || lower.includes("deliver")) return "#22c55e";
  if (lower.includes("progress") || lower === "editing" || lower === "rendering" || lower === "retouching" || lower === "working") return "#f59e0b";
  if (lower === "review" || lower === "qc" || lower.includes("quality")) return "#8b5cf6";
  if (lower.includes("queue") || lower.includes("not started") || lower.includes("todo") || lower.includes("backlog")) return "#94a3b8";
  if (lower.includes("block") || lower.includes("delay") || lower.includes("hold")) return "#ef4444";
  return CHART_COLORS[Math.abs(status.split("").reduce((a, c) => a + c.charCodeAt(0), 0)) % CHART_COLORS.length];
}

const STATUS_COLORS: Record<string, string> = {
  Done: "#22c55e",
  Approved: "#16a34a",
  "In Progress": "#f59e0b",
  Editing: "#d97706",
  Rendering: "#fbbf24",
  Retouching: "#f59e0b",
  Review: "#8b5cf6",
  QC: "#7c3aed",
  Queued: "#94a3b8",
  "Not Started": "#cbd5e1",
  Blocked: "#ef4444",
};

export function ChartsSection({ rows }: ChartsSectionProps) {
  const jobsByClient = useMemo(() => computeJobsByClient(rows), [rows]);
  const jobsOverTime = useMemo(() => computeJobsOverTime(rows), [rows]);
  const statusDistribution = useMemo(() => computeStatusDistribution(rows), [rows]);
  const jobTypeByClient = useMemo(() => computeJobTypeByClient(rows), [rows]);

  return (
    <div className="space-y-6">
      {/* Row 1: Bar chart (wider) + Donut chart */}
      <WidgetGrid cols={3}>
        {/* Jobs by Client — Horizontal Bar */}
        <Widget title="Jobs by Client" className="col-span-2">
          <div className="h-[280px] w-full">
            {jobsByClient.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={jobsByClient}
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis
                    dataKey="name"
                    type="category"
                    width={100}
                    tick={{ fontSize: 11 }}
                  />
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
                  <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart />
            )}
          </div>
        </Widget>

        {/* Status Distribution — Donut */}
        <Widget title="Status Distribution">
          <div className="h-[280px] w-full">
            {statusDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                    nameKey="name"
                  >
                    {statusDistribution.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={getStatusColor(entry.name)}
                      />
                    ))}
                  </Pie>
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
                  <Legend
                    wrapperStyle={{ fontSize: 11 }}
                    formatter={(value) => <span className="text-muted-foreground">{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart />
            )}
          </div>
        </Widget>
      </WidgetGrid>

      {/* Row 2: Line chart + Stacked bar */}
      <WidgetGrid cols={3}>
        {/* Jobs Over Time — Line Chart */}
        <Widget title="Jobs Created Over Time" className="col-span-2">
          <div className="h-[260px] w-full">
            {jobsOverTime.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={jobsOverTime}
                  margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 12 }} />
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
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart />
            )}
          </div>
        </Widget>

        {/* Job Type Distribution — Stacked/Grouped Bar */}
        <Widget title="Job Type by Client">
          <div className="h-[260px] w-full">
            {jobTypeByClient.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={jobTypeByClient}
                  margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="client" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 12 }} />
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
                  {Object.keys(jobTypeByClient[0] ?? {})
                    .filter((k) => k !== "client")
                    .slice(0, 5)
                    .map((type, i) => (
                      <Bar
                        key={type}
                        dataKey={type}
                        stackId="a"
                        fill={CHART_COLORS[i % CHART_COLORS.length]}
                      />
                    ))}
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart />
            )}
          </div>
        </Widget>
      </WidgetGrid>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      No data available
    </div>
  );
}

// ── Data Transformations ─────────────────────────────────────

function computeJobsByClient(rows: UnifiedJobRow[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const name = row.clientName || "Unknown";
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

function computeJobsOverTime(rows: UnifiedJobRow[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const date = row.date ? row.date.substring(0, 10) : row.createdAt?.substring(0, 10);
    if (date) {
      counts.set(date, (counts.get(date) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function computeStatusDistribution(rows: UnifiedJobRow[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const status = row.status || "Unknown";
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

function computeJobTypeByClient(rows: UnifiedJobRow[]) {
  // Top 5 clients by job volume
  const clientCounts = new Map<string, number>();
  for (const row of rows) {
    const name = row.clientName || "Unknown";
    clientCounts.set(name, (clientCounts.get(name) ?? 0) + 1);
  }
  const topClients = Array.from(clientCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name]) => name);

  // Build stacked data: client → { client, type1, type2, ... }
  const data = new Map<string, Record<string, string | number>>();
  const allTypes = new Set<string>();

  for (const row of rows) {
    const client = row.clientName || "Unknown";
    if (!topClients.includes(client)) continue;

    const type = row.jobType || "Other";
    allTypes.add(type);

    if (!data.has(client)) {
      data.set(client, { client });
    }
    const entry = data.get(client)!;
    entry[type] = ((entry[type] as number) ?? 0) + 1;
  }

  return Array.from(data.values());
}
