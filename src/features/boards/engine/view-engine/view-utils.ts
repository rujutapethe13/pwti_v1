/**
 * View Utilities
 *
 * Shared utilities for all view renderers.
 * Provides grouping, filtering, and date helper functions
 * that are shared across Kanban, Calendar, Timeline, Gallery, and Chart views.
 *
 * ── Key Design Decision ────────────────────────────────────
 * `groupRecordsByViewGroupBy()` combines BOTH structural BoardGroup
 * and view-level ViewGroupBy — but keeps them conceptually distinct:
 * - BoardGroup → structural groups (e.g. May/June/July months)
 * - ViewGroupBy → display-only grouping (e.g. group by Status column)
 *
 * These are never mixed into the same data structure.
 */

import type { BoardRecord, ColumnDefinition, ColumnValue, ViewGroupBy } from "../types";
import {
  UNKNOWN_OPTION_LABEL,
  getColumnOptions,
  resolveOptionDisplay,
} from "../lib/option-lookup";

// ── Simplified Group shape (matches ViewRendererProps.groups) ──

/** The shape of BoardGroup as passed to view renderers */
export interface ViewBoardGroup {
  id: string;
  name: string;
  color?: string;
  order: number;
}

// ── Group Maps ─────────────────────────────────────────────

export interface GroupedColumn {
  columnId: string;
  columnLabel: string;
  columnType: string;
}

export interface GroupEntry {
  id: string;
  label: string;
  color?: string;
  count: number;
  collapsed: boolean;
  records: BoardRecord[];
}

export interface GroupedResult {
  groups: GroupEntry[];
  ungrouped: BoardRecord[];
  groupByColumn: GroupedColumn | null;
  boardGroupUsed: boolean;
}

/**
 * Group records by a column's value.
 *
 * Extracts unique values from the specified column and assigns
 * each record to its value group. Records without a value for
 * this column go to "ungrouped".
 */
