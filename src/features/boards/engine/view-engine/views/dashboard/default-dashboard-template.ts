/**
 * Dashboard — Default Dashboard Template
 *
 * The starting layout applied when a user adds a Dashboard view from the
 * "Add view" menu. It is a JSON widget list stored on the view, exactly like a
 * hand-built layout, so every widget stays draggable, resizable, retitleable
 * and deletable afterwards.
 *
 * The layout is expressed against *roles*, not column IDs. Existing chart /
 * data-over-time widgets resolve a role to a column ID at build time; role
 * widgets (KPI card, due list, jobs table) resolve it live, so re-mapping a
 * column in "Map your columns" immediately repoints them.
 */

import type { ColumnDefinition } from "../../../types";
import type { DashboardWidgetInstance } from "./dashboard-types";
import {
  DEFAULT_CHART_CONFIG,
  DEFAULT_DATA_OVER_TIME_CONFIG,
  DEFAULT_NUMBER_CONFIG,
  GRID_COLUMNS,
  compactWidgets,
} from "./dashboard-types";
import {
  KPI_DEFAULT_PERIOD_ROLE,
  type KpiMetric,
} from "./role-widgets";
import {
  suggestRoleMapping,
  type ClientAliasMap,
  type DashboardColumnRoles,
  type DashboardMeasure,
  type DashboardRoleKey,
  type StatusBucketMap,
} from "./column-roles";

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════

let widgetSeq = 0;
const nextWidgetId = (prefix: string) => `${prefix}-${Date.now()}-${++widgetSeq}`;

interface WidgetSpec {
  key: string;
  type: DashboardWidgetInstance["type"];
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  config: Record<string, unknown>;
}

function columnId(roles: DashboardColumnRoles, role: DashboardRoleKey): string {
  return roles[role] ?? "";
}

/** Chart config overlay shared by every template chart. */

function chartSpec(
  key: string,
  title: string,
  position: { x: number; y: number; w: number; h: number },
  config: Record<string, unknown>,
): WidgetSpec {
  return {
    key,
    type: "chart",
    title,
    ...position,
    minW: 3,
    minH: 3,
    config: { ...DEFAULT_CHART_CONFIG, ...config },
  };
}

// ═══════════════════════════════════════════════════════════
// LAYOUT
// ═══════════════════════════════════════════════════════════

const KPI_ORDER: KpiMetric[] = [
  "total_jobs",
  "working_on_it",
  "done",
  "overdue",
  "total_images",
  "total_skus",
];

/**
 * Build the default widget list.
 *
 * Row 1  KPI cards
 * Row 2  Volume trend (received vs done) + status breakdown
 * Row 3  Volume by client / by job type / client × job type
 * Row 4  SKUs by client / workload by owner / avg turnaround by client
 * Row 5  Overdue & upcoming list + recent jobs table
 */
