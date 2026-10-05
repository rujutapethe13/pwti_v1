/**
 * Client Search Dashboard — Filter Logic
 *
 * Pure functions for filtering the unified dataset.
 * All filters are AND-combined.
 */

import type { UnifiedJobRow, DashboardFilters } from "./types";

/**
 * Apply all active filters to the dataset.
 * Filters are AND-combined (a row must match all active filters).
 */
export function applyFilters(
  rows: UnifiedJobRow[],
  filters: DashboardFilters,
): UnifiedJobRow[] {
  return rows.filter((row) => {
    // Client name filter (fuzzy contains)
    if (filters.clientName) {
      const search = filters.clientName.toLowerCase();
      if (!row.clientName.toLowerCase().includes(search) && !row.title.toLowerCase().includes(search)) {
        return false;
      }
    }

    // Job type filter (exact match)
    if (filters.jobType && row.jobType !== filters.jobType) {
      return false;
    }

    // Status filter (multi-select, OR within the group)
    if (filters.status.length > 0 && !filters.status.includes(row.status)) {
      return false;
    }

    // Assigned to filter (fuzzy contains on any assignee)
    if (filters.assignedTo) {
      const search = filters.assignedTo.toLowerCase();
      const hasMatch = row.assignedTo.some((person) =>
        person.toLowerCase().includes(search),
      );
      if (!hasMatch) return false;
    }

    // Date range filter
    if (filters.dateRange.from || filters.dateRange.to) {
      const rowDate = row.date ? new Date(row.date) : null;
      if (rowDate) {
        if (filters.dateRange.from) {
          const from = new Date(filters.dateRange.from);
          if (rowDate < from) return false;
        }
        if (filters.dateRange.to) {
          const to = new Date(filters.dateRange.to);
          to.setHours(23, 59, 59, 999);
          if (rowDate > to) return false;
        }
      }
    }

    return true;
  });
}

/**
 * Extract unique values for filter dropdown options.
 */
export function extractFilterOptions(rows: UnifiedJobRow[]) {
  const clientNames = new Set<string>();
  const jobTypes = new Set<string>();
  const statuses = new Set<string>();
  const assignedTo = new Set<string>();

  for (const row of rows) {
    if (row.clientName) clientNames.add(row.clientName);
    if (row.jobType) jobTypes.add(row.jobType);
    if (row.status) statuses.add(row.status);
    for (const person of row.assignedTo) {
      if (person) assignedTo.add(person);
    }
  }

  return {
    clientNames: Array.from(clientNames).sort(),
    jobTypes: Array.from(jobTypes).sort(),
    statuses: Array.from(statuses).sort(),
    assignedTo: Array.from(assignedTo).sort(),
  };
}
