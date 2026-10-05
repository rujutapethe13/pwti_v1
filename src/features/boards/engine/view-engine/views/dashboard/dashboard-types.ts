/**
 * Dashboard View — Types & Helpers
 *
 * Self-contained type definitions and pure data helpers for the Dashboard board
 * view. Every column/group/status-label list is resolved dynamically from the
 * live board schema/data — nothing here is hardcoded to a specific board.
 */

import type { ColumnDefinition, ColumnValue, ColumnTypeKey } from "../../../types";
import type {
  ClientAliasMap,
  DashboardColumnRoles,
  DashboardMeasure,
  DashboardRoleKey,
  StatusBucketMap,
} from "./column-roles";
import { RECORD_TITLE_COLUMN_ID } from "./column-roles";
import { findOptionForValue, normalizeOptions } from "../../../lib/option-lookup";
export type { ColumnTypeKey };
export type { ClientAliasMap, DashboardColumnRoles, DashboardMeasure, StatusBucketMap };
export { RECORD_TITLE_COLUMN_ID };

// ═══════════════════════════════════════════════════════════
// WIDGET INSTANCE & VIEW SETTINGS
// ═══════════════════════════════════════════════════════════

export type DashboardWidgetType =
  | "number"
  | "chart"
  | "data-over-time"
  | "kpi-card"
  | "due-list"
  | "jobs-table";

export interface DashboardWidgetInstance {
  id: string;
  type: DashboardWidgetType;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
  config: Record<string, unknown>;
  hasFilter: boolean;
}

export interface DashboardFilterCondition {
  id: string;
  columnId: string;
  operator: string;
  value: ColumnValue;
}

export interface DashboardViewSettings {
  widgets: DashboardWidgetInstance[];
  toolbarCollapsed: boolean;
  dashboardFilters: DashboardFilterCondition[];
  filtersActive: boolean;
  /**
   * Per-board column role mapping (Client, Received date, …) used by the
   * default dashboard template and the role-driven widgets. Optional so
   * dashboards saved before this feature keep loading untouched.
   */
  columnRoles?: DashboardColumnRoles;
  /** Raw status cell value → status bucket. */
  statusBuckets?: StatusBucketMap;
  /** Alias client name → canonical client name. */
  clientAliases?: ClientAliasMap;
  /** True once the user has completed (or skipped) the mapping step. */
  columnMappingDone?: boolean;
  /** Dashboard-wide measure for every chart: Jobs | Images | SKUs. */
  measure?: DashboardMeasure;
}

// ═══════════════════════════════════════════════════════════
// WIDGET CONFIG SHAPES (stored inside widget.config)
// ═══════════════════════════════════════════════════════════

export type NumberCountType = "count" | "columns";
export type UnitType = "none" | "currency" | "euro" | "pound" | "percent" | "custom";
export type NumberCalc = "sum" | "average" | "median" | "min" | "max" | "count";

export interface NumberWidgetConfig {
  countType: NumberCountType;
  countOptions: { items: boolean; subitems: boolean };
  columnIds: string[];
  unit: UnitType;
  unitCustom: string;
  unitAlign: "left" | "right";
  calculation: NumberCalc;
  decimalPlaces: "auto" | number;
  groups: DashboardWidgetGroupFilter;
  visibleColumns: string[];
}

export type DashboardWidgetGroupFilter = { all: boolean; top: boolean; ids: string[] };

export type ChartTypeKey =
  | "pie"
  | "donut"
  | "bar"
  | "stacked_bar"
  | "bar_100"
  | "line"
  | "line_multi"
  | "line_smoothed"
  | "line_dashed"
  | "column"
  | "stacked_column"
  | "column_100"
  | "area"
  | "stacked_area"
  | "dual_tone_area"
  | "bubble";

export interface BenchmarkLine {
  id: string;
  value: number;
  label: string;
  color: string;
}

