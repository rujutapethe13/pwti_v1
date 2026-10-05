"use client";

/**
 * Dashboard — Chart Widget
 *
 * §6 Settings panel:
 *   6.1 Chart type (grouped visual picker)
 *   6.2 X-axis   (searchable column dropdown)
 *   6.3 Stack by (searchable column dropdown)
 *   6.4 Y-axis   (Count | numeric columns + calculation)
 *   6.5 Customize (labels, sort, show-options)
 *   6.6 Benchmark lines
 *   6.7 Groups
 *   6.8 Columns
 *   6.9 Full-size
 */

import { memo, useMemo, useState, useCallback, useEffect } from "react";
import { ChevronDown, Edit3, GripVertical } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { BoardRecord, ColumnDefinition, ColumnValue } from "../../../types";
import type {
  DashboardWidgetGroupFilter,
  BoardGroup,
  DashboardFilterCondition,
  ChartWidgetConfig,
  FilterableRecord,
  YAxisMode,
} from "./dashboard-types";
import {
  getColumnOptions,
  applyFilters,
  filterRecordsByGroups,
  resolveGroups,
  getCellValue,
  resolveOptionValue,
  aggregate,
  NUMERIC_TYPES,
  TEXT_TYPES,
  OPTION_TYPES,
  RECORD_TITLE_COLUMN_ID,
  createRecordTitleColumn,
} from "./dashboard-types";
import { resolveOptionDisplay } from "../../../lib/option-lookup";
import { DEFAULT_COLORS } from "@/features/boards/engine/components/cell-options-popup";
import { RenderChart, seriesColor, hashColor, type SeriesData } from "./chart-svg";
import {
  MEASURE_ROLE,
  clientGroupKey,
  clientGroupLabel,
  parseLooseNumber,
  recordTurnaroundDays,
  type ClientAliasMap,
  type DashboardColumnRoles,
  type DashboardMeasure,
  type DashboardRoleKey,
} from "./column-roles";
import { MapColumnPrompt, ROLE_LABELS } from "./role-widgets";
import {
  SectionHeader,
  SearchableColumnSelect,
  ChartTypePicker,
  InfoTooltip,
  StretchCheckbox,
  LabelColorSwatch,
  useElementSize,
} from "./dashboard-shared";
import {
  GroupsSection,
  ColumnChecklistSection,
  BenchmarkLinesSection,
} from "./dashboard-sections";

export interface ChartWidgetContentProps {
  config: Record<string, unknown>;
  columns: ColumnDefinition[];
  groups: BoardGroup[];
  records: Array<FilterableRecord & { title: string; groupId?: string | null }>;
  cellValues: Map<string, ColumnValue>;
  filters: DashboardFilterCondition[];
  /**
   * Per-board role mapping. Optional — widgets without it behave exactly as
   * before. Used for the derived "turnaround" measure and client normalisation.
   */
  roles?: DashboardColumnRoles;
  /** Dashboard-wide measure switch (Jobs | Images | SKUs). */
  measure?: DashboardMeasure;
  /** Applies a category click as a dashboard-wide filter. */
  onCategoryClick?: (columnId: string, label: string) => void;
  /** Opens "Map your columns", optionally focused on one role. */
  onMapColumn?: (role: DashboardRoleKey) => void;
  /** Client-name aliases, applied when the X-axis role is "client". */
  clientAliases?: ClientAliasMap;
}

export function getLabel(
  record: { id: string; title: string },
  xCol: ColumnDefinition | undefined,
  cellValues: Map<string, ColumnValue>,
): string {
  if (xCol) {
    const v = getCellValue(record.id, xCol.id, cellValues);
    if (v !== null && v !== undefined && v !== "") {
      if (OPTION_TYPES.includes(xCol.type)) {
        // The cell stores the option id; the chart must show the label.
        // Unresolvable ids are dropped from the legend rather than rendered
        // as a raw "opt-…" slice.
        const resolved = resolveOptionDisplay(getColumnOptions(xCol), v);
        if (resolved.isUnknown) return "";
        return resolved.label;
      }
      return String(v);
    }
  }
  return record.title || "(no title)";
}

/**
 * Resolve a role-bound axis to a column id. The mapped column wins so the
 * widget tracks the mapping; the stored id is the fallback for old layouts.
 */
