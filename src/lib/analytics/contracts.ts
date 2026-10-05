/**
 * ── Analytics Contracts ─────────────────────────────────────
 *
 * ASSUMED INTERFACES to existing Powerweave Studio OS systems.
 *
 * These are NOT the real implementations — they are the TypeScript
 * contracts that the Dashboard & Analytics Engine assumes the
 * existing systems expose. Every assumption is flagged with
 * [ASSUMPTION] so a developer can reconcile with the real code.
 *
 * ── Systems We Interface With ───────────────────────────────
 * 1. Query Service     → Board data retrieval
 * 2. Event Bus         → Domain event publishing
 * 3. Plugin Registry   → Widget plugin registration
 * 4. Metadata Cache    → Caching query results
 * 5. Board Types       → BoardDefinition, ColumnDefinition, etc.
 * 6. Connected Data    → Relationship resolution
 * ────────────────────────────────────────────────────────────
 */

import type { LucideIcon } from "lucide-react";
import type { ComponentType, ReactNode } from "react";

// ═══════════════════════════════════════════════════════════
// 1. QUERY SERVICE CONTRACT
// ═══════════════════════════════════════════════════════════

/**
 * [ASSUMPTION] The real QueryService lives at
 * `src/features/boards/engine/query/query-service.ts` and exports
 * a `QueryService` object with these methods. The exact method
 * signatures may differ — reconcile before production use.
 */
export interface QueryServiceContract {
  loadBoardData(boardId: string): Promise<ApiResponse<BoardQueryResult>>;
  query(input: BoardQueryInput): Promise<ApiResponse<BoardQueryResult>>;
  hydrateRecords(
    records: BoardRecord[],
    columns: ColumnDefinition[],
    cellValues: Map<string, ColumnValue>,
  ): HydratedRecord[];
  loadCellValues(
    boardId: string,
    recordIds: string[],
    columnIds: string[],
  ): Promise<Map<string, ColumnValue>>;
}

/**
 * [ASSUMPTION] BoardQueryInput matches the real type in
 * `src/features/boards/engine/query/query-service.ts`.
 */
export interface BoardQueryInput {
  boardId: string;
  filters?: ViewFilter[];
  sorting?: ViewSort[];
  grouping?: ViewGrouping[];
  page?: number;
  pageSize?: number;
  search?: string;
  includeArchived?: boolean;
  groupIds?: string[];
}

/**
 * [ASSUMPTION] BoardQueryResult matches the real type.
 */
