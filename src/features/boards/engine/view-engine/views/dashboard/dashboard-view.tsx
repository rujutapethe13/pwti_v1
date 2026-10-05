"use client";

/**
 * Dashboard View Renderer
 *
 * Renders the widget canvas for a `dashboard` board view. Owns:
 *  - widget list persistence (widgets live in DashboardViewSettings)
 *  - drag & drop reposition (dnd-kit, 12-column grid)
 *  - inline resize (delegated to WidgetCard)
 *  - add / rename / duplicate / delete / full-size / filter actions
 *  - per-widget settings slide-over
 *  - dashboard-level filter panel (reuses AdvancedFilterPanel)
 *
 * Widget configs store only column IDs — all column/group/label options are
 * resolved at render time from the live board schema.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DndContext, closestCenter, useSensors, useSensor, PointerSensor } from "@dnd-kit/core";
import { type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import {
  Check,
  Download,
  Filter,
  Loader2,
  MoreHorizontal,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import type { ViewRendererProps } from "../../view-engine-types";
import type {
  BoardRecord,
  ColumnDefinition,
  ColumnValue,
  DashboardViewSettings,
  DashboardWidgetInstance,
  ViewSettingsByType,
} from "../../../types";
import {
  type DashboardWidgetType,
  type DashboardFilterCondition,
  type BoardGroup,
  type NumberWidgetConfig,
  type ChartWidgetConfig,
  type DataOverTimeWidgetConfig,
  getDefaultWidgetConfig,
  clampWidgetsToGrid,
  compactWidgets,
  createRecordTitleColumn,
  RECORD_TITLE_COLUMN_ID,
} from "./dashboard-types";

import { WidgetCard } from "./widget-card";
import { WidgetPicker } from "./widget-picker";
import { NumberWidgetContent, NumberWidgetSettings } from "./number-widget";
import { ChartWidgetContent, ChartWidgetSettings } from "./chart-widget";
import { DataOverTimeWidgetContent, DataOverTimeWidgetSettings } from "./data-over-time-widget";
import { ColumnMappingDialog } from "./column-mapping-dialog";
import {
  buildDefaultDashboardWidgets,
  repairRoleBoundWidgets,
} from "./default-dashboard-template";
import {
  DueListContent,
  DueListSettings,
  JobsTableContent,
  JobsTableSettings,
  KpiCardContent,
  KpiCardSettings,
  type RoleWidgetProps,
} from "./role-widgets";
import {
  MEASURE_LABELS,
  readRoleCell,
  suggestRoleMapping,
  type ClientAliasMap,
  type DashboardColumnRoles,
  type DashboardMeasure,
  type DashboardRoleKey,
  type StatusBucketMap,
} from "./column-roles";
import { AdvancedFilterPanel } from "../advanced-filter-panel";
import {
  exportNodeAsPng,
  exportNodeAsPdf,
  exportSeriesAsCsv,
  exportSeriesAsXlsx,
  type ExportProgress,
  type ProgressCallback,
} from "./export";
import type { SeriesData } from "./chart-svg";

const GRID_COLUMNS = 12;
const ROW_HEIGHT = 80;
const GUTTER = 12;

type DashboardViewProps = ViewRendererProps;
interface WidgetRenderCtx {
  columns: ColumnDefinition[];
  groups: BoardGroup[];
  records: BoardRecord[];
  cellValues: Map<string, ColumnValue>;
  filters: DashboardFilterCondition[];
  roles: DashboardColumnRoles;
  statusBuckets: StatusBucketMap;
  clientAliases: ClientAliasMap;
  measure: DashboardMeasure;
  onMapColumn: (role: DashboardRoleKey) => void;
  onCategoryClick: (columnId: string, label: string) => void;
}

function renderWidgetContent(
  widget: DashboardWidgetInstance,
  ctx: WidgetRenderCtx,
): ReactNode {
  const props = {
    config: widget.config,
    columns: ctx.columns,
    groups: ctx.groups,
    records: ctx.records,
    cellValues: ctx.cellValues,
    filters: ctx.filters,
  };

  // Role-driven widgets resolve their data through the column role mapping.
  if (widget.type === "kpi-card" || widget.type === "due-list" || widget.type === "jobs-table") {
    const roleProps: RoleWidgetProps = {
      ...props,
      roles: ctx.roles,
      statusBuckets: ctx.statusBuckets,
      clientAliases: ctx.clientAliases,
      onMapColumn: ctx.onMapColumn,
    };
    if (widget.type === "kpi-card") return <KpiCardContent {...roleProps} />;
    if (widget.type === "due-list") return <DueListContent {...roleProps} />;
    return <JobsTableContent {...roleProps} />;
  }

  switch (widget.type) {
    case "number":
      return <NumberWidgetContent {...props} />;
    case "chart":
      return (
        <ChartWidgetContent
          {...props}
          roles={ctx.roles}
          measure={ctx.measure}
          onCategoryClick={ctx.onCategoryClick}
          onMapColumn={ctx.onMapColumn}
          clientAliases={ctx.clientAliases}
        />
      );
    case "data-over-time":
      return (
        <DataOverTimeWidgetContent
          {...props}
          roles={ctx.roles}
          measure={ctx.measure}
          onMapColumn={ctx.onMapColumn}
        />
      );
    default:
      return null;
  }
}

function renderWidgetSettings(
  widget: DashboardWidgetInstance,
  columns: ColumnDefinition[],
  groups: BoardGroup[],
  records: BoardRecord[],
  cellValues: Map<string, ColumnValue>,
  boardName: string,
  onConfigChange: (patch: Record<string, unknown>) => void,
): ReactNode {
  switch (widget.type) {
    case "number":
      return (
        <NumberWidgetSettings
          config={widget.config as unknown as NumberWidgetConfig}
          columns={columns}
          groups={groups}
          onChange={(patch) => onConfigChange(patch)}
        />
      );
    case "chart":
      return (
        <ChartWidgetSettings
          config={widget.config as unknown as ChartWidgetConfig}
          columns={columns}
          groups={groups}
          records={records}
          cellValues={cellValues}
          boardName={boardName}
          onChange={(patch) => onConfigChange(patch)}
        />
      );
    case "data-over-time":
      return (
        <DataOverTimeWidgetSettings
          config={widget.config as unknown as DataOverTimeWidgetConfig}
          columns={columns}
          groups={groups}
          onChange={(patch) => onConfigChange(patch)}
        />
      );
    case "kpi-card":
      return (
        <KpiCardSettings
          config={widget.config}
          onChange={(patch) => onConfigChange(patch)}
        />
      );
    case "due-list":
      return (
        <DueListSettings
          config={widget.config}
          onChange={(patch) => onConfigChange(patch)}
        />
      );
    case "jobs-table":
      return (
        <JobsTableSettings
          config={widget.config}
          onChange={(patch) => onConfigChange(patch)}
        />
      );
    default:
      return null;
  }
}

/** Shared base for the right-docked side panels ("Widget settings",
 * "Widget filters"/"Advanced filters"). Guarantees a solid opaque white
 * surface and a deterministic z-index stack so overlapping panels layer
 * cleanly (only the topmost is visible) instead of blending. */
