/**
 * PFM1 Job Log — Filtering & Search Logic
 *
 * Pure functions that operate on the single source-of-truth dataset.
 * Used by the Dashboard component to derive `filteredRows` reactively.
 */

import type { DashboardFilters, JobLogRow } from "../types";

export const DEFAULT_FILTERS: DashboardFilters = {
  client: "",
  jobType: "",
  status: "",
  month: "",
};

export function searchJobs(rows: JobLogRow[], query: string): JobLogRow[] {
  if (!query.trim()) return rows;
  const q = query.toLowerCase().trim();
  return rows.filter((r) => {
    return (
      r.client.toLowerCase().includes(q) ||
      r.jobType.toLowerCase().includes(q) ||
      r.batch.toLowerCase().includes(q) ||
      r.comment.toLowerCase().includes(q) ||
      r.status.toLowerCase().includes(q)
    );
  });
}

export function applyFilters(rows: JobLogRow[], filters: DashboardFilters): JobLogRow[] {
  return rows.filter((r) => {
    if (filters.client && r.client !== filters.client) return false;
    if (filters.jobType && r.jobType !== filters.jobType) return false;
    if (filters.status && r.status !== filters.status) return false;
    if (filters.month) {
      const rowMonth = r.received.slice(0, 7);
      if (rowMonth !== filters.month) return false;
    }
    return true;
  });
}

export function filterAndSearch(rows: JobLogRow[], filters: DashboardFilters, searchQuery: string): JobLogRow[] {
  const searched = searchJobs(rows, searchQuery);
  return applyFilters(searched, filters);
}

export function distinctClients(rows: JobLogRow[]): string[] {
  const set = new Set<string>();
  for (const r of rows) set.add(r.client);
  return Array.from(set).sort();
}

export function distinctJobTypes(rows: JobLogRow[]): string[] {
  const set = new Set<string>();
  for (const r of rows) set.add(r.jobType);
  return Array.from(set).sort();
}

export function distinctStatuses(rows: JobLogRow[]): string[] {
  const set = new Set<string>();
  for (const r of rows) set.add(r.status);
  return Array.from(set).sort();
}

export function distinctMonths(rows: JobLogRow[]): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    if (r.received) set.add(r.received.slice(0, 7));
  }
  return Array.from(set).sort().reverse();
}

export function formatMonthLabel(month: string): string {
  const [year, m] = month.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[Number(m) - 1]} ${year}`;
}
