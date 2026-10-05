"use client";

/**
 * View Engine
 *
 * The generic View Engine renders existing board data in multiple visual
 * representations WITHOUT duplicating data or logic.
 *
 * ── Zero Switch Statements ─────────────────────────────────
 * This component contains NO switch statements on view type.
 * It looks up the renderer from the Plugin Registry and delegates.
 * New view types are installable purely by registering a renderer,
 * with zero changes to this core file.
 *
 * ── Data Flow ──────────────────────────────────────────────
 * View → Query Service → Repository → Database
 * View action (e.g. drag card) → existing CRUD Service → Repository
 * → Event Bus → Activity Log + Optimistic Update → UI
 *
 * No view queries Supabase directly. No view mutates records directly.
 */

import { useCallback, useMemo } from "react";
import { pluginRegistry } from "../plugins/plugin-registry";
import { ViewSwitcher } from "./view-switcher";
import { getDefaultSettings, type ViewEngineProps, type ViewRendererProps } from "./view-engine-types";
import type { BoardView, ColumnValue, ViewSettingsByType } from "../types";
import type { ViewPlugin } from "../plugins/plugin-types";

// ── View Engine ────────────────────────────────────────────

export function ViewEngine({
  boardData,
  view,
  views,
  onViewChange,
  onCreateView,
  onUpdateView,
  onDuplicateView,
  onDeleteView,
  onSetDefaultView,
  onFavoriteView,
  onReorderViews,
  onCellChange,
}: ViewEngineProps) {
  const { board, columns, groups, records, cellValues } = boardData;

  // Look up the renderer from the Plugin Registry — NO switch statement
  const viewPlugin = useMemo(
    () => pluginRegistry.getViewPlugin(view.type) as ViewPlugin | undefined,
    [view.type],
  );

  // Merge saved settings with defaults
  const settings = useMemo<ViewSettingsByType>(() => {
    const defaults = getDefaultSettings(view.type);
    return { ...defaults, ...view.settings } as ViewSettingsByType;
  }, [view.type, view.settings]);

  // Build renderer props — delegates all view-specific rendering to the plugin
  const rendererProps: ViewRendererProps = useMemo(
    () => ({
      board,
      view,
      columns,
      records,
      cellValues,
      groups: groups.map((g) => ({
        id: g.id,
        name: g.name,
        color: g.color,
        order: g.order,
      })),
      settings,
      onCellChange,
      onSettingsChange: (partialSettings) => {
        onUpdateView?.(view.id, { settings: { ...settings, ...partialSettings } as ViewSettingsByType });
      },
      isActive: true,
    }),
    [board, view, columns, records, cellValues, groups, settings, onCellChange, onUpdateView],
  );

  // Handle cell changes — route through existing CRUD services
  const handleCellChange = useCallback(
    (args: { recordId: string; columnId: string; value: unknown }) => {
      onCellChange?.(args as { recordId: string; columnId: string; value: ColumnValue });
    },
    [onCellChange],
  );

  if (!viewPlugin || viewPlugin.placeholder) {
    return (
      <div className="flex flex-col gap-6">
        <ViewSwitcher
          views={views}
          activeViewId={view.id}
          onViewChange={onViewChange}
          onCreateView={onCreateView}
          onUpdateView={onUpdateView}
          onDuplicateView={onDuplicateView}
          onDeleteView={onDeleteView}
          onSetDefaultView={onSetDefaultView}
          onFavoriteView={onFavoriteView}
          onReorderViews={onReorderViews}
        />
        <div className="flex min-h-[400px] items-center justify-center rounded-xl border border-dashed border-border bg-card p-12">
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">
              {view.type.charAt(0).toUpperCase() + view.type.slice(1)} view
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {viewPlugin
                ? "This view type is defined but not yet implemented."
                : `View type "${view.type}" is not registered.`}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const RendererComponent = viewPlugin.component;

  return (
    <div className="flex flex-col gap-6">
      <ViewSwitcher
        views={views}
        activeViewId={view.id}
        onViewChange={onViewChange}
        onCreateView={onCreateView}
        onUpdateView={onUpdateView}
        onDuplicateView={onDuplicateView}
        onDeleteView={onDeleteView}
        onSetDefaultView={onSetDefaultView}
        onFavoriteView={onFavoriteView}
        onReorderViews={onReorderViews}
      />
      <RendererComponent {...rendererProps} />
    </div>
  );
}