export type YAxisMode = "count" | "column";
export type ChartCalc = "sum" | "average" | "median" | "min" | "max";
export type SortBy = "y_asc" | "y_desc" | "label_asc" | "label_desc";
export type PieValueMode = "value" | "percent";

export interface ChartWidgetConfig {
  chartType: ChartTypeKey;
  xAxisColumnId: string;
  stackByColumnId: string;
  yAxisMode: YAxisMode;
  yAxisColumnId: string;
  calculation: ChartCalc;
  showOnlyTopBottom: boolean;
  showCumulative: boolean;
  showEmptyValues: boolean;
  showLabels: boolean;
  showGrid: boolean;
  seriesColors: Record<string, string>;
  sortBy: SortBy;
  benchmarkLines: BenchmarkLine[];
  groups: DashboardWidgetGroupFilter;
  visibleColumns: string[];
  /**
   * Role that supplies the X-axis. Resolved live from the board's role mapping
   * so re-mapping a column repoints the widget immediately; `xAxisColumnId`
   * stays as the fallback for hand-picked columns.
   */
  xAxisRole?: DashboardRoleKey;
  /** Role that supplies "Stack by", resolved live like `xAxisRole`. */
  stackByRole?: DashboardRoleKey;
  /** Pie/Donut only: how to format slice values. */
  showValueAs?: PieValueMode;
  /** Pie/Donut: user-defined label overrides keyed by original label. */
  seriesLabelOverrides?: Record<string, string>;
  /**
   * Optional derived Y-axis instead of a stored column. "turnaround" measures
   * days between the received and completed role dates, which no single column
   * holds.
   */
  calcSource?: "turnaround";
  /** Roles used when calcSource is set. */
  calcFromRole?: string;
  calcToRole?: string;
  /**
   * Dashboard-wide measure applied on top of the widget's own Y-axis choice.
   * Set by the default template so the top-bar Measure switch drives this chart.
   */
  useMeasure?: boolean;
}

export type DataOverTimeGranularity = "day" | "week" | "month" | "quarter" | "year";
export type DataOverTimeValueMode = "count" | "column";
export type DataOverTimeSortBy = "asc" | "desc";

export interface DataOverTimeWidgetConfig {
  chartType: ChartTypeKey;
  timeColumnId: string;
  /** Role that supplies the time axis, resolved live from the role mapping. */
  timeRole?: DashboardRoleKey;
  granularity: DataOverTimeGranularity;
  valueMode: DataOverTimeValueMode;
  valueColumnId: string;
  calculation: ChartCalc;
  groupByColumnId: string;
  stacked: boolean;
  seriesColors: Record<string, string>;
  showLabels: boolean;
  showGrid: boolean;
  showTopBottomOnly: boolean;
  showCumulative: boolean;
  showEmptyValues: boolean;
  sortBy: DataOverTimeSortBy;
  benchmarkLines: BenchmarkLine[];
  groups: DashboardWidgetGroupFilter;
  visibleColumns: string[];
  /** Set by the default template so the top-bar Measure switch drives this chart. */
  useMeasure?: boolean;
}

// ═══════════════════════════════════════════════════════════
// DEFAULT CONFIGS
// ═══════════════════════════════════════════════════════════

export const DEFAULT_NUMBER_CONFIG: NumberWidgetConfig = {
  countType: "count",
  countOptions: { items: true, subitems: true },
  columnIds: [],
  unit: "none",
  unitCustom: "",
  unitAlign: "right",
  calculation: "count",
  decimalPlaces: "auto",
  groups: { all: true, top: true, ids: [] },
  visibleColumns: [],
};

export const DEFAULT_CHART_CONFIG: ChartWidgetConfig = {
  chartType: "bar",
  xAxisColumnId: "",
  stackByColumnId: "",
  yAxisMode: "count",
  yAxisColumnId: "",
  calculation: "sum",
  showOnlyTopBottom: false,
  showCumulative: false,
  showEmptyValues: false,
  showLabels: true,
  showGrid: true,
  seriesColors: {},
  sortBy: "y_desc",
  benchmarkLines: [],
  groups: { all: true, top: true, ids: [] },
  visibleColumns: [],
  showValueAs: "percent",
  seriesLabelOverrides: {},
};