interface SidePanelProps {
  open: boolean;
  zIndex: number;
  title: string;
  icon?: ReactNode;
  actions?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}

function SidePanel({ open, zIndex, title, icon, actions, onClose, children }: SidePanelProps) {
  if (!open) return null;
  return (
    <>
      {/* Click-through catcher (invisible; closes the panel on outside click). No translucent
          backdrop so the page behind stays fully visible — opacity lives only on the
          panel itself (see diagnostic #5). */}
      <div className="fixed inset-0" style={{ zIndex: zIndex - 1 }} onClick={onClose} aria-hidden="true" />
      <div
        className="fixed top-0 right-0 bottom-0 flex w-96 shrink-0 flex-col border-l border-border bg-white opacity-100 shadow-xl"
        style={{ zIndex: zIndex + 50 }}
      >
        <div className="flex items-center justify-between border-b border-border bg-white px-4 py-3">
          <div className="flex items-center gap-2">
            {icon}
            <span className="text-sm font-semibold text-foreground">{title}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {actions}
            <Button variant="ghost" size="icon" className="size-7" onClick={onClose} aria-label="Close">
              <X className="size-4" />
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto bg-white">{children}</div>
      </div>
    </>
  );
}

export function DashboardView({
  board,
  view,
  columns,
  records,
  cellValues,
  groups,
  settings,
  onSettingsChange,
}: DashboardViewProps) {
  // The board's built-in first column ("Name") is a real option for every
  // text-compatible role, so it is prepended to the column list everywhere.
  const columnsWithTitle = useMemo(
    () => [{ ...createRecordTitleColumn(), label: "Name (first column)" }, ...columns],
    [columns],
  );

  const dashSettings = (settings ?? {}) as DashboardViewSettings;

  const [widgets, setWidgets] = useState<DashboardWidgetInstance[]>(() =>
    clampWidgetsToGrid(
      repairRoleBoundWidgets(dashSettings.widgets ?? []).map((w) => ({ ...w })),
    ),
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeWidgetId, setActiveWidgetId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fullScreenWidget, setFullScreenWidget] = useState<DashboardWidgetInstance | null>(null);
  const [filterPanel, setFilterPanel] = useState<null | { mode: "dashboard" | "widget"; widgetId?: string }>(null);
  const [mappingOpen, setMappingOpen] = useState(false);
  const [mappingFocusRole, setMappingFocusRole] = useState<DashboardRoleKey | null>(null);

  // Memoised so the render-context identity stays stable across renders.
  const roles = useMemo(
    () => (dashSettings.columnRoles ?? {}) as DashboardColumnRoles,
    [dashSettings.columnRoles],
  );
  // The persisted shape stores buckets as plain strings; narrow on read.
  const statusBuckets = useMemo(
    () => (dashSettings.statusBuckets ?? {}) as StatusBucketMap,
    [dashSettings.statusBuckets],
  );
  const clientAliases = useMemo(
    () => (dashSettings.clientAliases ?? {}) as ClientAliasMap,
    [dashSettings.clientAliases],
  );
  const measure: DashboardMeasure = dashSettings.measure ?? "jobs";

  /**
   * Only a dashboard created from the default template carries an explicit
   * `columnMappingDone: false`, so existing dashboards (where the flag is
   * absent) are never prompted and behave exactly as before.
   */
  const mappingRequired = dashSettings.columnMappingDone === false;
  const mappingPromptedRef = useRef(false);

  useEffect(() => {
    if (!mappingRequired || mappingPromptedRef.current) return;
    mappingPromptedRef.current = true;
    setMappingOpen(true);
  }, [mappingRequired]);

  const toolbarRef = useRef<HTMLDivElement>(null);
  const [compactToolbar, setCompactToolbar] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(1200);

  // Secondary toolbar actions collapse into a "..." menu once the toolbar
  // cannot fit them on one line beside the view title.
  useEffect(() => {
    const el = toolbarRef.current;
    if (!el) return;
    const update = () => setCompactToolbar(el.clientWidth < 900);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const widgetsRef = useRef<DashboardWidgetInstance[]>(widgets);
  useEffect(() => {
    widgetsRef.current = widgets;
  }, [widgets]);

  // Grid → pixel conversion. Each column sits between half-gutters, so the
  // outer half-gutter on the right has to come out of the column width —
  // otherwise the last column's widget overhangs the canvas by GUTTER/2.
  const colWidth = Math.max(
    1,
    (containerWidth - (GRID_COLUMNS + 1) * GUTTER) / GRID_COLUMNS,
  );

  const contentBottomRow = widgets.length > 0 ? Math.max(...widgets.map((w) => w.y + w.h)) : 0;
  const canvasHeight = contentBottomRow * (ROW_HEIGHT + GUTTER) + GUTTER + 24;

  // Sync local widgets when the active view changes.
  useEffect(() => {
    setWidgets((prev) => {
      const incoming = dashSettings.widgets ?? [];
      if (incoming.length !== prev.length) {
        return clampWidgetsToGrid(
          repairRoleBoundWidgets(incoming).map((w) => ({ ...w })),
        );
      }
      return prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.id]);

  // Measure canvas width for grid → pixel conversion.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const update = () => setContainerWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Fill the viewport below the toolbar; recompute on resize.

  const saveWidgets = useCallback(
    (next: DashboardWidgetInstance[]) => {
      // Never persist a position the current grid cannot show.
      const clamped = clampWidgetsToGrid(next);
      setWidgets(clamped);
      onSettingsChange?.({ widgets: clamped } as unknown as Partial<ViewSettingsByType>);
    },
    [onSettingsChange],
  );

  const updateWidget = useCallback(
    (id: string, patch: Partial<DashboardWidgetInstance>) => {
      const next = widgets.map((w) => (w.id === id ? { ...w, ...patch } : w));
      widgetsRef.current = next;
      saveWidgets(next);
    },
    [widgets, saveWidgets],
  );

  const addWidget = useCallback(
    (type: DashboardWidgetType) => {
      const min = type === "number" ? { w: 2, h: 2 } : { w: 4, h: 4 };
      const newWidget: DashboardWidgetInstance = {
        id: `w-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type,
      title:
        type === "number"
          ? "Numbers"
          : type === "chart"
            ? "Chart"
            : type === "data-over-time"
              ? "Data over time"
              : type === "kpi-card"
                ? "KPI card"
                : type === "due-list"
                  ? "Due list"
                  : "Jobs table",
        x: 0,
        y: stackTopY(widgets),
        w: min.w,
        h: min.h,
        minW: min.w,
        minH: min.h,
        config: getDefaultWidgetConfig(type),
        hasFilter: false,
      };
      saveWidgets(compactWidgets([...widgets, newWidget]));
      setSelectedId(newWidget.id);
      setActiveWidgetId(newWidget.id);
      setSettingsOpen(true);
    },
    [widgets, saveWidgets],
  );

  const removeWidget = useCallback(
    (id: string) => {
      saveWidgets(widgets.filter((w) => w.id !== id));
      if (selectedId === id) setSelectedId(null);
    },
    [widgets, selectedId, saveWidgets],
  );

  const duplicateWidget = useCallback(
    (id: string) => {
      const w = widgets.find((x) => x.id === id);
      if (!w) return;
      const copy: DashboardWidgetInstance = {
        ...w,
        id: `w-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title: `${w.title} (copy)`,
        x: w.x + 1,
        y: w.y + 1,
        config: structuredClone(w.config ?? {}),
      };
      saveWidgets([...widgets, copy]);
      setSelectedId(copy.id);
    },
    [widgets, saveWidgets],
  );

  const renameWidget = useCallback(
    (id: string, title: string) => updateWidget(id, { title }),
    [updateWidget],
  );

  const openSettings = useCallback((id: string) => {
    setActiveWidgetId(id);
    setSettingsOpen(true);
  }, []);

  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
    setActiveWidgetId(null);
  }, []);

  const openFullSize = useCallback((widget: DashboardWidgetInstance) => {
    setFullScreenWidget({ ...widget });
  }, []);

  const closeFullSize = useCallback(() => setFullScreenWidget(null), []);

  const effectiveFilters = useCallback(
    (widget: DashboardWidgetInstance): DashboardFilterCondition[] => {
      const df = (dashSettings.dashboardFilters ?? []) as DashboardFilterCondition[];
      const wf = (widget.config?.perWidgetFilters as DashboardFilterCondition[] | undefined) ?? [];
      return [...df, ...wf];
    },
    [dashSettings.dashboardFilters],
  );

  const onDragStart = useCallback((event: DragStartEvent) => {
    const widget = widgets.find((w) => w.id === event.active.id);
    if (widget) dragStartRef.current = { x: widget.x, y: widget.y };
  }, [widgets]);

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      const start = dragStartRef.current;
      dragStartRef.current = null;
      if (!start) return;
      const widget = widgets.find((w) => w.id === event.active.id);
      if (!widget) return;
      const cw = colWidth || 0;
      let newX = start.x;
      let newY = start.y;
      if (cw > 0) {
        newX = Math.max(0, Math.min(GRID_COLUMNS - widget.w, Math.round(start.x + event.delta.x / cw)));
      }
      newY = Math.max(0, Math.round(start.y + event.delta.y / ROW_HEIGHT));
      const updated = widgets.map((w) => (w.id === widget.id ? { ...w, x: newX, y: newY } : w));
      saveWidgets(compactWidgets(updated));
    },
    [widgets, colWidth, saveWidgets],
  );

  // After an interactive resize, reflow neighbours so nothing overlaps.
  const compactAndSave = useCallback(() => {
    saveWidgets(compactWidgets(widgetsRef.current));
  }, [saveWidgets]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const openDashboardFilters = useCallback(() => setFilterPanel({ mode: "dashboard" }), []);
  const openWidgetFilters = useCallback(
    (id: string) => setFilterPanel({ mode: "widget", widgetId: id }),
    [],
  );
  const closeFilters = useCallback(() => setFilterPanel(null), []);

  // ── Export ───────────────────────────────────────────────
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const exportProgressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const updateExportProgress = useCallback<ProgressCallback>((p) => {
    if (exportProgressTimer.current) clearTimeout(exportProgressTimer.current);
    // Debounce slightly so the UI doesn't thrash on every progress tick.
    exportProgressTimer.current = setTimeout(() => setExportProgress(p), 80);
  }, []);
  useEffect(() => {
    return () => {
      if (exportProgressTimer.current) clearTimeout(exportProgressTimer.current);
    };
  }, []);

  const findWidgetNode = useCallback((id: string): HTMLElement | null => {
    return document.querySelector<HTMLElement>(`[data-widget-id="${CSS.escape(id)}"]`);
  }, []);

  const readWidgetSeries = useCallback(
    (id: string): { xLabels: string[]; series: SeriesData[] } | null => {
      const node = findWidgetNode(id);
      if (!node) return null;
      const inner = node.querySelector<HTMLElement>("[data-export-series]");
      const raw = inner?.dataset.exportSeries;
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw);
        if (
          parsed &&
          Array.isArray(parsed.xLabels) &&
          Array.isArray(parsed.series) &&
          parsed.series.every(
            (s: SeriesData) =>
              typeof s?.name === "string" && typeof s?.color === "string" && Array.isArray(s?.points),
          )
        ) {
          return { xLabels: parsed.xLabels, series: parsed.series };
        }
      } catch {
        return null;
      }
      return null;
    },
    [findWidgetNode],
  );

  const runExport = useCallback(
    async (task: () => Promise<void>, errorLabel: string) => {
      setExportProgress({ progress: 0, status: "Preparing…" });
      try {
        await task();
        toast.success("Export complete");
      } catch (err) {
        console.error(err);
        toast.error(`${errorLabel} failed`, {
          description: err instanceof Error ? err.message : "Unknown error",
        });
      } finally {
        setExportProgress(null);
        if (exportProgressTimer.current) clearTimeout(exportProgressTimer.current);
      }
    },
    [],
  );

  const exportDashboardPng = useCallback(() => {
    if (!canvasRef.current) return;
    const node = canvasRef.current;
    const name = view.name || "Dashboard";
    void runExport(
      () => exportNodeAsPng(node, name, updateExportProgress),
      "PNG export",
    );
  }, [runExport, updateExportProgress, view.name]);

  const exportDashboardPdf = useCallback(() => {
    if (!canvasRef.current) return;
    const node = canvasRef.current;
    const name = view.name || "Dashboard";
    void runExport(
      () => exportNodeAsPdf(node, name, updateExportProgress),
      "PDF export",
    );
  }, [runExport, updateExportProgress, view.name]);

  const exportWidgetPng = useCallback(
    (widgetId: string) => {
      const node = findWidgetNode(widgetId);
      if (!node) return;
      const w = widgets.find((x) => x.id === widgetId);
      void runExport(
        () => exportNodeAsPng(node, w?.title || "Widget", updateExportProgress),
        "Widget PNG export",
      );
    },
    [findWidgetNode, runExport, updateExportProgress, widgets],
  );

  const exportWidgetCsv = useCallback(
    (widgetId: string) => {
      const data = readWidgetSeries(widgetId);
      if (!data) {
        toast.error("CSV export unavailable", {
          description: "This widget has no chart data to export.",
        });
        return;
      }
      const w = widgets.find((x) => x.id === widgetId);
      try {
        exportSeriesAsCsv(data.xLabels, data.series, w?.title || "Widget");
      } catch (err) {
        console.error(err);
        toast.error("CSV export failed");
      }
    },
    [readWidgetSeries, widgets],
  );

  const exportWidgetXlsx = useCallback(
    (widgetId: string) => {
      const data = readWidgetSeries(widgetId);
      if (!data) {
        toast.error("XLSX export unavailable", {
          description: "This widget has no chart data to export.",
        });
        return;
      }
      const w = widgets.find((x) => x.id === widgetId);
      void runExport(
        () => exportSeriesAsXlsx(data.xLabels, data.series, w?.title || "Widget"),
        "XLSX export",
      );
    },
    [readWidgetSeries, runExport, widgets],
  );

  const applyFilters = useCallback(
    (filters: DashboardFilterCondition[]) => {
      if (!filterPanel) return;
      if (filterPanel.mode === "dashboard") {
        onSettingsChange?.({
          dashboardFilters: filters,
          filtersActive: filters.length > 0,
        } as unknown as Partial<ViewSettingsByType>);
      } else if (filterPanel.widgetId) {
        const w = widgets.find((x) => x.id === filterPanel.widgetId);
        if (w) {
          updateWidget(w.id, {
            hasFilter: filters.length > 0,
            config: { ...w.config, perWidgetFilters: filters },
          });
        }
      }
      setFilterPanel(null);
    },
    [filterPanel, onSettingsChange, widgets, updateWidget],
  );

  // ── Column role mapping ───────────────────────────────────

  const openMapping = useCallback((role?: DashboardRoleKey) => {
    setMappingFocusRole(role ?? null);
    setMappingOpen(true);
  }, []);

  /**
   * Distinct values on the current status / client columns, used to seed the
   * bucket map and the merge-clients tool. Read live from the loaded records.
   */
  const statusValues = useMemo(() => {
    const columnId = roles.status;
    if (!columnId) return [];
    const seen = new Set<string>();
    for (const record of records) {
      const value = cellValues.get(`${record.id}:${columnId}`);
      if (value === null || value === undefined || value === "") continue;
      seen.add(String(value));
    }
    return Array.from(seen).sort((a, b) => a.localeCompare(b)).slice(0, 200);
  }, [roles.status, records, cellValues]);

  const clientValues = useMemo(() => {
    const columnId = roles.client;
    if (!columnId) return [];
    const seen = new Set<string>();
    for (const record of records) {
      const value = readRoleCell(record, columnId, cellValues);
      if (value === null || value === undefined || value === "") continue;
      seen.add(String(value));
    }
    return Array.from(seen).slice(0, 2000);
  }, [roles.client, records, cellValues]);

  /**
   * Distinct values of the board's first column. Its repetition decides whether
   * auto-suggest maps it to Client or offers it as "Item / Batch name".
   */
  const nameValues = useMemo(() => {
    const seen = new Set<string>();
    for (const record of records) {
      const value = readRoleCell(record, RECORD_TITLE_COLUMN_ID, cellValues);
      if (value === null || value === undefined || value === "") continue;
      seen.add(String(value));
    }
    return Array.from(seen).slice(0, 2000);
  }, [records, cellValues]);

  const saveMapping = useCallback(
    (next: {
      roles: DashboardColumnRoles;
      statusBuckets: StatusBucketMap;
      clientAliases: ClientAliasMap;
    }) => {
      onSettingsChange?.({
        columnRoles: next.roles,
        statusBuckets: next.statusBuckets,
        clientAliases: next.clientAliases,
        columnMappingDone: true,
      } as unknown as Partial<ViewSettingsByType>);
    },
    [onSettingsChange],
  );

  /**
   * "Reset to default" rebuilds the template layout from the current mapping.
   * Only ever offered on dashboards created from the template; a hand-built
   * dashboard keeps its widgets unless the user asks.
   */
  const resetToDefault = useCallback(() => {
    const nextRoles = {
      ...suggestRoleMapping(columnsWithTitle, {
        nameColumnId: RECORD_TITLE_COLUMN_ID,
        nameDistinctRatio:
          nameValues.length > 0 ? nameValues.length / Math.max(1, records.length) : null,
      }),
      ...roles,
    };
    saveWidgets(compactWidgets(buildDefaultDashboardWidgets(nextRoles)));
    toast.success("Dashboard reset to the default layout.");
  }, [columnsWithTitle, nameValues, records.length, roles, saveWidgets]);

  /** Click-to-filter: apply a category click as a dashboard-wide filter. */
  const applyCategoryFilter = useCallback(
    (columnId: string, label: string) => {
      const existing = dashSettings.dashboardFilters ?? [];
      const already = existing.some(
        (f) => f.columnId === columnId && String(f.value) === label,
      );
      const next = already
        ? existing.filter((f) => !(f.columnId === columnId && String(f.value) === label))
        : [
            ...existing,
            {
              id: `df-${columnId}-${label}-${Date.now()}`,
              columnId,
              operator: "is",
              value: label,
            },
          ];
      onSettingsChange?.({
        dashboardFilters: next,
        filtersActive: next.length > 0,
      } as unknown as Partial<ViewSettingsByType>);
    },
    [dashSettings.dashboardFilters, onSettingsChange],
  );

  const widgetCtx = useMemo(
    () => ({
      columns: columnsWithTitle,
      groups: groups as BoardGroup[],
      records,
      cellValues,
      roles,
      statusBuckets,
      clientAliases,
      measure,
      onMapColumn: openMapping,
      onCategoryClick: applyCategoryFilter,
    }),
    [
      columnsWithTitle,
      groups,
      records,
      cellValues,
      roles,
      statusBuckets,
      clientAliases,
      measure,
      openMapping,
      applyCategoryFilter,
    ],
  );

  const sortedWidgets = useMemo(() => {
    // Stable top-then-left packing order for z-index layering.
    return [...widgets].sort((a, b) => a.y - b.y || a.x - b.x);
  }, [widgets]);

  return (
    <div
      className="relative flex h-full w-full min-w-0 max-w-full flex-col overflow-x-hidden"
      style={{ boxSizing: "border-box" }}
    >
      {/* Toolbar is hidden while a side panel is open so the panel is never overlapped */}
      <div
        ref={toolbarRef}
        className={`flex w-full min-w-0 shrink-0 flex-wrap items-center justify-between gap-2 bg-background ${
          settingsOpen || filterPanel || fullScreenWidget || mappingOpen ? "hidden" : ""
        }`}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-semibold text-foreground">{view.name || "Dashboard"}</span>
          <span className="shrink-0 text-sm text-muted-foreground">({widgets.length} widget{widgets.length === 1 ? "" : "s"})</span>
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
          <Button variant="outline" size="sm" className="h-8 shrink-0 gap-1.5 text-sm" onClick={() => openMapping()}>
            <SlidersHorizontal className="size-3.5" />
            Map columns
          </Button>
          <Button size="sm" className="h-8 shrink-0 gap-1.5 text-sm" onClick={() => setPickerOpen(true)}>
            <Plus className="size-4" />
            Add widget
          </Button>
          {/* Measure / Export / Filters / Reset move into a "..." menu when the
              toolbar is too narrow to show them beside Map columns. */}
          {compactToolbar ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0 gap-1.5 text-sm"
                  aria-label="More dashboard actions"
                >
                  <MoreHorizontal className="size-3.5" />
                  More
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-xs uppercase text-muted-foreground">
                  Measure
                </DropdownMenuLabel>
                {(["jobs", "images", "skus"] as DashboardMeasure[]).map((option) => (
                  <DropdownMenuItem
                    key={option}
                    className="text-sm"
                    onSelect={() =>
                      onSettingsChange?.({ measure: option } as unknown as Partial<ViewSettingsByType>)
                    }
                  >
                    {MEASURE_LABELS[option]}
                    {measure === option && <Check className="ml-auto size-3.5" />}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-sm"
                  onSelect={exportDashboardPdf}
                  disabled={widgets.length === 0 || !!exportProgress}
                >
                  <Download className="mr-2 size-3.5" />
                  Export dashboard as PDF
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-sm"
                  onSelect={exportDashboardPng}
                  disabled={widgets.length === 0 || !!exportProgress}
                >
                  <Download className="mr-2 size-3.5" />
                  Export dashboard as PNG
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-sm" onSelect={openDashboardFilters}>
                  <Filter className="mr-2 size-3.5" />
                  Filters
                </DropdownMenuItem>
                {widgets.length > 0 && (
                  <DropdownMenuItem className="text-sm" onSelect={resetToDefault}>
                    <RotateCcw className="mr-2 size-3.5" />
                    Reset to default layout
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-sm">
                {MEASURE_LABELS[measure]}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              {(["jobs", "images", "skus"] as DashboardMeasure[]).map((option) => (
                <DropdownMenuItem
                  key={option}
                  className="text-sm"
                  onSelect={() =>
                    onSettingsChange?.({ measure: option } as unknown as Partial<ViewSettingsByType>)
                  }
                >
                  {MEASURE_LABELS[option]}
                  {measure === option && <span className="ml-auto">✓</span>}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 shrink-0 gap-1.5 text-sm"
                disabled={widgets.length === 0 || !!exportProgress}
              >
                {exportProgress ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Download className="size-3.5" />
                )}
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem
                className="text-sm"
                onSelect={exportDashboardPdf}
                disabled={!!exportProgress}
              >
                <Download className="mr-2 size-3.5" />
                Export dashboard as PDF
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-sm"
                onSelect={exportDashboardPng}
                disabled={!!exportProgress}
              >
                <Download className="mr-2 size-3.5" />
                Export dashboard as PNG
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="outline"
            size="sm"
            className="h-8 shrink-0 gap-1.5 text-sm"
            onClick={openDashboardFilters}
          >
            <Filter className="size-3.5" />
            Filters
          </Button>
          {widgets.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 shrink-0 gap-1.5 text-sm">
                  <RotateCcw className="size-3.5" />
                  Reset
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem className="text-sm" onSelect={resetToDefault}>
                  <RotateCcw className="mr-2 size-3.5" />
                  Reset to default layout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
            </>
          )}
        </div>
      </div>

      {/* Canvas — the only vertically scrolling region on the dashboard */}
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-3 overflow-x-hidden overflow-y-auto p-3">
      <div
        ref={canvasRef}
        className="relative w-full min-w-0 rounded-lg border border-border bg-muted"
        style={{
          height: canvasHeight > 0 ? `${canvasHeight}px` : undefined,
        }}
      >
        {widgets.length === 0 ? (
          <div className="flex h-full w-full items-center justify-center">
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="text-sm text-muted-foreground">No widgets on this dashboard yet.</div>
              <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)}>
                <Plus className="size-4" /> Add widget
              </Button>
            </div>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          >
            <SortableContext items={widgets.map((w) => w.id)} strategy={verticalListSortingStrategy}>
        {sortedWidgets.map((widget) => {
          const effectiveFiltersList = effectiveFilters(widget);
          return (
            <WidgetCard
              key={widget.id}
              widget={widget}
              colWidth={colWidth}
              rowHeight={ROW_HEIGHT}
              gutter={GUTTER}
              maxW={GRID_COLUMNS}
              editable
                    selected={selectedId === widget.id}
                    filterActive={widget.hasFilter || effectiveFiltersList.length > 0}
                    onSelect={(id) => {
                      setSelectedId(id);
                      if (id === activeWidgetId) {
                        setSettingsOpen(true);
                      }
                    }}
                    onFullSize={openFullSize}
                    onRename={renameWidget}
                    onDuplicate={duplicateWidget}
                    onRemove={removeWidget}
                    onOpenSettings={openSettings}
                    onFilter={openWidgetFilters}
                    onExportPng={exportWidgetPng}
                    onExportCsv={exportWidgetCsv}
                    onExportXlsx={exportWidgetXlsx}
                    onUpdate={updateWidget}
                    onResizeEnd={compactAndSave}
                  >
<div className="h-full w-full min-w-0 overflow-hidden">
                       {renderWidgetContent(widget, { ...widgetCtx, filters: effectiveFiltersList })}
                     </div>
                  </WidgetCard>
                );
              })}
            </SortableContext>
          </DndContext>
        )}
      </div>
      </div>

      {/* Add Widget picker */}
      <WidgetPicker open={pickerOpen} onOpenChange={setPickerOpen} onSelect={addWidget} />

      {/* Column role mapping */}
      <ColumnMappingDialog
        open={mappingOpen}
        onOpenChange={setMappingOpen}
        columns={columns}
        roles={roles}
        statusBuckets={statusBuckets}
        clientAliases={clientAliases}
        statusValues={statusValues}
        clientValues={clientValues}
        nameValues={nameValues}
        onSave={saveMapping}
        focusRole={mappingFocusRole}
      />

      {/* Widget Settings slide-over */}
      <SidePanel
        open={settingsOpen && !!activeWidgetId}
        zIndex={50}
        title="Widget settings"
        actions={
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-sm"
            onClick={() => setFilterPanel({ mode: "widget", widgetId: activeWidgetId! })}
          >
            <Filter className="size-3.5" /> Filters
          </Button>
        }
        onClose={closeSettings}
      >
        {activeWidgetId &&
            renderWidgetSettings(
              widgets.find((w) => w.id === activeWidgetId)!,
              columnsWithTitle,
              groups as BoardGroup[],
              records,
              cellValues,
              board.name,
            (patch) => {
              const w = widgets.find((x) => x.id === activeWidgetId);
              if (w) updateWidget(w.id, { config: { ...w.config, ...patch } });
            },
          )}
      </SidePanel>

      {/* Full-size viewer */}
      {fullScreenWidget && (
        <Dialog open={true} onOpenChange={() => closeFullSize()}>
          <DialogContent className="max-w-5xl p-0">
            <DialogHeader className="flex h-12 items-center justify-between border-b border-border px-4">
              <DialogTitle className="text-left text-sm font-medium">{fullScreenWidget.title}</DialogTitle>
              <Button variant="ghost" size="icon" className="size-7" onClick={closeFullSize} aria-label="Close">
                <X className="size-4" />
              </Button>
            </DialogHeader>
            <div className="p-4">
              {renderWidgetContent(fullScreenWidget, { ...widgetCtx, filters: effectiveFilters(fullScreenWidget) })}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Filter panel (dashboard-level or per-widget) */}
      <SidePanel
        open={!!filterPanel}
        zIndex={60}
        title={filterPanel?.mode === "dashboard" ? "Dashboard filters" : "Widget filters"}
        icon={<Filter className="size-4 text-foreground" />}
        onClose={closeFilters}
      >
        {filterPanel && (
          <AdvancedFilterPanel
            columns={columns}
            records={records}
            cellValues={cellValues}
            onClose={closeFilters}
            onApply={applyFilters}
            initialFilters={
              filterPanel.mode === "widget" && filterPanel.widgetId
                ? (widgets.find((w) => w.id === filterPanel.widgetId)?.config?.perWidgetFilters as
                    | Array<{ id: string; columnId: string; operator: string; value: ColumnValue }>
                    | undefined) ?? []
                : (dashSettings.dashboardFilters as Array<{
                    id: string;
                    columnId: string;
                    operator: string;
                    value: ColumnValue;
                  }>) ?? []
            }
          />
        )}
      </SidePanel>

      {/* Export progress indicator */}
      <Dialog open={!!exportProgress} onOpenChange={() => undefined}>
        <DialogContent
          className="max-w-sm"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="text-sm font-medium">Exporting…</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2 px-4 pb-4">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-[width] duration-200"
                style={{ width: `${Math.round((exportProgress?.progress ?? 0) * 100)}%` }}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              {exportProgress?.status ?? "Preparing…"}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function stackTopY(widgets: DashboardWidgetInstance[]): number {
  if (widgets.length === 0) return 0;
  return Math.max(0, ...widgets.map((w) => w.y + w.h));
}

DashboardView.displayName = "DashboardView";
export type { DashboardViewProps };