import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export type OrganizationRole = "owner" | "admin" | "member" | "guest";
export type WorkspaceRole = "admin" | "member" | "guest";
export type BoardRole = "owner" | "editor" | "commenter" | "viewer";
export type ColumnRole = "view" | "edit" | "configure";

export type EntityStatus = "active" | "archived" | "draft";
export type BoardVisibility = "private" | "workspace" | "org" | "public";
export type ViewVisibility = "personal" | "shared";

export interface DropdownOption {
  id: string;
  label: string;
  color?: string;
}

/** Array of all valid column type keys for runtime validation (Zod, etc.) */
export const columnTypeKeys = [
  "text",
  "long_text",
  "number",
  "currency",
  "date",
  "timeline",
  "status",
  "priority",
  "dropdown",
  "multi_select",
  "checkbox",
  "person",
  "email",
  "phone",
  "url",
  "formula",
  "files",
  "rating",
  "tags",
  "connected_board",
  "mirror",
  "lookup",
  "rollup",
  "ai_field",
  "button",
  "progress",
  "time_tracking",
] as const;

export type ColumnTypeKey =
  | "text"
  | "long_text"
  | "number"
  | "currency"
  | "date"
  | "timeline"
  | "status"
  | "priority"
  | "dropdown"
  | "multi_select"
  | "checkbox"
  | "person"
  | "email"
  | "phone"
  | "url"
  | "formula"
  | "files"
  | "rating"
  | "tags"
  | "connected_board"
  | "mirror"
  | "lookup"
  | "rollup"
  | "ai_field"
  | "button"
  | "progress"
  | "time_tracking";

export type ColumnValue =
  | string
  | number
  | boolean
  | null
  | string[]
  | Record<string, unknown>
  | Array<Record<string, unknown>>;

// ── Connect Board column type ────────────────────────────
// A `connect_board` column links records in this board to records
// ("items") on one or more other boards in the same workspace.

export interface ConnectedBoardLinkItem {
  board_id: string;
  item_id: string;
  workspace_id?: string;
}

/**
 * Cell value shape for a `connect_board` column.
 *
 * Stored in `cell_values.value` as a JSON object whose only key is
 * `linked_item_ids`, an array of { workspace_id, board_id, item_id } pairs.
 */
export interface ConnectedBoardColumnValue {
  linked_item_ids: ConnectedBoardLinkItem[];
}

/**
 * Settings shape for a `connect_board` column.
 *
 * Stored in `columns.settings` as a JSON object.
 */
export interface ConnectedBoardColumnSettings {
  /** Boards this column is allowed to link to, with workspace context for cross-workspace resolution. */
  connected_board_ids: Array<{ workspace_id: string; board_id: string }>;
  /** Can a single cell link to more than one item? */
  allow_multiple_items: boolean;
  /** Should linking also update the other board? */
  two_way_sync: boolean;
  /** The reciprocal column on the other board, once created. */
  linked_column_id_on_other_board: string | null;
}

export const EMPTY_CONNECTED_BOARD_VALUE: ConnectedBoardColumnValue = {
  linked_item_ids: [],
};

export function emptyConnectedBoardSettings(): ConnectedBoardColumnSettings {
  return {
    connected_board_ids: [],
    allow_multiple_items: false,
    two_way_sync: false,
    linked_column_id_on_other_board: null,
  };
}

// ── Mirror Column Settings ────────────────────────────────────
// Stored in `columns.settings` (jsonb) for every `mirror` column type.
// `source_connect_column_id` — the Connected Boards column this mirror rides on.
// `mirrored_column_id`      — the column on the connected board(s) to pull from.
// `display_config.aggregation` — how multiple linked values are reduced
//   (e.g. "sum", "average", "latest"); null when the source links to a
//   single item and no aggregation is required.

export interface MirrorDisplayConfig {
  aggregation: string | null;
  display_mode?: "stacked" | "separate";
  filter_value?: string | null;
}

export interface MirrorColumnSettings {
  source_connect_column_id: string | null;
  /** Legacy single-column support for backward compatibility. */
  mirrored_column_id: string | null;
  /** Multi-column mirror targets: each entry specifies the source board + column. */
  mirrored_columns: Array<{
    board_id: string;
    column_id: string;
    aggregation: string | null;
  }>;
  display_config: MirrorDisplayConfig;
}

export function emptyMirrorColumnSettings(): MirrorColumnSettings {
  return {
    source_connect_column_id: null,
    mirrored_column_id: null,
    mirrored_columns: [],
    display_config: { aggregation: null },
  };
}

export interface Organization {
  id: string;
  name: string;
  status: EntityStatus;
  plan: string;
  createdAt: string;
  updatedAt: string;
}

export interface Membership {
  id: string;
  organizationId: string;
  workspaceId: string;
  userId: string;
  orgRole: OrganizationRole;
  workspaceRole: WorkspaceRole;
  status: EntityStatus;
}