export function groupRecordsByColumn(
  records: BoardRecord[],
  column: ColumnDefinition,
  cellValues: Map<string, ColumnValue>,
): { label: string; records: BoardRecord[] }[] {
  const groupsMap = new Map<string, BoardRecord[]>();
  const ungrouped: BoardRecord[] = [];

  for (const record of records) {
    const key = `${record.id}:${column.id}`;
    const value = cellValues.get(key);

    if (value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) {
      ungrouped.push(record);
    } else {
      const label = String(value);
      const existing = groupsMap.get(label) ?? [];
      existing.push(record);
      groupsMap.set(label, existing);
    }
  }

  const groups: { label: string; records: BoardRecord[] }[] = [];
  for (const [label, groupRecords] of groupsMap.entries()) {
    groups.push({ label, records: groupRecords });
  }

  if (ungrouped.length > 0) {
    groups.push({ label: "", records: ungrouped });
  }

  return groups.sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Group records by their structural BoardGroup.
 *
 * This respects the board's actual structural groups (e.g. May/June/July),
 * NOT view-level display grouping. Used when a view wants to render
 * one section per BoardGroup.
 */
export function groupRecordsByBoardGroup(
  records: BoardRecord[],
  boardGroups: ViewBoardGroup[],
): GroupEntry[] {
  const sortedGroups = [...boardGroups].sort((a, b) => a.order - b.order);

  return sortedGroups.map((group) => {
    const groupRecords = records.filter((r) => r.groupId === group.id);
    return {
      id: group.id,
      label: group.name,
      color: group.color,
      count: groupRecords.length,
      collapsed: false,
      records: groupRecords,
    };
  });
}

/**
 * Group records using a ViewGroupBy configuration.
 *
 * This is the MAIN grouping function used by Kanban, Timeline, etc.
 * It supports two modes:
 * 1. Group by a column (view-level display grouping) — e.g. group by Status
 * 2. Group by BoardGroup (structural grouping) — e.g. group by month
 * 3. Fallback: use BoardGroups if they exist
 *
 * All of this is pure logic — no data mutation, no CRUD bypass.
 */
export function groupRecordsByViewGroupBy(
  records: BoardRecord[],
  viewGroupBy: ViewGroupBy | undefined,
  columns: ColumnDefinition[],
  boardGroups: ViewBoardGroup[],
  cellValues: Map<string, ColumnValue>,
  options?: {
    sortGroups?: "asc" | "desc";
    showEmptyGroups?: boolean;
  },
): GroupedResult {
  const showEmptyGroups = options?.showEmptyGroups ?? true;

  // Mode 1: Group by a column (view-level display grouping)
  if (viewGroupBy?.columnId) {
    return groupByColumn(records, viewGroupBy, columns, cellValues);
  }

  // Mode 2: Group by BoardGroup (structural) or fallback
  return groupByBoardGroups(records, boardGroups, showEmptyGroups);
}

function groupByColumn(
  records: BoardRecord[],
  viewGroupBy: ViewGroupBy,
  columns: ColumnDefinition[],
  cellValues: Map<string, ColumnValue>,
): GroupedResult {
  const column = columns.find((c) => c.id === viewGroupBy.columnId);
  if (!column) {
    return { groups: [], ungrouped: records, groupByColumn: null, boardGroupUsed: false };
  }

  const columnGroups = groupRecordsByColumn(records, column, cellValues);
  // Group keys are the raw stored values (option ids for option columns); the
  // header must show the option's label, and must never leak a raw "opt-…" id.
  const options = getColumnOptions(column);

  const groupEntryMap = new Map<string, GroupEntry>();

  for (const colGroup of columnGroups) {
    const rawLabel = colGroup.label || "";
    const resolved = resolveOptionDisplay(options, rawLabel);
    const displayLabel = rawLabel
      ? resolved.isUnknown
        ? UNKNOWN_OPTION_LABEL
        : resolved.label
      : "No value";
    const entry: GroupEntry = {
      id: rawLabel || "__ungrouped__",
      label: displayLabel,
      color: resolved.option?.color,
      count: colGroup.records.length,
      collapsed: viewGroupBy.collapsedGroupIds?.includes(rawLabel || "__ungrouped__") ?? false,
      records: colGroup.records,
    };
    groupEntryMap.set(entry.id, entry);
  }

  const groupsArray = Array.from(groupEntryMap.values());
  const ungrouped = groupsArray.find((g) => g.id === "__ungrouped__")?.records ?? [];

  return {
    groups: groupsArray.filter((g) => g.id !== "__ungrouped__"),
    ungrouped,
    groupByColumn: {
      columnId: column.id,
      columnLabel: column.label,
      columnType: column.type,
    },
    boardGroupUsed: false,
  };
}

function groupByBoardGroups(
  records: BoardRecord[],
  boardGroups: ViewBoardGroup[],
  showEmptyGroups: boolean,
): GroupedResult {
  if (boardGroups.length > 0) {
    const groupEntries = groupRecordsByBoardGroup(records, boardGroups);
    return {
      groups: groupEntries.filter((g) => showEmptyGroups || g.records.length > 0),
      ungrouped: records.filter((r) => !r.groupId),
      groupByColumn: null,
      boardGroupUsed: true,
    };
  }

  // Fallback: no grouping at all
  return {
    groups: [{ id: "__all__", label: "All", count: records.length, collapsed: false, records }],
    ungrouped: [],
    groupByColumn: null,
    boardGroupUsed: false,
  };
}

// ── Filter by Date Range ───────────────────────────────────

export interface DateRangeFilter {
  startDate: string | null;
  endDate: string | null;
  dateColumnId: string;
}

/**
 * Filter records by a date range on a specific date column.
 * Used by Calendar and Timeline views.
 */
export function filterRecordsByDateRange(
  records: BoardRecord[],
  filter: DateRangeFilter,
  cellValues: Map<string, ColumnValue>,
): BoardRecord[] {
  const { startDate, endDate, dateColumnId } = filter;

  return records.filter((record) => {
    const key = `${record.id}:${dateColumnId}`;
    const value = cellValues.get(key);

    if (!value) return false;

    const dateStr = String(value);
    if (!dateStr) return false;

    // Simple date string comparison (ISO format: YYYY-MM-DD)
    if (startDate && dateStr < startDate) return false;
    if (endDate && dateStr > endDate) return false;

    return true;
  });
}

/**
 * Extract unique values from a column for a set of records.
 * Used to determine Kanban column headers and filter options.
 */
export function getUniqueColumnValues(
  records: BoardRecord[],
  columnId: string,
  cellValues: Map<string, ColumnValue>,
): string[] {
  const valueSet = new Set<string>();

  for (const record of records) {
    const key = `${record.id}:${columnId}`;
    const value = cellValues.get(key);
    if (value !== null && value !== undefined && value !== "") {
      valueSet.add(String(value));
    }
  }

  return Array.from(valueSet).sort();
}

/**
 * Get a cell value for a record/column pair with safe defaults.
 */
export function getCellValue(
  recordId: string,
  columnId: string,
  cellValues: Map<string, ColumnValue>,
  defaultValue: ColumnValue = null,
): ColumnValue {
  return cellValues.get(`${recordId}:${columnId}`) ?? defaultValue;
}