export function buildDefaultDashboardWidgets(
  roles: DashboardColumnRoles,
): DashboardWidgetInstance[] {
  const specs: WidgetSpec[] = [];

  // ── Row 1: KPI cards ─────────────────────────────────────
  // Six cards across the 12-column grid.
  const kpiWidth = Math.floor(GRID_COLUMNS / KPI_ORDER.length);
  KPI_ORDER.forEach((metric, index) => {
    specs.push({
      key: `kpi-${metric}`,
      type: "kpi-card",
      title: metricTitle(metric),
      x: index * kpiWidth,
      y: 0,
      w: kpiWidth,
      h: 2,
      minW: 2,
      minH: 2,
      config: {
        metric,
        periodRole: KPI_DEFAULT_PERIOD_ROLE[metric],
        showChange: true,
        groups: { all: true, top: true, ids: [] },
      },
    });
  });

  // ── Row 2: volume trend + status breakdown ───────────────
  specs.push({
    key: "trend",
    type: "data-over-time",
    title: "Volume trend — received",
    x: 0,
    y: 2,
    w: 8,
    h: 4,
    minW: 3,
    minH: 3,
    config: {
      ...DEFAULT_DATA_OVER_TIME_CONFIG,
      chartType: "line",
      timeColumnId: columnId(roles, "receivedDate"),
      timeRole: "receivedDate",
      granularity: "month",
      valueMode: "count",
      useMeasure: true,
      showLabels: false,
    },
  });
  specs.push({
    key: "trend-done",
    type: "data-over-time",
    title: "Volume trend — completed",
    x: 0,
    y: 6,
    w: 8,
    h: 4,
    minW: 3,
    minH: 3,
    config: {
      ...DEFAULT_DATA_OVER_TIME_CONFIG,
      chartType: "line",
      timeColumnId: columnId(roles, "completedDate"),
      timeRole: "completedDate",
      granularity: "month",
      valueMode: "count",
      useMeasure: true,
      showLabels: false,
    },
  });
  specs.push(
    chartSpec(
      "status",
      "Status breakdown",
      { x: 8, y: 2, w: 4, h: 8 },
      {
        chartType: "donut",
        // Role-bound: "Status breakdown" groups by the mapped Status column
        // only. It never falls back to another column.
        xAxisRole: "status",
        xAxisColumnId: columnId(roles, "status"),
        yAxisMode: "count",
        yAxisColumnId: "",
        useMeasure: true,
        showValueAs: "percent",
        sortBy: "y_desc",
      },
    ),
  );

  // ── Row 3: client / job type breakdowns ──────────────────
  specs.push(
    chartSpec(
      "by-client",
      "Volume by client",
      { x: 0, y: 10, w: 4, h: 5 },
      {
        chartType: "bar",
        xAxisRole: "client",
        xAxisColumnId: columnId(roles, "client"),
        yAxisMode: "count",
        yAxisColumnId: "",
        useMeasure: true,
        sortBy: "y_desc",
      },
    ),
  );
  specs.push(
    chartSpec(
      "by-job-type",
      "Volume by job type",
      { x: 4, y: 10, w: 4, h: 5 },
      {
        chartType: "donut",
        xAxisRole: "jobType",
        yAxisMode: "count",
        yAxisColumnId: "",
        useMeasure: true,
        showValueAs: "percent",
        sortBy: "y_desc",
      },
    ),
  );
  specs.push(
    chartSpec(
      "client-x-job-type",
      "Client × job type",
      { x: 8, y: 10, w: 4, h: 5 },
      {
        chartType: "stacked_bar",
        xAxisRole: "client",
        xAxisColumnId: columnId(roles, "client"),
        stackByRole: "jobType",
        stackByColumnId: columnId(roles, "jobType"),
        yAxisMode: "count",
        yAxisColumnId: "",
        useMeasure: true,
        sortBy: "y_desc",
      },
    ),
  );

  // ── Row 4: SKUs / workload / turnaround ──────────────────
  specs.push(
    chartSpec(
      "skus-by-client",
      "SKU count by client",
      { x: 0, y: 15, w: 4, h: 5 },
      {
        chartType: "bar",
        xAxisRole: "client",
        xAxisColumnId: columnId(roles, "client"),
        // SKU count is stored as text on some boards ("41+15"), so the chart
        // reads it with the loose-number parser.
        yAxisMode: "column",
        yAxisColumnId: columnId(roles, "skuCount"),
        sortBy: "y_desc",
      },
    ),
  );
  specs.push(
    chartSpec(
      "workload-by-owner",
      "Workload by owner",
      { x: 4, y: 15, w: 4, h: 5 },
      {
        chartType: "bar",
        xAxisRole: "owner",
        xAxisColumnId: columnId(roles, "owner"),
        yAxisMode: "count",
        yAxisColumnId: "",
        useMeasure: true,
        sortBy: "y_desc",
      },
    ),
  );
  specs.push(
    chartSpec(
      "turnaround-by-client",
      "Avg turnaround by client",
      { x: 8, y: 15, w: 4, h: 5 },
      {
        chartType: "bar",
        xAxisRole: "client",
        xAxisColumnId: columnId(roles, "client"),
        // Turnaround is derived (completed − received), not a stored column.
        yAxisMode: "column",
        yAxisColumnId: "",
        calcSource: "turnaround",
        calculation: "average",
        sortBy: "y_desc",
      },
    ),
  );

  // ── Row 5: lists ──────────────────────────────────────────
  specs.push({
    key: "due-list",
    type: "due-list",
    title: "Overdue & due in next 7 days",
    x: 0,
    y: 20,
    w: 6,
    h: 5,
    minW: 3,
    minH: 3,
    config: { mode: "both", daysAhead: 7, limit: 10, groups: { all: true, top: true, ids: [] } },
  });
  specs.push({
    key: "jobs-table",
    type: "jobs-table",
    title: "Recent jobs",
    x: 6,
    y: 20,
    w: 6,
    h: 5,
    minW: 3,
    minH: 3,
    config: { limit: 10, columnRoles: ["jobType"], groups: { all: true, top: true, ids: [] } },
  });

  const widgets: DashboardWidgetInstance[] = specs.map((spec) => ({
    id: nextWidgetId(spec.key),
    type: spec.type,
    title: spec.title,
    x: spec.x,
    y: spec.y,
    w: Math.min(spec.w, GRID_COLUMNS),
    h: spec.h,
    minW: spec.minW,
    minH: spec.minH,
    config: spec.config,
    hasFilter: false,
  }));

  return compactWidgets(widgets);
}

