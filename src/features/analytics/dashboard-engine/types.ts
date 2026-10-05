/**
 * Dashboard & Analytics Engine — Type Definitions
 *
 * Metadata-driven dashboard entity following the same registration
 * pattern as Boards/Views in the existing system.
 */

import type { LucideIcon } from "lucide-react";
import type { ComponentType } from "react";
import type {
  BoardQueryResult,
  ColumnValue,
  FilterOperator,
  DateRangePreset,
  DashboardFilter,
  AggregationType,
  ChartType,
} from "@/lib/analytics/contracts";

// ═══════════════════════════════════════════════════════════
// DASHBOARD ENTITY
// ═══════════════════════════════════════════════════════════

export interface Dashboard {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  layout: DashboardLayout;
  settings: DashboardSettings;
  isDefault: boolean;
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * react-grid-layout compatible layout schema.
 * Stored as JSONB, directly consumable by react-grid-layout.
 * One array per breakpoint — lg (≥1200px), md (≥996px), sm (≥768px).
 */
export interface DashboardLayout {
  lg: GridItem[];
  md: GridItem[];
  sm: GridItem[];
}

export interface GridItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  static?: boolean;
}

export interface DashboardSettings {
  defaultDateRange: DateRangePreset;
  customDateRange?: { start: string; end: string };
  refreshInterval: number;
  globalFilters: DashboardFilter[];
  defaultBoardId?: string;
}

// ═══════════════════════════════════════════════════════════
// WIDGET INSTANCE
// ═══════════════════════════════════════════════════════════

export interface WidgetInstance {
  id: string;
  dashboardId: string;
  type: string;
  title: string;
  config: Record<string, unknown>;
  boardId?: string;
  position: number;
  createdAt: string;
  updatedAt: string;
}

// ═══════════════════════════════════════════════════════════
// WIDGET PLUGIN INTERFACE
// ═══════════════════════════════════════════════════════════

export interface WidgetPlugin<TConfig = Record<string, unknown>> {
  /** Unique widget type key (e.g. "kpi", "chart.bar", "table") */
  type: string;

  /** Human-readable display name */
  displayName: string;

  /** Icon for the widget picker */
  icon: LucideIcon;

  /** Default configuration for new widget instances */
  defaultConfig: TConfig;

  /** Zod schema for config validation (simplified to Record in this contract) */
  configSchema: Record<string, unknown>;

  /** React component for rendering the widget */
  render: ComponentType<WidgetRenderProps<TConfig>>;

  /** Minimum grid size in react-grid-layout units */
  minSize: { w: number; h: number };

  /** Optional: editor component for configuring the widget */
  editor?: ComponentType<{
    config: TConfig;
    onChange: (config: Partial<TConfig>) => void;
    boardData?: BoardQueryResult;
  }>;
}

export interface WidgetRenderProps<TConfig = Record<string, unknown>> {
  widget: WidgetInstance;
  config: TConfig;
  boardData?: BoardQueryResult;
  filters: DashboardFilter[];
  dateRange: { start: Date; end: Date; preset: DateRangePreset };
  isActive: boolean;
  onConfigChange: (config: Partial<TConfig>) => void;
}

// ═══════════════════════════════════════════════════════════
// AGGREGATION HELPERS
// ═══════════════════════════════════════════════════════════

export interface AggregationConfig {
  type: AggregationType;
  field: string;
  label?: string;
  format?: "number" | "currency" | "percentage" | "duration";
  decimalPlaces?: number;
  prefix?: string;
  suffix?: string;
}

export interface AggregationResult {
  type: AggregationType;
  value: number | null;
  label: string;
  formattedValue: string;
}

export interface KpiConfig {
  aggregation: AggregationConfig;
  target?: number;
  comparison?: AggregationConfig;
  showTrendline: boolean;
  showSparkline: boolean;
  showComparison: boolean;
  color?: string;
}

export interface ChartWidgetConfig {
  chartType: ChartType;
  labelField: string;
  valueField: string;
  colorField?: string;
  groupByField?: string;
  showLegend: boolean;
  showLabels: boolean;
  showGrid: boolean;
  stacked: boolean;
}

export interface HeatmapConfig {
  rowField: string;
  columnField: string;
  valueField: string;
  aggregation: AggregationType;
  colorScheme: string;
  showValues: boolean;
}

export interface ProgressConfig {
  field: string;
  target: number;
  max: number;
  showPercentage: boolean;
}

export interface MarkdownConfig {
  content: string;
  align?: "left" | "center" | "right";
}

export interface RelationshipWidgetConfig {
  sourceBoardId: string;
  targetBoardId: string;
  relationshipType: string;
  displayField: string;
  maxItems: number;
}

// ═══════════════════════════════════════════════════════════
// DASHBOARD EVENT NAMES
// ═══════════════════════════════════════════════════════════

export const DashboardEventNames = {
  Created: "dashboard.created:after",
  Updated: "dashboard.updated:after",
  Deleted: "dashboard.deleted:after",
  Duplicated: "dashboard.duplicated:after",
  Favorited: "dashboard.favorited:after",
  WidgetCreated: "widget.created:after",
  WidgetUpdated: "widget.updated:after",
  WidgetDeleted: "widget.deleted:after",
  LayoutChanged: "dashboard.layout_changed:after",
  FilterChanged: "dashboard.filter_changed:after",
} as const;