export interface Workspace {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  status: EntityStatus;
  createdAt: string;
  updatedAt: string;
}

export interface BoardTemplateSeed {
  groups: Array<Partial<Group>>;
  columns: Array<Partial<ColumnDefinition>>;
  views: Array<Partial<BoardView>>;
}

export interface BoardTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  thumbnail?: string;
  seed: BoardTemplateSeed;
}

export interface BoardDefinition {
  id: string;
  organizationId: string;
  workspaceId: string;
  slug: string;
  name: string;
  description: string;
  templateId?: string;
  icon?: LucideIcon;
  favorite: boolean;
  pinned: boolean;
  visibility: BoardVisibility;
  status: EntityStatus;
  sharedWith: BoardRole[];
  isRestricted?: boolean;
  primaryColumnLabel?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Group {
  id: string;
  organizationId: string;
  workspaceId: string;
  boardId: string;
  parentGroupId?: string | null;
  name: string;
  color?: string;
  collapsed: boolean;
  order: number;
  status: EntityStatus;
  permissions?: Partial<Record<BoardRole, ColumnRole>>;
  statusOptions?: DropdownOption[];
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
  permissions: ColumnPermissions;
  validation: ColumnValidationRule[];
  version: number;
  order: number;
  restrictEditing?: boolean;
  restrictView?: boolean;
  collapsed?: boolean;
  wrapText?: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface ColumnPermissions {
  view: BoardRole[];
  edit: BoardRole[];
  configure: BoardRole[];
}

export interface ColumnDependency {
  id: string;
  boardId: string;
  sourceColumnId: string;
  targetBoardId?: string;
  targetColumnId: string;
  relation: "formula" | "lookup" | "rollup" | "mirror" | "reference";
  createdAt: string;
}

export interface ColumnDefinitionHistoryEntry {
  id: string;
  columnId: string;
  boardId: string;
  fromVersion: number;
  toVersion: number;
  fromSnapshot: ColumnDefinitionSnapshot;
  toSnapshot: ColumnDefinitionSnapshot;
  changeSummary: string;
  createdAt: string;
}

export interface ColumnDefinitionSnapshot {
  key: string;
  label: string;
  description?: string;
  type: ColumnTypeKey;
  required: boolean;
  hidden: boolean;
  frozen: boolean;
  defaultValue: ColumnValue;
  settings: Record<string, unknown>;
  validation: ColumnValidationRule[];
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
  archivedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CellValue {
  id: string;
  organizationId: string;
  workspaceId: string;
  boardId: string;
  recordId: string;
  columnId: string;
  value: ColumnValue;
  valueText: string;
  updatedAt: string;
  version: number;
}

export interface BoardView {
  id: string;
  boardId: string;
  organizationId?: string;
  workspaceId?: string;
  name: string;
  description?: string;
  type: ViewType;
  visibility: ViewVisibility;
  filters: ViewFilter[];
  sorting: ViewSort[];
  grouping: ViewGrouping[];
  visibleColumnIds: string[];
  columnWidths: Record<string, number>;
  rowHeight: number;
  settings: ViewSettingsByType;
  personalOwnerUserId?: string | null;
  sharedWith: BoardRole[];
  isDefault: boolean;
  order: number;
  createdAt: string;
  updatedAt: string;
}

// ── View-Level Grouping (display-only, NOT BoardGroup) ─────
// ViewGroupBy is a display-only concept scoped to one view.
// It must NEVER be confused with or stored in the same structure
// as the board's structural Groups (BoardGroup / Group type).
// BoardGroup = structural groups (e.g. May/June/July), foundation for Connected Boards.
// ViewGroupBy = display grouping (e.g. group cards by Status column), stored in view settings only.
export interface ViewGroupBy {
  columnId: string;
  boardGroupId?: string; // Optional: also respect structural BoardGroups
  direction?: "asc" | "desc";
  collapsedGroupIds?: string[];
}

export type ViewCardSize = "compact" | "normal" | "wide";

// ── View-Type-Specific Settings ────────────────────────────
export interface KanbanViewSettings {
  groupBy: ViewGroupBy;
  cardSize: ViewCardSize;
  showCardCount: boolean;
  showEmptyGroups: boolean;
  collapsedColumns: string[];
  divideBy: {
    enabled: boolean;
    primaryType: "status" | "group";
    primaryColumnId: string;
    secondaryType: "status" | "group" | null;
    secondaryColumnId: string;
  };
  cardFields: string[];
  showColumnName: boolean;
  displayCoverImage: boolean;
  showBattery: boolean;
}

export interface CalendarViewSettings {
  dateColumnId: string;
  endDateColumnId?: string;
  defaultView: "month" | "week" | "day" | "agenda";
  firstDayOfWeek: 0 | 1; // 0=Sunday, 1=Monday
  showWeekends: boolean;
  showRecordCount: boolean;
  // Enhanced settings
  selectedDateColumns: string[]; // multiple date columns support
  colorBy: "none" | "status" | "person" | "group" | "board";
  labelBy: string[]; // column ids to show on chips (pipe-separated)
  showHours: boolean;
  hideWeekends: boolean;
  hideItemNames: boolean;
  defaultEventDuration: 15 | 30 | 60; // minutes
  visibleGroups: string[]; // group ids to show, empty = all
}

export interface TimelineViewSettings {
  startDateColumnId: string;
  endDateColumnId: string;
  groupBy?: ViewGroupBy;
  defaultZoom: "day" | "week" | "month" | "quarter" | "year";
  showTodayMarker: boolean;
  showDependencies: boolean;
}

export interface GalleryViewSettings {
  imageColumnId: string;
  titleColumnId: string;
  subtitleColumnId?: string;
  cardSize: ViewCardSize;
  aspectRatio: "1:1" | "4:3" | "16:9" | "3:2";
}

export interface ChartViewSettings {
  chartType: "bar" | "line" | "pie" | "area" | "donut";
  labelColumnId: string;
  valueColumnId: string;
  colorColumnId?: string;
  groupByColumnId?: string;
  showLegend: boolean;
  showLabels: boolean;
  showGrid: boolean;
  stacked: boolean;
}

// ── Dashboard View Settings (widget canvas) ──────────────────
// Persisted per dashboard view as JSON: { widgets: [{ id, type, x, y, w, h, config }] }
// All column/group/status-label choices are resolved at render time from the
// live board schema — widget configs store only column IDs, never field names.

export interface DashboardWidgetInstance {
  id: string;
  type:
    | "number"
    | "chart"
    | "data-over-time"
    | "kpi-card"
    | "due-list"
    | "jobs-table";
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  config: Record<string, unknown>;
  hasFilter: boolean;
}

export interface DashboardViewSettings {
  widgets: DashboardWidgetInstance[];
  toolbarCollapsed: boolean;
  /** Dashboard-level filters (built via the Filter button) applied to all widgets. */
  dashboardFilters: Array<{ id: string; columnId: string; operator: string; value: unknown }>;
  /** Whether the dashboard-level filter bar is active. */
  filtersActive: boolean;
  /** Per-board column role mapping used by the default template widgets. */
  columnRoles?: Record<string, string>;
  /** Raw status cell value → status bucket (not_started / working_on_it / done / on_hold). */
  statusBuckets?: Record<string, string>;
  /** Alias client name → canonical client name. */
  clientAliases?: Record<string, string>;
  /** True once the user has completed (or skipped) the "Map your columns" step. */
  columnMappingDone?: boolean;
  /** Dashboard-wide measure for every chart: jobs | images | skus. */
  measure?: "jobs" | "images" | "skus";
}

export type ViewSettingsByType =
  | Record<string, never>  // table has no type-specific settings
  | KanbanViewSettings
  | CalendarViewSettings
  | TimelineViewSettings
  | GalleryViewSettings
  | ChartViewSettings
  | DashboardViewSettings;

export type ViewType =
  | "table"
  | "kanban"
  | "calendar"
  | "chart"
  | "dashboard"
  | "form"
  | "gallery"
  | "timeline"
  | "map"
  | "gantt"
  | "docs";

export interface ViewFilter {
  columnId: string;
  operator: "eq" | "neq" | "contains" | "gt" | "gte" | "lt" | "lte" | "in" | "is_empty" | "not_empty";
  value?: ColumnValue;
}

export interface ViewSort {
  columnId: string;
  direction: "asc" | "desc";
}

export interface ViewGrouping {
  columnId: string;
  direction?: "asc" | "desc";
}

export interface ColumnSettingField {
  name: string;
  label: string;
  type: "text" | "textarea" | "number" | "checkbox" | "select" | "json" | "formula";
  section: "general" | "formatting" | "validation" | "permissions" | "advanced";
  description?: string;
  options?: Array<{ label: string; value: string }>;
  placeholder?: string;
  /** When true, the field is read from / written to `column.settings` instead of the column root. */
  fromSettings?: boolean;
}

export interface ColumnTypeDefinition {
  key: ColumnTypeKey;
  label: string;
  description: string;
  category: "core" | "formula" | "future" | "connected_data";
  defaultValue: ColumnValue;
  compatibleTypes: ColumnTypeKey[];
  settingsSchema: ColumnSettingField[];
  allowEmpty: boolean;
  supportsPermissions: boolean;
  defaultOptions?: DropdownOption[];
}

export interface ColumnValidationRule {
  id: string;
  name: string;
  dependencyColumns: string[];
  message: string;
  severity: "error" | "warning";
  when?: string;
  validate: (args: ValidationContext) => ValidationResult;
}

export interface ValidationContext {
  boardId: string;
  columnId: string;
  recordId?: string;
  value: ColumnValue;
  recordValues: Record<string, ColumnValue>;
  column: ColumnDefinition;
}

export interface ValidationResult {
  valid: boolean;
  message?: string;
  dependencyHits?: string[];
}

export interface MigrationPreview {
  fromType: ColumnTypeKey;
  toType: ColumnTypeKey;
  affectedRecordCount: number;
  clearedValueCount: number;
  coercibleValueCount: number;
  sampleValues: Array<{ recordId: string; before: ColumnValue; after: ColumnValue }>;
}

export interface MigrationResult {
  columnId: string;
  fromType: ColumnTypeKey;
  toType: ColumnTypeKey;
  snapshot: ColumnDefinitionSnapshot;
  updatedValues: Array<{ recordId: string; value: ColumnValue }>;
  clearedValueCount: number;
  warnings: string[];
}

export interface BoardSearchIndexEntry {
  recordId: string;
  boardId: string;
  workspaceId: string;
  organizationId: string;
  searchableText: string;
  updatedAt: string;
}

export interface ActivityLogEntry {
  id: string;
  organizationId: string;
  workspaceId: string;
  boardId?: string;
  recordId?: string;
  actorUserId: string;
  action: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface PermissionScope {
  organizationId: string;
  workspaceId: string;
  boardId?: string;
  columnId?: string;
  groupId?: string;
}

export interface ApiKey {
  id: string;
  organizationId: string;
  workspaceId: string;
  label: string;
  hashedSecret: string;
  lastUsedAt?: string | null;
  createdAt: string;
  revokedAt?: string | null;
}

export interface WebhookSubscription {
  id: string;
  organizationId: string;
  workspaceId: string;
  targetUrl: string;
  events: string[];
  secret?: string;
  active: boolean;
  createdAt: string;
}

export interface AutomationDefinition {
  id: string;
  organizationId: string;
  workspaceId: string;
  boardId: string;
  name: string;
  trigger: string;
  conditions: Record<string, unknown>;
  actions: AutomationAction[];
  active: boolean;
}

export interface AutomationAction {
  id: string;
  type: string;
  config: Record<string, unknown>;
}

export interface AutomationRun {
  id: string;
  automationId: string;
  organizationId: string;
  workspaceId: string;
  boardId: string;
  status: "queued" | "running" | "succeeded" | "failed";
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  createdAt: string;
  completedAt?: string | null;
}

export interface SubscriptionPlan {
  id: string;
  organizationId: string;
  plan: string;
  seats: number;
  limits: Record<string, number>;
  active: boolean;
  createdAt: string;
  renewedAt?: string | null;
}

export interface BoardEngineState {
  workspace: WorkspaceSliceState;
  board: BoardSliceState;
  group: GroupSliceState;
  view: ViewSliceState;
  selection: SelectionSliceState;
  commandPalette: CommandPaletteState;
  ui: UiSliceState;
  realtime: RealtimeSliceState;
  notifications: NotificationSliceState;
  undoRedo: UndoRedoState;
}

export interface WorkspaceSliceState {
  activeWorkspaceId: string | null;
  workspaces: Workspace[];
}

export interface BoardSliceState {
  activeBoardId: string | null;
  boards: BoardDefinition[];
}

export interface GroupSliceState {
  activeGroupId: string | null;
  groups: Group[];
}

export interface ViewSliceState {
  activeViewId: string | null;
  views: BoardView[];
}

export interface SelectionSliceState {
  recordId?: string | null;
  columnId?: string | null;
  groupId?: string | null;
}

export interface CommandPaletteState {
  open: boolean;
  query: string;
}

export interface UiSliceState {
  sidebarCollapsed: boolean;
  theme: "light" | "dark" | "system";
}

export interface RealtimeSliceState {
  activeBoardId: string | null;
  presenceUsers: Array<{ userId: string; name: string; color: string }>;
  lastSyncedAt?: string | null;
}

export interface NotificationSliceState {
  unreadCount: number;
}

export interface UndoRedoState {
  past: EngineAction[];
  future: EngineAction[];
}

export interface EngineAction {
  id: string;
  type: string;
  scope: PermissionScope;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  createdAt: string;
}

export interface CellRendererProps {
  board: BoardDefinition;
  column: ColumnDefinition;
  record: BoardRecord;
  value: ColumnValue;
  readOnly?: boolean;
  wrapText?: boolean;
  onChange?: (value: ColumnValue) => void;
}

export interface SettingsPanelProps {
  column: ColumnDefinition;
  definition: ColumnTypeDefinition;
  onChange: (next: Partial<ColumnDefinition>) => void;
}

// TableViewProps moved to ./components/table-view.tsx
