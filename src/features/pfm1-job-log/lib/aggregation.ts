/**
 * PFM1 Job Log — Aggregation & KPI Computation
 *
 * All computations derive from a single filtered rows array.
 * No separate "empty" arrays are used for display vs. calculation —
 * every value is computed from the same reactive `filteredRows` source.
 */

import type { JobLogRow } from "../types";

export interface KpiData {
  totalJobs: number;
  completed: number;
  pending: number;
  activeClients: number;
  skusProcessed: number;
  completionRate: number;
}

export interface ChartDataPoint {
  label: string;
  value: number;
  color?: string;
}

export interface TopClient {
  name: string;
  count: number;
  color?: string;
}

export interface JobsByTypeData {
  name: string;
  count: number;
  color?: string;
}

const CLIENT_COLORS = ["teal", "coral", "amber", "lavender", "gray", "teal", "coral", "amber"];

export function computeKpis(rows: JobLogRow[]): KpiData {
  const totalJobs = rows.length;
  let completed = 0;
  let pending = 0;
  const clients = new Set<string>();
  let skusProcessed = 0;

  for (const r of rows) {
    if (r.status === "Completed") completed++;
    if (r.status === "Pending") pending++;
    if (r.client) clients.add(r.client);
    skusProcessed += r.skus;
  }

  const completionRate = totalJobs > 0 ? Math.round((completed / totalJobs) * 100) : 0;

  return {
    totalJobs,
    completed,
    pending,
    activeClients: clients.size,
    skusProcessed,
    completionRate,
  };
}

export function computeJobsByMonth(rows: JobLogRow[]): ChartDataPoint[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (!r.received) continue;
    const month = r.received.slice(0, 7);
    counts.set(month, (counts.get(month) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, value]) => ({
      label: formatMonthShort(month),
      value,
    }));
}

export function computeJobsByType(rows: JobLogRow[]): JobsByTypeData[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    counts.set(r.jobType, (counts.get(r.jobType) ?? 0) + 1);
  }
  const tealHex = "hsl(var(--soft-teal-text))";
  return Array.from(counts.entries())
    .sort(([, a], [, b]) => b - a)
    .map(([name, count], i) => ({
      name,
      count,
      color: i === 0 ? tealHex : i === 1 ? "hsl(var(--soft-lavender-text))" : "hsl(var(--soft-amber-text))",
    }));
}

export function computeTopClients(rows: JobLogRow[]): TopClient[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (!r.client) continue;
    counts.set(r.client, (counts.get(r.client) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort(([, a], [, b]) => b - a)
    .map(([name], i) => ({
      name,
      count: counts.get(name) ?? 0,
      color: CLIENT_COLORS[i % CLIENT_COLORS.length],
    }));
}

export function computeMonthsForFilter(rows: JobLogRow[]): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    if (r.received) set.add(r.received.slice(0, 7));
  }
  return Array.from(set).sort().reverse();
}

export function formatMonthShort(month: string): string {
  const [year, m] = month.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[Number(m) - 1]} ${year}`;
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export function formatDateShort(dateStr: string | null): string {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}