export const DEFAULT_DATA_OVER_TIME_CONFIG: DataOverTimeWidgetConfig = {
  chartType: "line",
  timeColumnId: "",
  granularity: "month",
  valueMode: "count",
  valueColumnId: "",
  calculation: "sum",
  groupByColumnId: "",
  stacked: false,
  seriesColors: {},
  showLabels: false,
  showGrid: true,
  showTopBottomOnly: false,
  showCumulative: false,
  showEmptyValues: false,
  sortBy: "asc",
  benchmarkLines: [],
  groups: { all: true, top: true, ids: [] },
  visibleColumns: [],
};

export const DEFAULT_WIDGET_CONFIGS: Record<DashboardWidgetType, Record<string, unknown>> = {
  number: { ...DEFAULT_NUMBER_CONFIG },
  chart: { ...DEFAULT_CHART_CONFIG },
  "data-over-time": { ...DEFAULT_DATA_OVER_TIME_CONFIG },
  "kpi-card": { metric: "total_jobs", periodRole: "receivedDate", showChange: true, groups: { all: true, top: true, ids: [] } },
  "due-list": { mode: "both", daysAhead: 7, limit: 10, groups: { all: true, top: true, ids: [] } },
  "jobs-table": { limit: 10, columnRoles: ["jobType"], groups: { all: true, top: true, ids: [] } },
};

export function getDefaultWidgetConfig(type: DashboardWidgetType): Record<string, unknown> {
  return JSON.parse(JSON.stringify(DEFAULT_WIDGET_CONFIGS[type] ?? DEFAULT_CHART_CONFIG));
}

// ═══════════════════════════════════════════════════════════
// COLUMN CATEGORY HELPERS (all derived from live schema)
// ═══════════════════════════════════════════════════════════

export const NUMERIC_TYPES: ColumnTypeKey[] = ["number", "currency", "rating", "progress"];
export const DATE_TYPES: ColumnTypeKey[] = ["date", "timeline"];
export const OPTION_TYPES: ColumnTypeKey[] = ["status", "priority", "dropdown"];
export const TEXT_TYPES: ColumnTypeKey[] = ["text", "long_text", "url", "email", "formula"];

export function getNumericColumnIds(columns: ColumnDefinition[]): string[] {
  return columns.filter((c) => NUMERIC_TYPES.includes(c.type)).map((c) => c.id);
}

export function getDateColumnIds(columns: ColumnDefinition[]): string[] {
  return columns.filter((c) => DATE_TYPES.includes(c.type)).map((c) => c.id);
}

export function getOptionColumnIds(columns: ColumnDefinition[]): string[] {
  return columns.filter((c) => OPTION_TYPES.includes(c.type)).map((c) => c.id);
}

export interface StatusLabel {
  id: string;
  label: string;
  color?: string;
}

/**
 * Resolve the option labels a status/label/dropdown column actually carries.
 * These are the user-defined labels; renaming/adding/removing them is
 * reflected automatically because we read straight from column.settings.options.
 */
export function getColumnOptions(column: ColumnDefinition): StatusLabel[] {
  return normalizeOptions(column.settings?.options);
}

/** True if a column can supply a dynamic set of discrete labels for filtering. */
export function isOptionColumn(column: ColumnDefinition): boolean {
  return OPTION_TYPES.includes(column.type);
}

export function findColumn(columns: ColumnDefinition[], columnId: string): ColumnDefinition | undefined {
  return columns.find((c) => c.id === columnId);
}

