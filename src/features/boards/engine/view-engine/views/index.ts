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
} from "lucide-react";

import { pluginRegistry } from "../../plugins/plugin-registry";
import type { ViewPlugin } from "../../plugins/plugin-types";

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
    id: `powerweave.view.${viewType}`,
    name,
    description,
    category: "view",
    version: "1.0.0",
    viewType,
    icon,
    component,
    placeholder,
    enabled: true,
  };
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

  // Table is registered separately (reuses existing TableView component)
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