export interface BoardQueryResult {
  board: BoardDefinition;
  columns: ColumnDefinition[];
  groups: Group[];
  records: BoardRecord[];
  cellValues: Map<string, ColumnValue>;
  totalRecords: number;
  filteredRecordCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface HydratedRecord {
  record: BoardRecord;
  cells: Record<string, ColumnValue>;
}

// ═══════════════════════════════════════════════════════════
// 2. BOARD TYPES (from src/features/boards/engine/types.ts)
// ═══════════════════════════════════════════════════════════

/**
 * [ASSUMPTION] These types match the real definitions in
 * `src/features/boards/engine/types.ts`. Only the fields
 * relevant to analytics are included here.
 */
export interface BoardDefinition {
  id: string;
  organizationId: string;
  workspaceId: string;
  slug: string;
  name: string;
  description: string;
  icon?: string;
  status: EntityStatus;
  createdAt: string;
  updatedAt: string;
}

export interface BoardRecord {
  id: string;
  organizationId: string;
  workspaceId: string;
  boardId: string;
  groupId?: string | null;
  title: string;
  status: EntityStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ColumnDefinition {
  id: string;
  boardId: string;
  key: string;
  label: string;
  description?: string;
  type: ColumnTypeKey;
  required: boolean;
  hidden: boolean;
  frozen: boolean;
  defaultValue: ColumnValue;
  settings: Record<string, unknown>;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface Group {
  id: string;
  boardId: string;
  name: string;
  color?: string;
  order: number;
}

export interface ViewFilter {
  columnId: string;
  operator: FilterOperator;
  value?: ColumnValue;
}

export type FilterOperator =
  | "eq" | "neq" | "contains" | "gt" | "gte" | "lt" | "lte"
  | "in" | "is_empty" | "not_empty";

export interface ViewSort {
  columnId: string;
  direction: "asc" | "desc";
}

export interface ViewGrouping {
  columnId: string;
  direction?: "asc" | "desc";
}

export type ColumnValue =
  | string
  | number
  | boolean
  | null
  | string[]
  | Record<string, unknown>
  | Array<Record<string, unknown>>;

export type ColumnTypeKey =
  | "text" | "long_text" | "number" | "currency" | "date" | "timeline"
  | "status" | "priority" | "dropdown" | "multi_select" | "checkbox"
  | "person" | "email" | "phone" | "url" | "formula" | "files"
  | "rating" | "tags" | "connected_board" | "mirror" | "lookup"
  | "rollup" | "ai_field" | "button" | "progress" | "time_tracking";

export type EntityStatus = "active" | "archived" | "draft";

// ═══════════════════════════════════════════════════════════
// 3. EVENT BUS CONTRACT
// ═══════════════════════════════════════════════════════════

/**
 * [ASSUMPTION] The real EventBus lives at
 * `src/features/boards/engine/events/event-bus.ts` and exports
 * a singleton `eventBus` with these methods.
 */
export interface EventBusContract {
  publish(event: DomainEventPayload): Promise<void>;
  subscribe(
    eventName: string,
    subscription: EventSubscription,
  ): () => void;
  subscribeMany(
    eventNames: string[],
    subscription: EventSubscription,
  ): () => void;
}

export interface DomainEventPayload {
  eventId: string;
  eventName: string;
  timestamp: string;
  actorUserId: string;
  scope: PermissionScope;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
}

export interface EventSubscription {
  name: string;
  priority: number;
  async: boolean;
  handler: (payload: DomainEventPayload) => Promise<void> | void;
}

export interface PermissionScope {
  organizationId: string;
  workspaceId: string;
  boardId?: string;
  columnId?: string;
  groupId?: string;
}

// ═══════════════════════════════════════════════════════════
// 4. PLUGIN REGISTRY CONTRACT
// ═══════════════════════════════════════════════════════════

/**
 * [ASSUMPTION] The real PluginRegistry lives at
 * `src/features/boards/engine/plugins/plugin-registry.ts` and
 * exports a singleton `pluginRegistry`.
 */
export interface PluginRegistryContract {
  register(plugin: BasePlugin): void;
  unregister(pluginId: string): void;
  get(pluginId: string): BasePlugin | undefined;
  getByCategory(category: string): BasePlugin[];
  has(pluginId: string): boolean;
  getAll(): BasePlugin[];
}

export interface BasePlugin {
  id: string;
  name: string;
  category: string;
  version: string;
  description: string;
  enabled: boolean;
  metadata?: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════
// 5. METADATA CACHE CONTRACT
// ═══════════════════════════════════════════════════════════

/**
 * [ASSUMPTION] The real MetadataCache lives at
 * `src/features/boards/engine/cache/metadata-cache.ts` and
 * exports a singleton `metadataCache`.
 */
export interface MetadataCacheContract {
  get<T>(namespace: string, key: string): T | undefined;
  set<T>(namespace: string, key: string, data: T, ttlMs?: number): void;
  invalidate(namespace: string, key: string): void;
  invalidateNamespace(namespace: string): void;
  clear(): void;
}

// ═══════════════════════════════════════════════════════════
// 6. CONNECTED DATA CONTRACT
// ═══════════════════════════════════════════════════════════

/**
 * [ASSUMPTION] The Connected Data Engine lives at
 * `src/features/boards/engine/connected-data/` and exposes
 * these services.
 */
export interface ConnectedDataContract {
  resolveRelationships(
    boardId: string,
    recordIds: string[],
  ): Promise<Relationship[]>;
  resolveMirror(
    boardId: string,
    recordId: string,
    columnId: string,
  ): Promise<ColumnValue>;
  resolveLookup(
    boardId: string,
    recordId: string,
    columnId: string,
  ): Promise<ColumnValue>;
  resolveRollup(
    boardId: string,
    recordId: string,
    columnId: string,
  ): Promise<ColumnValue>;
  resolveFormula(
    boardId: string,
    recordId: string,
    columnId: string,
  ): Promise<ColumnValue>;
}

export interface Relationship {
  id: string;
  sourceBoardId: string;
  sourceRecordId: string;
  sourceColumnId: string;
  targetBoardId: string;
  targetRecordId: string;
  relationshipType: string;
  metadata: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════
// 7. GENERIC API RESPONSE
// ═══════════════════════════════════════════════════════════

export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  status: number;
}

// ═══════════════════════════════════════════════════════════
// 8. DASHBOARD & ANALYTICS TYPES (defined here, not assumed)
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
 * react-grid-layout compatible layout format.
 * One array per breakpoint — directly persistable to JSONB.
 */
export interface DashboardLayout {
  lg: GridItem[];
  md: GridItem[];
  sm: GridItem[];
}

export interface GridItem {
  i: string;       // widget instance ID (matches widget.id)
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  static?: boolean;
}

export interface DashboardSettings {
  /** Default date range preset */
  defaultDateRange: DateRangePreset;
  /** Custom date range (when preset is "custom") */
  customDateRange?: { start: string; end: string };
  /** Auto-refresh interval in seconds (0 = no refresh) */
  refreshInterval: number;
  /** Dashboard-level filters applied to all widgets */
  globalFilters: DashboardFilter[];
  /** Default board ID for widget creation */
  defaultBoardId?: string;
}

export type DateRangePreset =
  | "today" | "yesterday" | "this_week" | "this_month"
  | "last_month" | "last_7_days" | "last_30_days"
  | "last_90_days" | "this_year" | "all_time" | "custom";

export interface DashboardFilter {
  id: string;
  field: string;
  operator: FilterOperator;
  value: ColumnValue;
  label?: string;
}

// ═══════════════════════════════════════════════════════════
// 9. WIDGET TYPES
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

export interface WidgetPlugin<TConfig = Record<string, unknown>> {
  type: string;
  displayName: string;
  icon: LucideIcon;
  defaultConfig: TConfig;
  configSchema: Record<string, unknown>; // Zod schema in real impl
  render: ComponentType<WidgetRenderProps<TConfig>>;
  minSize: { w: number; h: number };
}

export interface WidgetRenderProps<TConfig = Record<string, unknown>> {
  widget: WidgetInstance;
  config: TConfig;
  boardData?: BoardQueryResult;
  filters: DashboardFilter[];
  dateRange: DateRange;
  isActive: boolean;
  onConfigChange: (config: Partial<TConfig>) => void;
}

export interface DateRange {
  start: Date;
  end: Date;
  preset: DateRangePreset;
}

// ═══════════════════════════════════════════════════════════
// 10. AGGREGATION TYPES
// ═══════════════════════════════════════════════════════════

export type AggregationType =
  | "count" | "sum" | "average" | "max" | "min"
  | "median" | "mode" | "count_empty" | "count_filled"
  | "percentage" | "distinct_count";

export interface AggregationResult {
  type: AggregationType;
  value: number | null;
  label: string;
  formattedValue: string;
}

export interface AggregationConfig {
  type: AggregationType;
  field: string;
  label?: string;
  format?: "number" | "currency" | "percentage" | "duration";
  decimalPlaces?: number;
  prefix?: string;
  suffix?: string;
}

// ═══════════════════════════════════════════════════════════
// 11. CHART TYPES
// ═══════════════════════════════════════════════════════════

export type ChartType =
  | "bar" | "line" | "area" | "pie" | "donut"
  | "stacked_bar" | "scatter" | "bubble";

export interface ChartConfig {
  chartType: ChartType;
  labelField: string;
  valueField: string;
  colorField?: string;
  groupByField?: string;
  showLegend: boolean;
  showLabels: boolean;
  showGrid: boolean;
  stacked: boolean;
  xAxisLabel?: string;
  yAxisLabel?: string;
}

export interface ChartDataPoint {
  label: string;
  value: number;
  color?: string;
  group?: string;
  metadata?: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════
// 12. KPI TYPES
// ═══════════════════════════════════════════════════════════

export interface KpiConfig {
  aggregation: AggregationConfig;
  comparison?: {
    type: AggregationType;
    field: string;
    label: string;
  };
  target?: number;
  showTrendline: boolean;
  showSparkline: boolean;
  showComparison: boolean;
  color?: string;
}

export interface KpiData {
  current: AggregationResult;
  previous?: AggregationResult;
  change?: number;
  changePercent?: number;
  trend?: "up" | "down" | "flat";
  sparklineData?: number[];
}

// ═══════════════════════════════════════════════════════════
// 13. HEATMAP TYPES
// ═══════════════════════════════════════════════════════════

export interface HeatmapConfig {
  rowField: string;
  columnField: string;
  valueField: string;
  aggregation: AggregationType;
  colorScheme: "blue" | "green" | "red" | "purple" | "teal";
  showValues: boolean;
  minColor?: string;
  maxColor?: string;
}

export interface HeatmapCell {
  row: string;
  column: string;
  value: number;
  formattedValue: string;
}

// ═══════════════════════════════════════════════════════════
// 14. PROGRESS / MARKDOWN / RELATIONSHIP TYPES
// ═══════════════════════════════════════════════════════════

export interface ProgressConfig {
  field: string;
  target: number;
  max: number;
  showPercentage: boolean;
  showLabel: boolean;
  color?: string;
}

export interface MarkdownConfig {
  content: string;
  fontSize?: "sm" | "md" | "lg";
  align?: "left" | "center" | "right";
}

export interface RelationshipWidgetConfig {
  sourceBoardId: string;
  targetBoardId: string;
  relationshipType: string;
  displayField: string;
  showCount: boolean;
  maxItems: number;
}

// ═══════════════════════════════════════════════════════════
// 15. DASHBOARD EVENT NAMES
// ═══════════════════════════════════════════════════════════

export const DashboardEventNames = {
  DashboardCreated: "dashboard.created:after",
  DashboardUpdated: "dashboard.updated:after",
  DashboardDeleted: "dashboard.deleted:after",
  DashboardDuplicated: "dashboard.duplicated:after",
  DashboardFavorited: "dashboard.favorited:after",
  WidgetCreated: "widget.created:after",
  WidgetUpdated: "widget.updated:after",
  WidgetDeleted: "widget.deleted:after",
  LayoutChanged: "dashboard.layout_changed:after",
  FilterChanged: "dashboard.filter_changed:after",
} as const;