export function createRecordTitleColumn(): ColumnDefinition {
  return {
    id: RECORD_TITLE_COLUMN_ID,
    boardId: "",
    key: "record_title",
    label: "Name",
    type: "text",
    required: false,
    hidden: false,
    frozen: false,
    defaultValue: "",
    settings: {},
    permissions: { view: [], edit: [], configure: [] },
    validation: [],
    version: 0,
    order: -1,
    createdAt: "",
    updatedAt: "",
  };
}

export function getCellValue(
  recordId: string,
  columnId: string,
  cellValues: Map<string, ColumnValue>,
): ColumnValue | undefined {
  return cellValues.get(`${recordId}:${columnId}`);
}

// ═══════════════════════════════════════════════════════════
// GROUP RESOLUTION
// ═══════════════════════════════════════════════════════════

export interface BoardGroup {
  id: string;
  name: string;
  color?: string;
  order: number;
}

export interface ResolvedGroup {
  id: string;
  name: string;
  color?: string;
  order: number;
  isTop: boolean;
}

/** The first structural group by order — the live "top group". */
export function getTopGroup(groups: BoardGroup[]): ResolvedGroup | null {
  if (groups.length === 0) return null;
  const sorted = [...groups].sort((a, b) => a.order - b.order);
  return { ...sorted[0], isTop: true };
}

export function resolveGroups(groups: BoardGroup[]): ResolvedGroup[] {
  const sorted = [...groups].sort((a, b) => a.order - b.order);
  const topId = sorted[0]?.id ?? null;
  return sorted.map((g) => ({ ...g, isTop: g.id === topId }));
}

interface GroupFilter {
  all: boolean;
  top: boolean;
  ids: string[];
}

/** Records to count/query, restricted to the selected structural groups. */
export function filterRecordsByGroups<T extends { id: string; groupId?: string | null }>(
  records: T[],
  groups: ResolvedGroup[],
  filter: GroupFilter,
): T[] {
  if (filter.all) return records;
  const selected = new Set<string>();
  if (filter.top) {
    const top = getTopGroup(groups);
    if (top) selected.add(top.id);
  }
  for (const id of filter.ids) selected.add(id);
  if (selected.size === 0) return [];
  return records.filter((r) => (r.groupId != null ? selected.has(r.groupId) : false));
}

// ═══════════════════════════════════════════════════════════
// AGGREGATION (reused by Number / Chart / Data Over Time)
// ═══════════════════════════════════════════════════════════

export type AggregationType =
  | "count"
  | "sum"
  | "average"
  | "median"
  | "min"
  | "max"
  | "distinct_count";

export interface AggregationResult {
  value: number | null;
  label: string;
  formatted: string;
  count: number;
}

export function extractNumericValue(
  records: Array<{ id: string }>,
  cellValues: Map<string, ColumnValue>,
  columnId: string,
): (number | null)[] {
  return records.map((record) => {
    const v = getCellValue(record.id, columnId, cellValues);
    if (typeof v === "number") return v;
    if (typeof v === "string") {
      const parsed = Number(v);
      return Number.isNaN(parsed) ? null : parsed;
    }
    return null;
  });
}

export function aggregate(values: (number | null)[], type: AggregationType, label = ""): AggregationResult {
  const nums = values.filter((v): v is number => v !== null);
  let value: number | null = null;
  switch (type) {
    case "count":
      value = nums.length;
      break;
    case "sum":
      value = nums.reduce((s, n) => s + n, 0);
      break;
    case "average":
      value = nums.length > 0 ? nums.reduce((s, n) => s + n, 0) / nums.length : null;
      break;
    case "median":
      if (nums.length > 0) {
        const sorted = [...nums].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        value = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
      }
      break;
    case "min":
      value = nums.length > 0 ? Math.min(...nums) : null;
      break;
    case "max":
      value = nums.length > 0 ? Math.max(...nums) : null;
      break;
    case "distinct_count":
      value = new Set(nums).size;
      break;
    default:
      value = nums.length;
  }
   return { value, label, formatted: formatNumber(value), count: nums.length };
}

