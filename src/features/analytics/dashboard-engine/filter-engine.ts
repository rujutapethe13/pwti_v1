/**
 * Dashboard Filter Engine
 *
 * Applies dashboard-level filters and date range constraints
 * to board data retrieved from the Query Service.
 *
 * Filters are metadata-driven — no board-specific logic.
 * Date ranges are resolved to (start, end) Date objects.
 */

import type {
  DashboardFilter,
  BoardQueryResult,
  BoardRecord,
  ColumnValue,
  ViewFilter,
  DateRangePreset,
} from "@/lib/analytics/contracts";

// ── Date Range Resolution ──────────────────────────────────

export interface DateRange {
  start: Date;
  end: Date;
  preset: DateRangePreset;
}

export const FilterEngine = {
  /**
   * Resolve a DateRangePreset to concrete start/end dates.
   */
  resolveDateRange(
    preset: DateRangePreset,
    customRange?: { start: string; end: string },
  ): DateRange {
    const now = new Date();
    const startOfDay = (d: Date) =>
      new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const endOfDay = (d: Date) =>
      new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

    let start: Date;
    let end: Date = endOfDay(now);

    switch (preset) {
      case "today":
        start = startOfDay(now);
        break;
      case "yesterday": {
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        start = startOfDay(yesterday);
        end = endOfDay(yesterday);
        break;
      }
      case "this_week": {
        const dayOfWeek = now.getDay();
        const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
        start = startOfDay(new Date(now.setDate(diff)));
        break;
      }
      case "this_month":
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case "last_month": {
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
        break;
      }
      case "last_7_days": {
        const d7 = new Date(now);
        d7.setDate(d7.getDate() - 6);
        start = startOfDay(d7);
        break;
      }
      case "last_30_days": {
        const d30 = new Date(now);
        d30.setDate(d30.getDate() - 29);
        start = startOfDay(d30);
        break;
      }
      case "last_90_days": {
        const d90 = new Date(now);
        d90.setDate(d90.getDate() - 89);
        start = startOfDay(d90);
        break;
      }
      case "this_year":
        start = new Date(now.getFullYear(), 0, 1);
        break;
      case "custom":
        if (customRange) {
          start = new Date(customRange.start);
          end = new Date(customRange.end);
        } else {
          start = startOfDay(now);
        }
        break;
      case "all_time":
      default:
        start = new Date(0);
        break;
    }

    return { start, end, preset };
  },

  /**
   * Apply dashboard-level filters to board query results.
   */
  applyFilters(
    data: BoardQueryResult,
    filters: DashboardFilter[],
    dateRange?: DateRange,
  ): BoardQueryResult {
    let filteredRecords = data.records;

    if (dateRange) {
      filteredRecords = filteredRecords.filter((record) => {
        const createdAt = new Date(record.createdAt);
        return createdAt >= dateRange.start && createdAt <= dateRange.end;
      });
    }

    if (filters.length > 0) {
      filteredRecords = filteredRecords.filter((record) =>
        filters.every((filter) =>
          this.applyFilter(record, filter, data.cellValues),
        ),
      );
    }

    return {
      ...data,
      records: filteredRecords,
      filteredRecordCount: filteredRecords.length,
    };
  },

  /**
   * Convert a DashboardFilter to a ViewFilter.
   */
  toViewFilter(filter: DashboardFilter): ViewFilter {
    return {
      columnId: filter.field,
      operator: filter.operator,
      value: filter.value,
    };
  },

  /**
   * Apply a single filter to a record.
   */
  applyFilter(
    record: BoardRecord,
    filter: DashboardFilter,
    cellValues: Map<string, ColumnValue>,
  ): boolean {
    const key = `${record.id}:${filter.field}`;
    const value = cellValues.get(key);

    if (filter.operator === "is_empty") {
      return value === null || value === undefined || value === "";
    }
    if (filter.operator === "not_empty") {
      return value !== null && value !== undefined && value !== "";
    }

    const filterValue = filter.value;
    if (filterValue === undefined) return true;

    switch (filter.operator) {
      case "eq":
        return value === filterValue;
      case "neq":
        return value !== filterValue;
      case "contains":
        return (
          typeof value === "string" &&
          typeof filterValue === "string" &&
          value.toLowerCase().includes(filterValue.toLowerCase())
        );
      case "gt":
        return (
          typeof value === "number" &&
          typeof filterValue === "number" &&
          value > filterValue
        );
      case "gte":
        return (
          typeof value === "number" &&
          typeof filterValue === "number" &&
          value >= filterValue
        );
      case "lt":
        return (
          typeof value === "number" &&
          typeof filterValue === "number" &&
          value < filterValue
        );
      case "lte":
        return (
          typeof value === "number" &&
          typeof filterValue === "number" &&
          value <= filterValue
        );
      case "in": {
        if (Array.isArray(filterValue)) {
          return filterValue.some((item) => item === value);
        }
        return false;
      }
      default:
        return true;
    }
  },

  /**
   * Collect distinct values for a column across all records.
   */
  collectColumnValues(
    records: BoardRecord[],
    columnId: string,
    cellValues: Map<string, ColumnValue>,
  ): ColumnValue[] {
    const valueSet = new Set<ColumnValue>();
    for (const record of records) {
      const key = `${record.id}:${columnId}`;
      const value = cellValues.get(key);
      if (value !== null && value !== undefined) {
        if (Array.isArray(value)) {
          value.forEach((v) => valueSet.add(v));
        } else {
          valueSet.add(value);
        }
      }
    }
    return Array.from(valueSet);
  },
};