function resolveRoleColumn(
  role: DashboardRoleKey | undefined,
  roles: DashboardColumnRoles | undefined,
  fallback: string,
): string {
  if (!role) return fallback ?? "";
  return roles?.[role] ?? fallback ?? "";
}

/**
 * Label for one record on a role-bound axis. Client / item-name axes trim and
 * group case-insensitively (honouring client aliases); every other axis falls
 * back to the plain cell text, exactly as before.
 */
function roleLabel(
  record: { id: string; title: string },
  role: DashboardRoleKey | undefined,
  xCol: ColumnDefinition | undefined,
  cellValues: Map<string, ColumnValue>,
  clientAliases: ClientAliasMap | undefined,
): string {
  const raw = getLabel(record, xCol, cellValues);
  if (role !== "client" && role !== "itemName") return raw;
  const key = clientGroupKey(raw, clientAliases);
  return key ? clientGroupLabel(key, clientAliases) : raw;
}

function distinctInOrder<T>(values: T[]): T[] {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const v of values) {
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

export const ChartWidgetContent = memo(
  ({ config, columns, groups, records, cellValues, filters, roles, measure, onCategoryClick, onMapColumn, clientAliases }: ChartWidgetContentProps) => {
    const cfg = config as unknown as ChartWidgetConfig;
    const [containerRef, containerSize] = useElementSize();

    /**
     * Role-bound axes resolve live from the mapping so re-mapping a column in
     * "Map your columns" repoints the widget immediately. `xAxisColumnId` /
     * `stackByColumnId` remain the fallback for hand-picked columns.
     */
    const xAxisColumnId = resolveRoleColumn(cfg.xAxisRole, roles, cfg.xAxisColumnId);
    const stackByColumnId = resolveRoleColumn(cfg.stackByRole, roles, cfg.stackByColumnId);

    // A widget bound to a role with nothing mapped offers the mapping step
    // rather than silently regrouping by some other column.
    const unmappedRole = cfg.xAxisRole && !xAxisColumnId ? cfg.xAxisRole : null;

    // Dashboard-wide Measure switch: overrides the widget's Y-axis choice for
    // widgets the default template marked with useMeasure.
    const measureRole = cfg.useMeasure ? MEASURE_ROLE[measure ?? "jobs"] : null;
    const measureColumnId = measureRole && roles ? (roles[measureRole] ?? "") : "";
    const effectiveYAxisMode: YAxisMode =
      cfg.useMeasure && measureColumnId ? "column" : cfg.yAxisMode;
    const effectiveYAxisColumnId = cfg.useMeasure ? measureColumnId : cfg.yAxisColumnId;

    const { series, xLabels } = useMemo(() => {
      const groupFilter = cfg.groups ?? { all: true, top: true, ids: [] };
      let working = filterRecordsByGroups(records, resolveGroups(groups), groupFilter);
      working = applyFilters(working, columns, cellValues, filters);

      const xCol = xAxisColumnId ? columns.find((c) => c.id === xAxisColumnId) : undefined;
      const stackCol = stackByColumnId ? columns.find((c) => c.id === stackByColumnId) : undefined;
      const stackOptions = stackCol ? getColumnOptions(stackCol) : [];
      const useOptions = stackCol && stackOptions.length > 0;

      const labelFor = (r: (typeof working)[number]) =>
        roleLabel(r, cfg.xAxisRole, xCol, cellValues, clientAliases);
      const labels = distinctInOrder(working.map(labelFor));
      let finalLabels = labels;

      const metricFor = (recs: typeof working): number | null => {
        // Derived measure: days between two role dates (avg turnaround).
        if (cfg.calcSource === "turnaround" && roles) {
          return aggregate(
            recs.map((r) =>
              recordTurnaroundDays(
                r,
                roles,
                cellValues,
                (cfg.calcFromRole as DashboardRoleKey | undefined) ?? "receivedDate",
                (cfg.calcToRole as DashboardRoleKey | undefined) ?? "completedDate",
              ),
            ),
            cfg.calculation ?? "average",
            "",
          ).value;
        }
        if (effectiveYAxisMode === "count") return recs.length ? recs.length : 0;
        return aggregate(
          recs.map((r) => (effectiveYAxisColumnId ? getNumeric(r, effectiveYAxisColumnId, cellValues) : null)),
          cfg.calculation ?? "sum",
          "",
        ).value;
      };

      let seriesMap: Record<string, SeriesData>;

      if (stackCol && stackOptions.length === 0) {
        const stackValues = distinctInOrder(
          working.map((r) => getColumnValue(r, stackCol.id, cellValues)),
        );
        seriesMap = {};
        for (const sv of stackValues) {
          const pts = finalLabels.map((xl) => {
            const bucket = working.filter((r) => labelFor(r) === xl && getColumnValue(r, stackCol.id, cellValues) === sv);
            return { label: xl, value: metricFor(bucket) ?? 0 };
          });
          seriesMap[sv || "(none)"] = { name: sv || "(none)", color: seriesColor(hashColor(sv || "(none)")), points: pts };
        }
      } else if (useOptions) {
        seriesMap = {};
        for (const opt of stackOptions) {
          const pts = finalLabels.map((xl) => {
            const bucket = working.filter((r) => {
              if (labelFor(r) !== xl) return false;
              const matched = resolveOptionValue(
                stackCol!,
                getCellValue(r.id, stackCol!.id, cellValues),
              );
              return matched?.id === opt.id || matched?.label === opt.label;
            });
            return { label: xl, value: metricFor(bucket) ?? 0 };
          });
          const optColor =
            opt.color ??
            DEFAULT_COLORS[opt.label] ??
            cfg.seriesColors?.[opt.label] ??
            seriesColor(hashColor(opt.label));
          seriesMap[opt.label] = {
            name: opt.label,
            color: optColor,
            points: pts,
          };
        }
      } else {
        const isPie = cfg.chartType === "pie" || cfg.chartType === "donut";
        const pts = finalLabels.map((xl) => {
          const bucket = working.filter((r) => labelFor(r) === xl);
          const customColor = isPie ? (cfg.seriesColors?.[xl] ?? seriesColor(hashColor(xl))) : undefined;
          return { label: xl, value: metricFor(bucket) ?? 0, color: customColor };
        });
        seriesMap = { _main: { name: cfg.yAxisMode === "count" ? "Count" : cfg.yAxisColumnId, color: seriesColor(0), points: pts } };
      }

      let seriesArr = Object.values(seriesMap);

      if (cfg.showCumulative) {
        seriesArr.forEach((s) => {
          let running = 0;
          s.points.forEach((p) => {
            running += p.value;
            p.value = running;
          });
        });
      }

      if (cfg.showOnlyTopBottom) {
        const totals = seriesArr.map((s) => s.points.reduce((a, p) => a + p.value, 0));
        const ranked = seriesArr.map((s, i) => ({ s, total: totals[i] })).sort((a, b) => b.total - a.total);
        const keep = Math.max(1, Math.min(5, ranked.length));
        seriesArr = ranked.slice(0, keep).map((r) => r.s);
      }

      // Sort
      if (cfg.sortBy) {
        const single = seriesArr[0]?.points ?? [];
        const sortedIdx = single
          .map((p, i) => ({ p, i }))
          .sort((a, b) =>
            cfg.sortBy === "y_asc"
              ? a.p.value - b.p.value
              : cfg.sortBy === "y_desc"
              ? b.p.value - a.p.value
              : cfg.sortBy === "label_asc"
              ? String(a.p.label).localeCompare(String(b.p.label))
              : String(b.p.label).localeCompare(String(a.p.label)),
          )
          .map((r) => r.i);
        finalLabels = sortedIdx.map((i) => labels[i]);
        seriesArr = seriesArr.map((s) => ({
          ...s,
          points: s.points.map((_, i) => s.points[sortedIdx[i]]).filter(Boolean),
        }));
      }

      return { series: seriesArr, xLabels: finalLabels };
    }, [
      cfg,
      columns,
      groups,
      records,
      cellValues,
      filters,
      effectiveYAxisMode,
      effectiveYAxisColumnId,
      xAxisColumnId,
      stackByColumnId,
      clientAliases,
      roles,
    ]);

    const stacked = Boolean(stackByColumnId);
    const clickTarget = xAxisColumnId;

    return (
      <div
        className="h-full w-full min-w-0 overflow-hidden"
        ref={containerRef}
        data-export-series={xLabels.length > 0 ? JSON.stringify({ xLabels, series }) : undefined}
      >
        {unmappedRole ? (
          <MapColumnPrompt
            roleLabel={ROLE_LABELS[unmappedRole]}
            onMapColumn={() => onMapColumn?.(unmappedRole)}
          />
        ) : xLabels.length === 0 ? (
          <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
            Select an X-axis column with data to render the chart.
          </div>
        ) : (
          <RenderChart
            type={cfg.chartType}
            series={series}
            xLabels={xLabels}
            showLegend={true}
            showLabels={cfg.showLabels ?? true}
            showGrid={cfg.showGrid ?? true}
            stacked={stacked}
            benchmarkLines={cfg.benchmarkLines ?? []}
            showValueAs={cfg.showValueAs ?? "percent"}
            showCumulative={cfg.showCumulative ?? false}
            onLabelClick={
              onCategoryClick && clickTarget ? (label: string) => onCategoryClick(clickTarget, label) : undefined
            }
            width={containerSize.w || 600}
            height={containerSize.h || Math.max(220, 60 + xLabels.length * 22)}
          />
        )}
      </div>
    );
  },
);
ChartWidgetContent.displayName = "ChartWidgetContent";

/**
 * Y-axis values arrive as numbers, but boards often store counts as text
 * ("104 img", "41+15"), so fall back to the loose-number parser.
 */
function getNumeric(record: { id: string }, columnId: string, cellValues: Map<string, ColumnValue>): number | null {
  if (!columnId) return null;
  if (columnId === RECORD_TITLE_COLUMN_ID) return null;
  return parseLooseNumber(getCellValue(record.id, columnId, cellValues));
}

function getColumnValue(record: { id: string; title: string }, columnId: string, cellValues: Map<string, ColumnValue>): string {
  if (columnId === RECORD_TITLE_COLUMN_ID) return record.title || "";
  const v = getCellValue(record.id, columnId, cellValues);
  return v === null || v === undefined ? "" : String(v);
}

// ── Settings Panel (§6) ─────────────────────────────────────

const SORT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "y_asc", label: "Value ascending" },
  { value: "y_desc", label: "Value descending" },
  { value: "label_asc", label: "Label A→Z" },
  { value: "label_desc", label: "Label Z→A" },
];