export interface FormatOptions {
  unit?: UnitType;
  unitCustom?: string;
  unitAlign?: "left" | "right";
  decimalPlaces?: "auto" | number;
}

export function formatNumber(
  value: number | null,
  opts: { unit?: UnitType; unitCustom?: string; unitAlign?: "left" | "right"; decimalPlaces?: "auto" | number } = {},
): string {
  if (value === null) return "—";
  const dp = opts.decimalPlaces === "auto" ? (Number.isInteger(value) ? 0 : 2) : opts.decimalPlaces ?? 0;
  const formatted = value.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
  const prefix: string = opts.unit === "currency" ? "$" : opts.unit === "euro" ? "€" : opts.unit === "pound" ? "£" : opts.unit === "percent" ? "" : opts.unitCustom ?? "";
  const suffix: string = opts.unit === "percent" ? "%" : "";
  const side = opts.unitAlign ?? "right";
  return side === "left" ? `${prefix}${formatted}${suffix}` : `${formatted}${prefix}${suffix}`;
}

// ═══════════════════════════════════════════════════════════
// VALUE RESOLUTION FOR STATUS / OPTION COLUMNS
// ═══════════════════════════════════════════════════════════

/**
 * Resolve a cell value that may be stored as an option id or its label
 * into the matching option (if any). Status values are user-defined and
 * can be stored either way, so we must check both.
 */
export function resolveOptionValue(
  column: ColumnDefinition,
  raw: ColumnValue | undefined,
): StatusLabel | null {
  if (raw === null || raw === undefined) return null;
  const options = getColumnOptions(column);
  const option = findOptionForValue(options, raw);
  if (!option) return null;
  return { id: option.id, label: option.label, color: option.color };
}

// ═══════════════════════════════════════════════════════════
// FILTER CONDITIONS & EVALUATION (dashboard-wide + per-widget)
// ═══════════════════════════════════════════════════════════

export interface FilterConditionOption {
  value: string;
  label: string;
}

export const DEFAULT_CONDITIONS: FilterConditionOption[] = [
  { value: "is", label: "Is" },
  { value: "is_not", label: "Is not" },
  { value: "contains", label: "Contains" },
  { value: "is_empty", label: "Is empty" },
  { value: "not_empty", label: "Is not empty" },
];

