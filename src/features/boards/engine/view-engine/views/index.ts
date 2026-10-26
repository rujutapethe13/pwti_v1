/**
 * View Renderer Registry
 *
 * All view renderers register here with the Plugin Registry.
 * The View Engine looks up renderers by view type — no switch statements.
 *
 * ── Zero Switch Statements ─────────────────────────────────
 * New view types are installable purely by adding an export here
 * and registering with the Plugin Registry, with zero changes to
 * View Engine core code.
 *
 * ── Usage ──────────────────────────────────────────────────
 *   import "./views"; // registers all view plugins on import
 *   pluginRegistry.getViewPlugin("kanban") // → ViewPlugin
 */

"use client";

import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  CalendarDays,
  ChevronDown,
  Blocks,
  BarChart3,
  PanelsTopLeft,
  Table,
} from "lucide-react";

import { createElement } from "react";
import { pluginRegistry } from "../../plugins/plugin-registry";
import type { ViewPlugin } from "../../plugins/plugin-types";
import { TableView } from "../../components/table-view";
import type { ViewRendererProps } from "../view-engine-types";
import type { Group } from "../../types";

// ── View Plugin Factory ────────────────────────────────────

function createViewPlugin(
  viewType: string,
  name: string,
  description: string,
  icon: LucideIcon,
  component: ViewPlugin["component"],
  placeholder = false,
): ViewPlugin {
  return {
    id: `powerweave.view.${viewType.trim().toLowerCase()}`,
    name,
    description,
    category: "view",
    version: "1.0.0",
    viewType: viewType.trim().toLowerCase(),
    icon,
    component,
    placeholder,
    enabled: true,
  };
}

// ── Table View Renderer Adapter ─────────────────────────────

// Adapts the View Engine's ViewRendererProps to the original TableView
// component props. Reuses the existing TableView unchanged (no redesign) so
// the table view keeps its exact original behaviour. createElement is used
// because this registry module is a .ts file (JSX is not allowed there).
function TableViewRenderer(props: ViewRendererProps) {
  const ops = props.columnOps ?? {};
  const groupOps = props.groupOps ?? {};
  return createElement(TableView, {
    board: props.board,
    columns: props.columns,
    records: props.records,
    cellValues: props.cellValues,
    groups: props.groups as unknown as Group[] | undefined,
    onCellChange: props.onCellChange,
    onNewItem: props.onNewItem,
    // The pinned title header renders from the board's own title column
    // label. The legacy `primaryColumnLabel` is deliberately NOT a fallback:
    // it used to hold an unrelated data column's name.
    titleColumnLabel: ops.titleColumnLabel ?? props.board.titleColumnLabel,
    onTitleColumnRename: ops.onTitleColumnRename,
    onColumnRename: ops.onColumnRename,
    onColumnDuplicate: ops.onColumnDuplicate,
    onColumnDuplicateWithValues: ops.onColumnDuplicateWithValues,
    onColumnToggleHidden: ops.onColumnToggleHidden,
    onColumnToggleFrozen: ops.onColumnToggleFrozen,
    onColumnChangeType: ops.onColumnChangeType,
    onColumnDelete: ops.onColumnDelete,
    deletingColumnId: ops.deletingColumnId,
    onColumnAdd: ops.onColumnAdd,
    onColumnResize: ops.onColumnResize,
    onColumnReorder: ops.onColumnReorder,
    onUpdateColumnSettings: ops.onUpdateColumnSettings,
    onConfigureMirror: ops.onConfigureMirror,
    onUpdateColumnLabels: ops.onUpdateColumnLabels,
    columnWidths: ops.columnWidths,
    onColumnUpdateDescription: ops.onColumnUpdateDescription,
    onColumnToggleRestrictEditing: ops.onColumnToggleRestrictEditing,
    onColumnToggleRestrictView: ops.onColumnToggleRestrictView,
    onColumnToggleWrapText: ops.onColumnToggleWrapText,
    sortColumnId: ops.sortColumnId,
    sortDirection: ops.sortDirection,
    onSort: ops.onSort,
    onAddGroup: groupOps.onAddGroup,
    onRenameGroup: groupOps.onRenameGroup,
    onDeleteGroup: groupOps.onDeleteGroup,
    onUpdateGroupColor: groupOps.onUpdateGroupColor,
    onUpdateGroupStatusOptions: groupOps.onUpdateGroupStatusOptions,
    onMoveGroupToBoard: groupOps.onMoveGroupToBoard,
    onMoveGroupToTop: groupOps.onMoveGroupToTop,
    onDuplicateGroup: groupOps.onDuplicateGroup,
    onToggleGroupCollapse: groupOps.onToggleGroupCollapse,
    onUpdateGroupTitleColumnLabel: groupOps.onUpdateGroupTitleColumnLabel,
    onUpdateGroupColumnMode: groupOps.onUpdateGroupColumnMode,
    onBulkArchive: props.onBulkArchive,
    onBulkDelete: props.onBulkDelete,
    onRowDelete: props.onRowDelete,
    onRowDuplicate: props.onRowDuplicate,
    onMoveToGroup: props.onMoveToGroup,
    onMoveToStatus: props.onMoveToStatus,
    bulkArchiveLoading: props.bulkArchiveLoading,
    bulkDeleteLoading: props.bulkDeleteLoading,
  });
}

// ── Lazy Imports ───────────────────────────────────────────
// View renderers are lazy-loaded to avoid bundling all six on initial load.
// The View Engine's Plugin Registry supports dynamic registration.

import { KanbanView } from "./kanban-view";
import { CalendarView } from "./calendar-view";
import { TimelineView } from "./timeline-view";
import { GalleryView } from "./gallery-view";
import { ChartView } from "./chart-view";
import { DashboardView } from "./dashboard/dashboard-view";

// ── Register View Plugins ──────────────────────────────────

export function registerViewPlugins(): void {
  // Kanban
  pluginRegistry.register(
    createViewPlugin("kanban", "Kanban", "Grouped card workflow", LayoutDashboard, KanbanView),
  );

  // Calendar
  pluginRegistry.register(
    createViewPlugin("calendar", "Calendar", "Date-based planning", CalendarDays, CalendarView),
  );

  // Timeline
  pluginRegistry.register(
    createViewPlugin("timeline", "Timeline", "Sequenced work planning", ChevronDown, TimelineView),
  );

  // Gallery
  pluginRegistry.register(
    createViewPlugin("gallery", "Gallery", "Visual asset browsing", Blocks, GalleryView),
  );

  // Chart
  pluginRegistry.register(
    createViewPlugin("chart", "Chart", "Trend and performance summaries", BarChart3, ChartView),
  );

  // Dashboard
  pluginRegistry.register(
    createViewPlugin(
      "dashboard",
      "Dashboard",
      "Power BI-style widget canvas with configurable widgets and filters",
      PanelsTopLeft,
      DashboardView,
    ),
  );

  // Table (reuses the existing TableView component)
  pluginRegistry.register(
    createViewPlugin("table", "Table", "Spreadsheet-style board view", Table, TableViewRenderer),
  );
}

// Auto-register on import in client components
if (typeof window !== "undefined") {
  registerViewPlugins();
}

// ── Re-exports ─────────────────────────────────────────────

export { KanbanView } from "./kanban-view";
export { CalendarView } from "./calendar-view";
export { TimelineView } from "./timeline-view";
export { GalleryView } from "./gallery-view";
export { ChartView } from "./chart-view";
export { DashboardView } from "./dashboard/dashboard-view";