/**
 * Role bindings for the template's own widgets, keyed by the stable id prefix
 * `nextWidgetId` generates. Used to repair dashboards saved before widgets
 * were role-bound, so "Status breakdown" cannot keep grouping by whatever
 * column it happened to be pointed at (often the client column, because the
 * Name column reads as the client name).
 */
const TEMPLATE_ROLE_BINDINGS: Record<string, Record<string, string>> = {
  status: { xAxisRole: "status" },
  trend: { timeRole: "receivedDate" },
  "trend-done": { timeRole: "completedDate" },
  "by-client": { xAxisRole: "client" },
  "by-job-type": { xAxisRole: "jobType" },
  "client-x-job-type": { xAxisRole: "client", stackByRole: "jobType" },
  "skus-by-client": { xAxisRole: "client" },
  "workload-by-owner": { xAxisRole: "owner" },
  "turnaround-by-client": { xAxisRole: "client" },
};

/**
 * Re-apply the role bindings above to a saved widget list. Column ids already
 * stored in the config are left untouched so a hand-edited layout keeps its
 * explicit column choices; only the role that drives them is added.
 */
export function repairRoleBoundWidgets(
  widgets: DashboardWidgetInstance[],
): DashboardWidgetInstance[] {
  return widgets.map((widget) => {
    // `nextWidgetId` builds "<key>-<timestamp>-<seq>", so the key is every
    // leading segment except the last two.
    const segments = widget.id.split("-");
    const key = segments.slice(0, Math.max(1, segments.length - 2)).join("-");
    const binding = TEMPLATE_ROLE_BINDINGS[key];
    if (!binding || widget.type === "kpi-card" || widget.type === "due-list" || widget.type === "jobs-table") {
      return widget;
    }
    const config = { ...widget.config };
    let changed = false;
    for (const [field, role] of Object.entries(binding)) {
      if (config[field]) continue;
      config[field] = role;
      changed = true;
    }
    return changed ? { ...widget, config } : widget;
  });
}

/**
 * Full default view settings for a newly created Dashboard view.
 *
 * `columnMappingDone` stays false so the DashboardView opens the "Map your
 * columns" step exactly once, on first render.
 */
export function buildDefaultDashboardSettings(columns: ColumnDefinition[]): {
  widgets: DashboardWidgetInstance[];
  columnRoles: DashboardColumnRoles;
  statusBuckets: StatusBucketMap;
  clientAliases: ClientAliasMap;
  columnMappingDone: boolean;
  measure: DashboardMeasure;
} {
  const roles = suggestRoleMapping(columns);
  return {
    widgets: buildDefaultDashboardWidgets(roles),
    columnRoles: roles,
    statusBuckets: {},
    clientAliases: {},
    columnMappingDone: false,
    measure: "jobs",
  };
}

function metricTitle(metric: KpiMetric): string {
  switch (metric) {
    case "total_jobs":
      return "Total jobs";
    case "working_on_it":
      return "Working on it";
    case "done":
      return "Done";
    case "overdue":
      return "Overdue";
    case "total_images":
      return "Total images";
    case "total_skus":
      return "Total SKUs";
    default:
      return "Number";
  }
}

/** Number widget config reused by the optional "Total jobs" style cards. */
export { DEFAULT_NUMBER_CONFIG };