export const CONDITION_OPTIONS: Record<string, FilterConditionOption[]> = {
  text: [
    { value: "is", label: "Is" },
    { value: "is_not", label: "Is not" },
    { value: "contains", label: "Contains" },
    { value: "not_contains", label: "Does not contain" },
    { value: "starts_with", label: "Starts with" },
    { value: "ends_with", label: "Ends with" },
    { value: "is_empty", label: "Is empty" },
    { value: "not_empty", label: "Is not empty" },
  ],
  long_text: [
    { value: "is", label: "Is" },
    { value: "is_not", label: "Is not" },
    { value: "contains", label: "Contains" },
    { value: "not_contains", label: "Does not contain" },
    { value: "is_empty", label: "Is empty" },
    { value: "not_empty", label: "Is not empty" },
  ],
  number: [
    { value: "is", label: "Is" },
    { value: "is_not", label: "Is not" },
    { value: "gt", label: "Greater than" },
    { value: "lt", label: "Less than" },
    { value: "gte", label: "Greater than or equal" },
    { value: "lte", label: "Less than or equal" },
    { value: "is_empty", label: "Is empty" },
    { value: "not_empty", label: "Is not empty" },
  ],
  currency: [
    { value: "is", label: "Is" },
    { value: "is_not", label: "Is not" },
    { value: "gt", label: "Greater than" },
    { value: "lt", label: "Less than" },
    { value: "gte", label: "Greater than or equal" },
    { value: "lte", label: "Less than or equal" },
    { value: "is_empty", label: "Is empty" },
    { value: "not_empty", label: "Is not empty" },
  ],
  date: [
    { value: "is", label: "Is" },
    { value: "is_not", label: "Is not" },
    { value: "before", label: "Before" },
    { value: "after", label: "After" },
    { value: "between", label: "Is between" },
    { value: "is_empty", label: "Is empty" },
    { value: "not_empty", label: "Is not empty" },
  ],
  timeline: [
    { value: "is", label: "Is" },
    { value: "is_not", label: "Is not" },
    { value: "before", label: "Before" },
    { value: "after", label: "After" },
    { value: "between", label: "Is between" },
    { value: "is_empty", label: "Is empty" },
    { value: "not_empty", label: "Is not empty" },
  ],
  status: [
    { value: "is", label: "Is" },
    { value: "is_not", label: "Is not" },
    { value: "is_one_of", label: "Is one of" },
    { value: "is_empty", label: "Is empty" },
    { value: "not_empty", label: "Is not empty" },
  ],
  priority: [
    { value: "is", label: "Is" },
    { value: "is_not", label: "Is not" },
    { value: "is_one_of", label: "Is one of" },
    { value: "is_empty", label: "Is empty" },
    { value: "not_empty", label: "Is not empty" },
  ],
  dropdown: [
    { value: "is", label: "Is" },
    { value: "is_not", label: "Is not" },
    { value: "is_one_of", label: "Is one of" },
    { value: "is_empty", label: "Is empty" },
    { value: "not_empty", label: "Is not empty" },
  ],
  multi_select: [
    { value: "contains", label: "Contains" },
    { value: "not_contains", label: "Does not contain" },
    { value: "is_empty", label: "Is empty" },
    { value: "not_empty", label: "Is not empty" },
  ],
  checkbox: [
    { value: "is", label: "Is checked" },
    { value: "is_not", label: "Is unchecked" },
  ],
  person: [
    { value: "is", label: "Is" },
    { value: "is_not", label: "Is not" },
    { value: "is_one_of", label: "Is one of" },
    { value: "is_empty", label: "Is empty" },
    { value: "not_empty", label: "Is not empty" },
  ],
  email: [
    { value: "is", label: "Is" },
    { value: "is_not", label: "Is not" },
    { value: "contains", label: "Contains" },
    { value: "is_empty", label: "Is empty" },
    { value: "not_empty", label: "Is not empty" },
  ],
  phone: [
    { value: "is", label: "Is" },
    { value: "is_not", label: "Is not" },
    { value: "contains", label: "Contains" },
    { value: "is_empty", label: "Is empty" },
    { value: "not_empty", label: "Is not empty" },
  ],
  url: [
    { value: "is", label: "Is" },
    { value: "is_not", label: "Is not" },
    { value: "contains", label: "Contains" },
    { value: "is_empty", label: "Is empty" },
    { value: "not_empty", label: "Is not empty" },
  ],
  tags: [
    { value: "contains", label: "Contains" },
    { value: "is_empty", label: "Is empty" },
    { value: "not_empty", label: "Is not empty" },
  ],
  files: [
    { value: "is_empty", label: "Is empty" },
    { value: "not_empty", label: "Is not empty" },
  ],
  rating: [
    { value: "is", label: "Is" },
    { value: "is_not", label: "Is not" },
    { value: "gt", label: "Greater than" },
    { value: "lt", label: "Less than" },
    { value: "is_empty", label: "Is empty" },
    { value: "not_empty", label: "Is not empty" },
  ],
  progress: [
    { value: "is", label: "Is" },
    { value: "is_not", label: "Is not" },
    { value: "gt", label: "Greater than" },
    { value: "lt", label: "Less than" },
    { value: "is_empty", label: "Is empty" },
    { value: "not_empty", label: "Is not empty" },
  ],
};

export function getConditionsForColumn(column: ColumnDefinition): FilterConditionOption[] {
  return CONDITION_OPTIONS[column.type] ?? DEFAULT_CONDITIONS;
}