interface ChartWidgetSettingsProps {
  config: ChartWidgetConfig;
  columns: ColumnDefinition[];
  groups: BoardGroup[];
  records: BoardRecord[];
  cellValues: Map<string, ColumnValue>;
  boardName: string;
  onChange: (config: Partial<ChartWidgetConfig>) => void;
}

const PIE_COLORS = [
  "hsl(var(--chart-1, 220 70% 50%))",
  "hsl(var(--chart-2, 160 60% 45%))",
  "hsl(var(--chart-3, 30 80% 55%))",
  "hsl(var(--chart-4, 280 65% 60%))",
  "hsl(var(--chart-5, 340 75% 55%))",
  "#22c55e",
  "#3b82f6",
  "#f97316",
  "#a855f7",
  "#ef4444",
];

export const ChartWidgetSettings = memo(
  ({ config, columns, groups, records, cellValues, boardName, onChange }: ChartWidgetSettingsProps) => {
    const isPie = config.chartType === "pie" || config.chartType === "donut";

    const [expanded, setExpanded] = useState<
      "type" | "xaxis" | "stack" | "yaxis" | "labels" | "values" | "customize" | "benchmark" | "groups" | "show" | null
    >("type");
    const toggle = (s: Exclude<NonNullable<typeof expanded>, null>) =>
      setExpanded((p) => (p === s ? null : s));

    const numericColumns = columns.filter((c) => NUMERIC_TYPES.includes(c.type));
    const recordTitleColumn = createRecordTitleColumn();
    const allColumnsWithTitle = [recordTitleColumn, ...columns];
    const stackByWithTitle = allColumnsWithTitle.filter((c) => TEXT_TYPES.includes(c.type) || OPTION_TYPES.includes(c.type));

    const handleGroupFilterChange = (next: DashboardWidgetGroupFilter) => onChange({ groups: next });

    const [editOpen, setEditOpen] = useState(false);
    const [editLabels, setEditLabels] = useState<Array<{ id: string; name: string; color: string }>>([]);

    const openLabelEditor = useCallback(() => {
      const labelCol = columns.find((c) => c.id === config.xAxisColumnId);
      let labels: Array<{ id: string; name: string; color: string }> = [];

      if (labelCol) {
        if (OPTION_TYPES.includes(labelCol.type)) {
          const opts = getColumnOptions(labelCol);
          labels = opts.map((o, i) => ({
            id: o.id,
            name: config.seriesLabelOverrides?.[o.label] ?? o.label,
            color: config.seriesColors?.[o.label] ?? PIE_COLORS[i % PIE_COLORS.length],
          }));
        } else {
          const distinct = distinctInOrder(
            records
              .map((r) => {
                const v = getCellValue(r.id, labelCol.id, cellValues);
                return v === null || v === undefined ? "" : String(v);
              })
              .filter((v) => v !== ""),
          );
          labels = distinct.map((d, i) => ({
            id: d,
            name: config.seriesLabelOverrides?.[d] ?? d,
            color: config.seriesColors?.[d] ?? PIE_COLORS[i % PIE_COLORS.length],
          }));
        }
      }

      setEditLabels(labels);
      setEditOpen(true);
    }, [config.xAxisColumnId, config.seriesLabelOverrides, config.seriesColors, columns, records, cellValues]);

    const saveLabelEditor = useCallback(() => {
      const colors: Record<string, string> = {};
      const overrides: Record<string, string> = {};
      editLabels.forEach((l) => {
        colors[l.name] = l.color;
        if (l.name !== l.id) overrides[l.id] = l.name;
      });
      onChange({ seriesColors: colors, seriesLabelOverrides: overrides });
      setEditOpen(false);
    }, [editLabels, onChange]);

    const moveLabel = useCallback((index: number, direction: -1 | 1) => {
      setEditLabels((prev) => {
        const next = [...prev];
        const target = index + direction;
        if (target < 0 || target >= next.length) return prev;
        [next[index], next[target]] = [next[target], next[index]];
        return next;
      });
    }, []);

    return (
      <div className="flex h-full flex-col">
        <SectionHeader title="Chart type" expanded={expanded === "type"} onClick={() => toggle("type")} />
        {expanded === "type" && (
          <div className="px-4 pb-3">
            <ChartTypePicker
              value={config.chartType}
              onChange={(ct) => onChange({ chartType: ct })}
            />
            <p className="mt-2 text-sm text-muted-foreground">
              Selected: {config.chartType}
            </p>
          </div>
        )}

        {isPie ? (
          <>
            <SectionHeader title="Labels" expanded={expanded === "labels"} onClick={() => toggle("labels")} />
            {expanded === "labels" && (
              <div className="px-4 pb-3 space-y-2">
                <p className="text-sm font-medium text-muted-foreground">{boardName || "Table"}</p>
                <SearchableColumnSelect
                  columns={allColumnsWithTitle}
                  value={config.xAxisColumnId}
                  placeholder="Select column"
                  onChange={(c) => onChange({ xAxisColumnId: c })}
                />
                <p className="mt-1 text-sm text-muted-foreground">
                  Select the column whose values become pie slice labels.
                </p>
              </div>
            )}

            <SectionHeader title="Values" expanded={expanded === "values"} onClick={() => toggle("values")} />
            {expanded === "values" && (
              <div className="px-4 pb-3 space-y-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 w-full justify-between text-sm">
                      {config.yAxisMode === "count" ? "Count items" : columns.find((c) => c.id === config.yAxisColumnId)?.label ?? "Select column"}
                      <ChevronDown className="ml-1 size-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-52">
                    <DropdownMenuItem
                      className="text-sm"
                      onSelect={() => onChange({ yAxisMode: "count", yAxisColumnId: "" })}
                    >
                      Count items
                      {config.yAxisMode === "count" && <span className="ml-auto">✓</span>}
                    </DropdownMenuItem>
                    {numericColumns.length === 0 ? (
                      <DropdownMenuItem disabled className="text-sm">No numeric columns</DropdownMenuItem>
                    ) : (
                      numericColumns.map((col) => (
                        <DropdownMenuItem
                          key={col.id}
                          className="text-sm"
                          onSelect={() => onChange({ yAxisMode: "column", yAxisColumnId: col.id })}
                        >
                          {col.label}
                          {config.yAxisMode === "column" && config.yAxisColumnId === col.id && <span className="ml-auto">✓</span>}
                        </DropdownMenuItem>
                      ))
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>

                {config.yAxisMode === "column" && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Calculation</span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-7 text-sm">
                          {config.calculation ?? "sum"}
                          <ChevronDown className="ml-1 size-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        {["sum", "average", "median", "min", "max"].map((c) => (
                          <DropdownMenuItem
                            key={c}
                            className="text-sm"
                            onSelect={() => onChange({ calculation: c as ChartWidgetConfig["calculation"] })}
                          >
                            {c}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
              </div>
            )}

            <SectionHeader title="Customize" expanded={expanded === "customize"} onClick={() => toggle("customize")} />
            {expanded === "customize" && (
              <div className="px-4 pb-3 space-y-3">
                <button
                  type="button"
                  onClick={openLabelEditor}
                  className="w-full rounded-md border border-border bg-background text-left hover:bg-muted transition-colors"
                >
                  <div className="px-3 py-2 border-b border-border">
                    <span className="text-sm font-medium">Labels</span>
                  </div>
                  <div className="p-2 flex items-center gap-1 text-sm text-muted-foreground">
                    <Edit3 className="size-3" />
                    Edit color, name and order
                  </div>
                </button>

                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium">Show value as</span>
                    <InfoTooltip content="Format the slice label and legend value as a raw count or as a percentage of the total." />
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 w-full justify-between text-sm">
                        {(config.showValueAs ?? "percent") === "percent" ? "Percent (%)" : "Value"}
                        <ChevronDown className="ml-1 size-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-44">
                      <DropdownMenuItem
                        className="text-sm"
                        onSelect={() => onChange({ showValueAs: "percent" })}
                      >
                        Percent (%)
                        {(config.showValueAs ?? "percent") === "percent" && <span className="ml-auto">✓</span>}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-sm"
                        onSelect={() => onChange({ showValueAs: "value" })}
                      >
                        Value
                        {config.showValueAs === "value" && <span className="ml-auto">✓</span>}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium">Sort by</span>
                  <InfoTooltip content="Sort categories by value or label (ascending or descending)." />
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 w-full justify-between text-sm">
                      {SORT_OPTIONS.find((s) => s.value === config.sortBy)?.label ?? "Value descending"}
                      <ChevronDown className="ml-1 size-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-44">
                    {SORT_OPTIONS.map((s) => (
                      <DropdownMenuItem
                        key={s.value}
                        className="text-sm"
                        onSelect={() => onChange({ sortBy: s.value as ChartWidgetConfig["sortBy"] })}
                      >
                        {s.label}
                        {config.sortBy === s.value && <span className="ml-auto">✓</span>}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                <StretchCheckbox
                  label="Show only top/bottom items"
                  checked={config.showOnlyTopBottom ?? false}
                  onChange={(c) => onChange({ showOnlyTopBottom: c })}
                />
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={config.showEmptyValues ?? false}
                      onChange={(e) => onChange({ showEmptyValues: e.target.checked })}
                      className="size-3.5 cursor-pointer rounded border border-input text-primary accent-primary"
                    />
                    <span>Show empty values</span>
                  </label>
                  <InfoTooltip content="Display categories with zero value." />
                </div>
              </div>
            )}

            <SectionHeader title="Groups" expanded={expanded === "groups"} onClick={() => toggle("groups")} />
            {expanded === "groups" && (
              <div className="py-2">
                <GroupsSection groups={groups} value={config.groups ?? { all: true, top: true, ids: [] }} onChange={handleGroupFilterChange} />
              </div>
            )}

            <SectionHeader title="Choose which columns to show" expanded={expanded === "show"} onClick={() => toggle("show")} />
            {expanded === "show" && (
              <div className="py-2">
                <ColumnChecklistSection columns={allColumnsWithTitle} value={config.visibleColumns ?? []} onChange={(next) => onChange({ visibleColumns: next })} />
              </div>
            )}
          </>
        ) : (
          <>
            <SectionHeader title="X-axis" expanded={expanded === "xaxis"} onClick={() => toggle("xaxis")} />
            {expanded === "xaxis" && (
              <div className="px-4 pb-3">
                <SearchableColumnSelect
                  columns={allColumnsWithTitle}
                  value={config.xAxisColumnId}
                  placeholder="Select column"
                  onChange={(c) => onChange({ xAxisColumnId: c })}
                />
                <p className="mt-1 text-sm text-muted-foreground">
                  Categories are plotted along the horizontal axis.
                </p>
              </div>
            )}

            <SectionHeader title="Stack by" expanded={expanded === "stack"} onClick={() => toggle("stack")} />
            {expanded === "stack" && (
              <div className="px-4 pb-3">
                <SearchableColumnSelect
                  columns={stackByWithTitle}
                  value={config.stackByColumnId}
                  placeholder="None"
                  includeBlank
                  blankLabel="None"
                  onChange={(c) => onChange({ stackByColumnId: c })}
                />
                <p className="mt-1 text-sm text-muted-foreground">
                  Sub-group values within each X-axis category.
                </p>
              </div>
            )}

            <SectionHeader title="Y-axis" expanded={expanded === "yaxis"} onClick={() => toggle("yaxis")} />
            {expanded === "yaxis" && (
              <div className="px-4 pb-3 space-y-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 w-full justify-between text-sm">
                      {config.yAxisMode === "count" ? "Count items" : columns.find((c) => c.id === config.yAxisColumnId)?.label ?? "Select column"}
                      <ChevronDown className="ml-1 size-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-52">
                    <DropdownMenuItem
                      className="text-sm"
                      onSelect={() => onChange({ yAxisMode: "count", yAxisColumnId: "" })}
                    >
                      Count items
                      {config.yAxisMode === "count" && <span className="ml-auto">✓</span>}
                    </DropdownMenuItem>
                    {numericColumns.length === 0 ? (
                      <DropdownMenuItem disabled className="text-sm">No numeric columns</DropdownMenuItem>
                    ) : (
                      numericColumns.map((col) => (
                        <DropdownMenuItem
                          key={col.id}
                          className="text-sm"
                          onSelect={() => onChange({ yAxisMode: "column", yAxisColumnId: col.id })}
                        >
                          {col.label}
                          {config.yAxisMode === "column" && config.yAxisColumnId === col.id && <span className="ml-auto">✓</span>}
                        </DropdownMenuItem>
                      ))
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>

                {config.yAxisMode === "column" && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Calculation</span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-7 text-sm">
                          {config.calculation ?? "sum"}
                          <ChevronDown className="ml-1 size-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        {["sum", "average", "median", "min", "max"].map((c) => (
                          <DropdownMenuItem
                            key={c}
                            className="text-sm"
                            onSelect={() => onChange({ calculation: c as ChartWidgetConfig["calculation"] })}
                          >
                            {c}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
              </div>
            )}

            <SectionHeader title="Customize" expanded={expanded === "customize"} onClick={() => toggle("customize")} />
            {expanded === "customize" && (
              <div className="px-4 pb-3 space-y-3">
                <button
                  type="button"
                  onClick={openLabelEditor}
                  className="w-full rounded-md border border-border bg-background text-left hover:bg-muted transition-colors"
                >
                  <div className="px-3 py-2 border-b border-border">
                    <span className="text-sm font-medium">Labels</span>
                  </div>
                  <div className="p-2 flex items-center gap-1 text-sm text-muted-foreground">
                    <Edit3 className="size-3" />
                    Edit color, name and order
                  </div>
                </button>

                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium">Sort by</span>
                  <InfoTooltip content="Sort categories by value or label (ascending or descending)." />
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 w-full justify-between text-sm">
                      {SORT_OPTIONS.find((s) => s.value === config.sortBy)?.label ?? "Value descending"}
                      <ChevronDown className="ml-1 size-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-44">
                    {SORT_OPTIONS.map((s) => (
                      <DropdownMenuItem
                        key={s.value}
                        className="text-sm"
                        onSelect={() => onChange({ sortBy: s.value as ChartWidgetConfig["sortBy"] })}
                      >
                        {s.label}
                        {config.sortBy === s.value && <span className="ml-auto">✓</span>}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                <StretchCheckbox
                  label="Show only top/bottom items"
                  checked={config.showOnlyTopBottom ?? false}
                  onChange={(c) => onChange({ showOnlyTopBottom: c })}
                />
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={config.showCumulative ?? false}
                      onChange={(e) => onChange({ showCumulative: e.target.checked })}
                      className="size-3.5 cursor-pointer rounded border border-input text-primary accent-primary"
                    />
                    <span>Show cumulative data</span>
                  </label>
                  <InfoTooltip content="Running total of values across categories — for Pareto-style breakdowns." />
                </div>
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={config.showEmptyValues ?? false}
                      onChange={(e) => onChange({ showEmptyValues: e.target.checked })}
                      className="size-3.5 cursor-pointer rounded border border-input text-primary accent-primary"
                    />
                    <span>Show empty values</span>
                  </label>
                  <InfoTooltip content="Display categories with zero value." />
                </div>
              </div>
            )}

            <SectionHeader title="Benchmark lines" expanded={expanded === "benchmark"} onClick={() => toggle("benchmark")} />
            {expanded === "benchmark" && (
              <div className="py-1">
                <BenchmarkLinesSection
                  value={config.benchmarkLines ?? []}
                  onChange={(next) => onChange({ benchmarkLines: next })}
                />
              </div>
            )}

            <SectionHeader title="Groups" expanded={expanded === "groups"} onClick={() => toggle("groups")} />
            {expanded === "groups" && (
              <div className="py-2">
                <GroupsSection groups={groups} value={config.groups ?? { all: true, top: true, ids: [] }} onChange={handleGroupFilterChange} />
              </div>
            )}

            <SectionHeader title="Choose which columns to show" expanded={expanded === "show"} onClick={() => toggle("show")} />
            {expanded === "show" && (
              <div className="py-2">
                <ColumnChecklistSection columns={allColumnsWithTitle} value={config.visibleColumns ?? []} onChange={(next) => onChange({ visibleColumns: next })} />
              </div>
            )}
          </>
        )}
        <LabelEditorDialog
          open={editOpen}
          labels={editLabels}
          onChange={setEditLabels}
          onClose={() => setEditOpen(false)}
        />
      </div>
    );
  },
);
ChartWidgetSettings.displayName = "ChartWidgetSettings";

function LabelEditorDialog({ open, labels, onChange, onClose }: {
  open: boolean;
  labels: Array<{ id: string; name: string; color: string }>;
  onChange: (labels: Array<{ id: string; name: string; color: string }>) => void;
  onClose: () => void;
}) {
  const [local, setLocal] = useState(labels);

  useEffect(() => {
    setLocal(labels);
  }, [labels]);

  const save = () => { onChange(local); onClose(); };
  const cancel = () => { setLocal(labels); onClose(); };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) cancel(); }}>
      <DialogContent className="max-h-[80vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit labels</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {local.length === 0 && (
            <p className="text-sm text-muted-foreground">No labels available. Select a label column first.</p>
          )}
          {local.map((l, i) => (
            <div key={l.id} className="flex items-center gap-2 rounded-md border border-border p-2">
              <GripVertical className="size-4 text-muted-foreground shrink-0" />
              <LabelColorSwatch value={l.color} onChange={(color) => {
                const next = [...local];
                next[i] = { ...next[i], color };
                setLocal(next);
              }} />
              <Input
                value={l.name}
                onChange={(e) => {
                  const next = [...local];
                  next[i] = { ...next[i], name: e.target.value };
                  setLocal(next);
                }}
                className="h-7 text-sm flex-1"
              />
              <div className="flex flex-col gap-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  onClick={() => moveLabel(local, i, -1, setLocal)}
                  disabled={i === 0}
                >
                  <GripVertical className="size-3 rotate-180" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  onClick={() => moveLabel(local, i, 1, setLocal)}
                  disabled={i === local.length - 1}
                >
                  <GripVertical className="size-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={cancel}>Cancel</Button>
          <Button size="sm" onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function moveLabel(labels: Array<{ id: string; name: string; color: string }>, index: number, direction: -1 | 1, set: (next: Array<{ id: string; name: string; color: string }>) => void) {
  const next = [...labels];
  const target = index + direction;
  if (target < 0 || target >= next.length) return;
  [next[index], next[target]] = [next[target], next[index]];
  set(next);
}
