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

import { useMemo, useRef } from "react";
import { pluginRegistry } from "../plugins/plugin-registry";
import { getDefaultSettings, type ViewEngineProps, type ViewRendererProps } from "./view-engine-types";
import type { ViewSettingsByType } from "../types";
import type { ViewPlugin } from "../plugins/plugin-types";

// ── View Engine ────────────────────────────────────────────

export function ViewEngine({
  boardData,
  view,
  onUpdateView,
  onCellChange,
  onRecordCreate,
  onRecordTitleChange,
  onNewItem,
  columnOps,
  groupOps,
  onBulkArchive,
  onBulkDelete,
  onRowDelete,
  onRowDuplicate,
  onMoveToGroup,
  onMoveToStatus,
  bulkArchiveLoading,
  bulkDeleteLoading,
}: ViewEngineProps) {
  const { board, columns, groups, records, cellValues } = boardData;
  const loggedMissingRef = useRef<Set<string> | null>(null);

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
        statusOptions: g.statusOptions,
        titleColumnLabel: g.titleColumnLabel,
        columnMode: g.columnMode,
      })),
      settings,
      onCellChange,
      onRecordCreate,
      onRecordTitleChange,
      onNewItem,
      columnOps,
      groupOps,
      onSettingsChange: (partialSettings) => {
        onUpdateView?.(view.id, { settings: { ...settings, ...partialSettings } as ViewSettingsByType });
      },
      isActive: true,
      onBulkArchive,
      onBulkDelete,
      onRowDelete,
      onRowDuplicate,
      onMoveToGroup,
      onMoveToStatus,
      bulkArchiveLoading,
      bulkDeleteLoading,
    }),
    [board, view, columns, records, cellValues, groups, settings, onCellChange, onRecordCreate, onRecordTitleChange, onNewItem, columnOps, groupOps, onUpdateView, onBulkArchive, onBulkDelete, onRowDelete, onRowDuplicate, onMoveToGroup, onMoveToStatus, bulkArchiveLoading, bulkDeleteLoading],
  );

  if (!viewPlugin || viewPlugin.placeholder) {
    if (process.env.NODE_ENV !== "production") {
      const loggedMissing = (loggedMissingRef.current ??= new Set<string>());
      if (!loggedMissing.has(view.type)) {
        loggedMissing.add(view.type);
        const registeredViewTypes = pluginRegistry
          .getAll()
          .filter((p) => p.category === "view")
          .map((p) => (p as ViewPlugin).viewType);
        console.warn(
          `[ViewEngine] No registered view plugin for type ${JSON.stringify(view.type)}.`,
          `\nrequested type: ${JSON.stringify(view.type)}`,
          `\nregistered view types: ${JSON.stringify(registeredViewTypes)}`,
        );
      }
    }
    return (
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
    );
  }

  const RendererComponent = viewPlugin.component;

  return <RendererComponent {...rendererProps} />;
}