export function needsValueInput(operator: string): boolean {
  return !["is_empty", "not_empty", "is_true", "is_false"].includes(operator);
}

export function isMultiSelectOperator(operator: string): boolean {
  return ["is_one_of", "contains", "not_contains"].includes(operator);
}

export function isDateOperator(operator: string): boolean {
  return ["between", "before", "after", "is", "is_not"].includes(operator);
}

export function evaluateFilter(
  column: ColumnDefinition | null | undefined,
  _record: { id: string },
  cellValue: ColumnValue | undefined,
  filter: { operator: string; value: ColumnValue },
): boolean {
  const { operator, value } = filter;

  if (operator === "is_empty") {
    return cellValue === null || cellValue === undefined || cellValue === "";
  }
  if (operator === "not_empty") {
    return cellValue !== null && cellValue !== undefined && cellValue !== "";
  }
  if (operator === "is_true") {
    return cellValue === true || cellValue === "true";
  }
  if (operator === "is_false") {
    return cellValue === false || cellValue === "false";
  }

  if (cellValue == null) return false;

  // Option columns (status / priority / dropdown) — match by id OR label.
  if (column && isOptionColumn(column)) {
    const matched = resolveOptionValue(column, cellValue);
    const matchedId = matched?.id ?? null;
    const matchedLabel = matched?.label ?? null;
    switch (operator) {
      case "is":
        return value === matchedId || value === matchedLabel || String(cellValue) === String(value);
      case "is_not":
        return value !== matchedId && value !== matchedLabel && String(cellValue) !== String(value);
      case "is_one_of": {
        const vals = Array.isArray(value) ? value : [value];
        return vals.some((v) => v === matchedId || v === matchedLabel || String(cellValue) === String(v));
      }
      default:
        return matchesText(cellValue, operator, value);
    }
  }

  // Date columns.
  if (column && (column.type === "date" || column.type === "timeline")) {
    return evaluateDateFilter(cellValue, operator, value);
  }

  // Fallback: generic comparison.
  return matchesText(cellValue, operator, value);
}

function matchesText(
  cellValue: ColumnValue,
  operator: string,
  filterValue: ColumnValue,
): boolean {
  const cellStr = String(cellValue).toLowerCase();
  const filterStr = String(filterValue).toLowerCase();
  switch (operator) {
    case "is":
    case "eq":
      return cellStr === filterStr;
    case "is_not":
    case "neq":
      return cellStr !== filterStr;
    case "contains":
      return cellStr.includes(filterStr);
    case "not_contains":
      return !cellStr.includes(filterStr);
    case "starts_with":
      return cellStr.startsWith(filterStr);
    case "ends_with":
      return cellStr.endsWith(filterStr);
    case "gt":
      return Number(cellValue) > Number(filterValue);
    case "lt":
      return Number(cellValue) < Number(filterValue);
    case "gte":
      return Number(cellValue) >= Number(filterValue);
    case "lte":
      return Number(cellValue) <= Number(filterValue);
    case "is_one_of":
      return Array.isArray(filterValue)
        ? filterValue.some((v) => String(v).toLowerCase() === cellStr)
        : cellStr === filterStr;
    default:
      return true;
  }
}

