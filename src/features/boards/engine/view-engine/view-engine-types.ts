/**
 * View Engine Types
 *
 * Types for the generic View Engine that renders board data in multiple
 * visual representations without switch statements on view type.
 *
 * ── Key Design Decision ────────────────────────────────────
 * The View Engine itself contains NO switch statements on view type.
 * New view types are installable purely by registering a renderer
 * via the Plugin Registry, with zero changes to View Engine core code.
 */

import type { ComponentType } from "react";
import type {
  BoardDefinition,
  BoardRecord,
  BoardView,
  ColumnDefinition,
  ColumnValue,
  ViewSettingsByType,
} from "../types";
import type { BoardQueryResult } from "../query/query-service";

// ── View Renderer Props ────────────────────────────────────

export interface ViewRendererProps {
  /** The board being rendered */
  board: BoardDefinition;

  /** The active view configuration */
  view: BoardView;

  /** All columns on the board */
  columns: ColumnDefinition[];

  /** Records to render (already filtered/sorted by the Query Service) */
  records: BoardRecord[];

  /** Cell values keyed by `${recordId}:${columnId}` */
  cellValues: Map<string, ColumnValue>;

  /** Board's structural groups (BoardGroup — used by Kanban to respect months, etc.) */
  groups: Array<{ id: string; name: string; color?: string; order: number; statusOptions?: Array<{ id: string; label: string; color?: string }> }>;

  /** Type-safe view settings (cast by the View Engine) */
  settings: ViewSettingsByType;

  /** Callback when a cell value changes (e.g., drag card, edit inline) */
  onCellChange?: (args: { recordId: string; columnId: string; value: ColumnValue }) => void;

  /** Callback when view settings change */
  onSettingsChange?: (settings: Partial<ViewSettingsByType>) => void;

  /** Whether this is the active view (controls lazy-loading) */
  isActive?: boolean;
}

// ── View Renderer Component ────────────────────────────────

export type ViewRendererComponent = ComponentType<ViewRendererProps>;

// ── View Engine Props ──────────────────────────────────────

export interface ViewEngineProps {
  /** Board data from the Query Service */
  boardData: BoardQueryResult;

  /** Active view */
  view: BoardView;

  /** All views for this board (needed for view switcher) */
  views: BoardView[];

  /** Callback when active view changes */
  onViewChange: (viewId: string) => void;

  /** Callback when a view is created */
  onCreateView?: (data: { name: string; type: string }) => Promise<void>;

  /** Callback when a view is updated */
  onUpdateView?: (viewId: string, data: Partial<BoardView>) => Promise<void>;

  /** Callback when a view is duplicated */
  onDuplicateView?: (viewId: string) => Promise<void>;

  /** Callback when a view is deleted */
  onDeleteView?: (viewId: string) => Promise<void>;

  /** Callback when a view is set as default */
  onSetDefaultView?: (viewId: string) => Promise<void>;

  /** Callback when a view is favorited */
  onFavoriteView?: (viewId: string, favorite: boolean) => Promise<void>;

  /** Callback when views are reordered */
  onReorderViews?: (viewIds: string[]) => Promise<void>;

  /** Callback when a cell value changes */
  onCellChange?: (args: { recordId: string; columnId: string; value: ColumnValue }) => void;
}

// ── Default Settings Factory ───────────────────────────────

export function getDefaultSettings(viewType: string): ViewSettingsByType {
  switch (viewType) {
    case "kanban":
      return {
        groupBy: { columnId: "", collapsedGroupIds: [] },
        cardSize: "normal",
        showCardCount: true,
        showEmptyGroups: true,
        collapsedColumns: [],
        divideBy: { enabled: false, primaryType: "status", primaryColumnId: "", secondaryType: null, secondaryColumnId: "" },
        cardFields: [],
        showColumnName: true,
        displayCoverImage: false,
        showBattery: true,
      } as ViewSettingsByType;
    case "calendar":
      return {
        dateColumnId: "",
        defaultView: "month",
        firstDayOfWeek: 1,
        showWeekends: true,
        showRecordCount: true,
        selectedDateColumns: [],
        colorBy: "none",
        labelBy: [],
        showHours: true,
        hideWeekends: false,
        hideItemNames: false,
        defaultEventDuration: 30,
        visibleGroups: [],
      } as ViewSettingsByType;
    case "timeline":
      return {
        startDateColumnId: "",
        endDateColumnId: "",
        defaultZoom: "month",
        showTodayMarker: true,
        showDependencies: false,
      } as ViewSettingsByType;
    case "gallery":
      return {
        imageColumnId: "",
        titleColumnId: "",
        cardSize: "normal",
        aspectRatio: "4:3",
      } as ViewSettingsByType;
    case "chart":
      return {
        chartType: "bar",
        labelColumnId: "",
        valueColumnId: "",
        showLegend: true,
        showLabels: true,
        showGrid: true,
        stacked: false,
      } as ViewSettingsByType;
    case "dashboard":
      return {
        widgets: [],
        toolbarCollapsed: false,
        dashboardFilters: [],
        filtersActive: false,
      } as ViewSettingsByType;
    default:
      return {} as ViewSettingsByType;
  }
}