function evaluateDateFilter(
  cellValue: ColumnValue,
  operator: string,
  filterValue: ColumnValue,
): boolean {
  try {
    const date = new Date(String(cellValue));
    if (Number.isNaN(date.getTime())) return false;
    const fv = Array.isArray(filterValue) ? filterValue : [filterValue];

    switch (operator) {
      case "is":
        return isSameDay(date, new Date(String(filterValue)));
      case "is_not":
        return !isSameDay(date, new Date(String(filterValue)));
      case "before":
        return date < new Date(String(filterValue));
      case "after":
        return date > new Date(String(filterValue));
      case "between": {
        const [start, end] = fv as string[];
        const t = date.getTime();
        const s = start ? new Date(start).getTime() : Number.MIN_SAFE_INTEGER;
        const e = end ? new Date(end).getTime() : Number.MAX_SAFE_INTEGER;
        return t >= s && t <= e;
      }
      default:
        return matchesText(cellValue, operator, filterValue);
    }
  } catch {
    return false;
  }
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export interface FilterableRecord {
  id: string;
}

/** Apply a set of dashboard/per-widget filters to a record list. */
export function applyFilters<T extends FilterableRecord>(
  records: T[],
  columns: ColumnDefinition[],
  cellValues: Map<string, ColumnValue>,
  filters: DashboardFilterCondition[],
): T[] {
  if (filters.length === 0) return records;
  return records.filter((record) =>
    filters.every((filter) => {
      const column = findColumn(columns, filter.columnId);
      const cellValue = getCellValue(record.id, filter.columnId, cellValues);
      return evaluateFilter(column, record, cellValue, filter);
    }),
  );
}

export const GRID_COLUMNS = 12;

/**
 * Clamp every widget into the current grid width so a layout saved on a wide
 * window can never place a widget off-screen on a narrow one.
 */
export function clampWidgetsToGrid(
  widgets: DashboardWidgetInstance[],
  columns = GRID_COLUMNS,
): DashboardWidgetInstance[] {
  return widgets.map((widget) => {
    const minW = Math.max(1, Math.min(widget.minW ?? 1, columns));
    const w = Math.max(minW, Math.min(widget.w, columns));
    const x = Math.max(0, Math.min(widget.x, columns - w));
    return { ...widget, w, x, minW };
  });
}

// ═══════════════════════════════════════════════════════════
// LAYOUT COMPACTION (no-overlap packing)
// ═══════════════════════════════════════════════════════════

function cellsFree(
  occupied: boolean[][],
  x: number,
  y: number,
  w: number,
  h: number,
): boolean {
  for (let cx = 0; cx < w; cx++) {
    for (let cy = 0; cy < h; cy++) {
      const col = occupied[x + cx];
      if (!col) continue;
      if (col[y + cy]) return false;
    }
  }
  return true;
}

function occupy(
  occupied: boolean[][],
  x: number,
  y: number,
  w: number,
  h: number,
  value: boolean,
): void {
  for (let cx = 0; cx < w; cx++) {
    if (!occupied[x + cx]) occupied[x + cx] = [];
    const col = occupied[x + cx]!;
    for (let cy = 0; cy < h; cy++) col[y + cy] = value;
  }
}

/**
 * Pack widgets onto the grid so none overlap. Each widget is placed as close as
 * possible to its current (y, x), scanning downward then left-to-right, which
 * gives the "reflow / settle into the nearest free grid cell" behaviour.
 */
export function compactWidgets(
  widgets: DashboardWidgetInstance[],
  columns = GRID_COLUMNS,
): DashboardWidgetInstance[] {
  const occupied: boolean[][] = [];
  const sorted = [...widgets].sort((a, b) => a.y - b.y || a.x - b.x);
  const out: DashboardWidgetInstance[] = [];

  for (const widget of sorted) {
    const w = Math.max(1, Math.min(widget.w, columns));
    const h = Math.max(1, widget.h);
    let x = Math.max(0, Math.min(widget.x, columns - w));
    let y = Math.max(0, widget.y);

    let placed = false;
    for (let yy = y; yy < 10000; yy++) {
      for (let xx = 0; xx <= columns - w; xx++) {
        if (cellsFree(occupied, xx, yy, w, h)) {
          x = xx;
          y = yy;
          placed = true;
          break;
        }
      }
      if (placed) break;
    }

    occupy(occupied, x, y, w, h, true);
    out.push({ ...widget, x, y });
  }

  return out.sort((a, b) => a.y - b.y || a.x - b.x);
}

