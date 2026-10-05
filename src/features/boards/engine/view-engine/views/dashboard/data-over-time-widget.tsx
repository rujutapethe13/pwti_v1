"use client";

/**
 * Dashboard — Data-over-time Widget
 *
 * §7 Settings:
 *   7.1 Time dimension  (date/timeline column)
 *   7.2 Granularity     (Day / Week / Month / Quarter / Year)
 *   7.3 Aggregation     (Count | numeric column + calculation)
 *   7.4 Group by        (Series — option/text column)
 *   7.5 Chart type      (line / area / bar / column)
 *   7.6 Customize       (cumulative / labels / grid / sort / top-bottom)
 *   7.7 Benchmark lines
 *   7.8 Groups
 *   7.9 Columns
 *   7.10 Full-size
 */

import { memo, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { format, startOfDay, startOfWeek, startOfMonth, startOfQuarter, startOfYear, addDays } from "date-fns";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ColumnDefinition, ColumnValue } from "../../../types";
import type {
  DashboardWidgetGroupFilter,
  BoardGroup,
  DashboardFilterCondition,
  DataOverTimeValueMode,
  DataOverTimeWidgetConfig,
  FilterableRecord,
} from "./dashboard-types";
  import {
    getDateColumnIds,
    getNumericColumnIds,
    getColumnOptions,
    applyFilters,
    filterRecordsByGroups,
    resolveGroups,
    getCellValue,
    resolveOptionValue,
    aggregate,
    OPTION_TYPES,
    TEXT_TYPES,
    createRecordTitleColumn,
  } from "./dashboard-types";
import { DEFAULT_COLORS } from "@/features/boards/engine/components/cell-options-popup";
import { RenderChart, seriesColor, hashColor, type SeriesData } from "./chart-svg";
import {
  SectionHeader,
  SearchableColumnSelect,
  InfoTooltip,
  StretchCheckbox,
  useElementSize,
} from "./dashboard-shared";
import { GroupsSection, ColumnChecklistSection, BenchmarkLinesSection } from "./dashboard-sections";
import {
  MEASURE_ROLE,
  parseFlexibleDate,
  parseLooseNumber,
  type DashboardColumnRoles,
  type DashboardMeasure,
  type DashboardRoleKey,
} from "./column-roles";
import { MapColumnPrompt, ROLE_LABELS } from "./role-widgets";

export interface DataOverTimeContentProps {
  config: Record<string, unknown>;
  columns: ColumnDefinition[];
  groups: BoardGroup[];
  records: Array<FilterableRecord & { title: string; groupId?: string | null }>;
  cellValues: Map<string, ColumnValue>;
  filters: DashboardFilterCondition[];
  /** Optional — widgets without it behave exactly as before. */
  measure?: DashboardMeasure;
  roles?: DashboardColumnRoles;
  /** Opens "Map your columns", optionally focused on one role. */
  onMapColumn?: (role: DashboardRoleKey) => void;
}

/**
 * Timestamps may be real dates, ISO strings, or day-first text ("29-10-2025").
 * parseFlexibleDate reads day-first formats explicitly and returns null for
 * impossible values rather than guessing.
 */
function parseDate(v: unknown): Date | null {
  return parseFlexibleDate(v);
}

function getColumnValue(record: { id: string; title: string }, columnId: string, cellValues: Map<string, ColumnValue>): string {
  if (columnId === "__record_title") return record.title || "";
  const v = getCellValue(record.id, columnId, cellValues);
  return v === null || v === undefined ? "" : String(v);
}

interface GranularGroup {
  value: "day" | "week" | "month" | "quarter" | "year";
  label: string;
  start: (d: Date) => Date;
  step: (d: Date) => Date;
  fmt: string;
}

const GRANULARITY: GranularGroup[] = [
  { value: "day", label: "Day", start: startOfDay, step: (d) => addDays(d, 1), fmt: "MMM d" },
  { value: "week", label: "Week", start: startOfWeek, step: (d) => addDays(d, 7), fmt: "MMM d" },
  { value: "month", label: "Month", start: startOfMonth, step: (d) => addDays(startOfMonth(d), 31), fmt: "MMM yyyy" },
  { value: "quarter", label: "Quarter", start: startOfQuarter, step: (d) => addDays(startOfQuarter(d), 92), fmt: "MMM yyyy" },
  { value: "year", label: "Year", start: startOfYear, step: (d) => addDays(startOfYear(d), 366), fmt: "yyyy" },
];

function bucketsFor(d0: Date, d1: Date, gran: GranularGroup): Date[] {
  const buckets: Date[] = [];
  let cur = gran.start(d0);
  const last = gran.start(d1);
  while (cur <= last) {
    buckets.push(new Date(cur));
    cur = gran.step(cur);
  }
  if (buckets.length === 0) buckets.push(gran.start(d0));
  return buckets;
}

/** Counts may be stored as text ("104 img"); fall back to the loose parser. */
function getNumeric(record: { id: string }, columnId: string, cellValues: Map<string, ColumnValue>): number | null {
  if (!columnId) return null;
  return parseLooseNumber(getCellValue(record.id, columnId, cellValues));
}

function distinctInOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const s = v === null || v === undefined ? "(none)" : String(v);
    if (!seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

export const DataOverTimeWidgetContent = memo(
  ({ config, columns, groups, records, cellValues, filters, measure, roles, onMapColumn }: DataOverTimeContentProps) => {
    const cfg = config as unknown as DataOverTimeWidgetConfig;
    const [containerRef, containerSize] = useElementSize();

    // Role-bound time axis resolves live from the mapping so re-mapping a date
    // column repoints the trend; the stored id stays the fallback.
    const timeColumnId = cfg.timeRole ? (roles?.[cfg.timeRole] ?? cfg.timeColumnId) : cfg.timeColumnId;
    const unmappedRole = cfg.timeRole && !timeColumnId ? cfg.timeRole : null;

    // Measure switch: widgets the default template marked useMeasure sum the
    // measure's role column instead of counting rows.
    const measureRole =
      (cfg as { useMeasure?: boolean }).useMeasure ? MEASURE_ROLE[measure ?? "jobs"] : null;
    const measureColumnId = measureRole && roles ? (roles[measureRole] ?? "") : "";
    const effectiveValueMode: DataOverTimeValueMode =
      (cfg as { useMeasure?: boolean }).useMeasure && measureColumnId ? "column" : cfg.valueMode;
    const effectiveValueColumnId = (cfg as { useMeasure?: boolean }).useMeasure
      ? measureColumnId
      : cfg.valueColumnId;

    const { series, xLabels } = useMemo(() => {
      const groupFilter = cfg.groups ?? { all: true, top: true, ids: [] };
      let working = filterRecordsByGroups(records, resolveGroups(groups as BoardGroup[]), groupFilter);
      working = applyFilters(working, columns, cellValues, filters);

      const timeCol = timeColumnId ? columns.find((c) => c.id === timeColumnId) : undefined;
      if (!timeCol) return { series: [], xLabels: [] };

      const dated = working
        .map((r) => ({ r, d: parseDate(getCellValue(r.id, timeCol.id, cellValues)) }))
        .filter((v): v is { r: typeof working[number]; d: Date } => v.d !== null);

      if (dated.length === 0) return { series: [], xLabels: [] };

      const gran = GRANULARITY.find((g) => g.value === cfg.granularity) ?? GRANULARITY[2];
      const d0 = dated.reduce((min, v) => (v.d < min ? v.d : min), dated[0].d);
      const d1 = dated.reduce((max, v) => (v.d > max ? v.d : max), dated[0].d);
      const bucketDates = bucketsFor(d0, d1, gran);

      const bucketKey = (d: Date): string => format(gran.start(d), "yyyy-MM-dd");
      const labelFor = (d: Date): string => format(d, gran.fmt);
      const xLabels = bucketDates.map((d) => labelFor(d));

      const valueOf = (r: typeof working[number]): number | null => {
        if (effectiveValueMode === "count") return 1;
        return getNumeric(r, effectiveValueColumnId ?? "", cellValues);
      };

      const groupCol = cfg.groupByColumnId ? columns.find((c) => c.id === cfg.groupByColumnId) : undefined;
      const groupOptions = groupCol ? getColumnOptions(groupCol) : [];
      const useOptions = groupCol && groupOptions.length > 0;

      const seriesArr: SeriesData[] = [];

      if (groupCol && useOptions) {
        for (const opt of groupOptions) {
          const pts = bucketDates.map((bd) => {
            const bucket = dated.filter(
              (v) => {
                if (bucketKey(v.d) !== format(bd, "yyyy-MM-dd")) return false;
                const matched = resolveOptionValue(
                  groupCol,
                  getCellValue(v.r.id, groupCol.id, cellValues),
                );
                return matched?.id === opt.id || matched?.label === opt.label;
              },
            );
            const vals = bucket.map((v) => valueOf(v.r)).filter((v): v is number => v !== null);
            const agg = aggregate(vals, cfg.calculation ?? "sum", "");
            return { label: labelFor(bd), value: effectiveValueMode === "count" ? agg.count : agg.value ?? 0 };
          });
          const optColor =
            opt.color ??
            DEFAULT_COLORS[opt.label] ??
            cfg.seriesColors?.[opt.label] ??
            seriesColor(hashColor(opt.label));
          seriesArr.push({
            name: opt.label,
            color: optColor,
            points: pts,
          });
        }
      } else if (groupCol) {
        const groupValues = distinctInOrder(
          dated.map((v) => getColumnValue(v.r, groupCol.id, cellValues)),
        );
        for (const gv of groupValues) {
          const pts = bucketDates.map((bd) => {
            const bucket = dated.filter(
              (v) =>
                bucketKey(v.d) === format(bd, "yyyy-MM-dd") &&
                getColumnValue(v.r, groupCol.id, cellValues) === gv,
            );
            const vals = bucket.map((v) => valueOf(v.r)).filter((v): v is number => v !== null);
            const agg = aggregate(vals, cfg.calculation ?? "sum", "");
            return { label: labelFor(bd), value: effectiveValueMode === "count" ? agg.count : agg.value ?? 0 };
          });
          seriesArr.push({
            name: gv || "(none)",
            color: cfg.seriesColors?.[gv || "(none)"] ?? seriesColor(hashColor(gv || "(none)")),
            points: pts,
          });
        }
      } else {
        const pts = bucketDates.map((bd) => {
          const bucket = dated.filter((v) => bucketKey(v.d) === format(bd, "yyyy-MM-dd"));
          const vals = bucket.map((v) => valueOf(v.r)).filter((v): v is number => v !== null);
          const agg = aggregate(vals, cfg.calculation ?? "sum", "");
          return { label: labelFor(bd), value: effectiveValueMode === "count" ? agg.count : agg.value ?? 0 };
        });
        seriesArr.push({
          name: effectiveValueMode === "count" ? "Count" : effectiveValueColumnId || "Value",
          color: seriesColor(0),
          points: pts,
        });
      }

      if (cfg.showCumulative) {
        seriesArr.forEach((s) => {
          let running = 0;
          s.points.forEach((p) => {
            running += p.value;
            p.value = running;
          });
        });
      }

      return { series: seriesArr, xLabels };
    }, [
      cfg,
      columns,
      groups,
      records,
      cellValues,
      filters,
      effectiveValueMode,
      effectiveValueColumnId,
      timeColumnId,
    ]);

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
            Select a time dimension with date values to render the chart.
          </div>
        ) : (
          <RenderChart
            type={cfg.chartType}
            series={series}
            xLabels={xLabels}
            showLegend={true}
            showLabels={cfg.showLabels ?? false}
            showGrid={cfg.showGrid ?? true}
            stacked={cfg.stacked ?? false}
            benchmarkLines={cfg.benchmarkLines ?? []}
            width={containerSize.w || 600}
            height={containerSize.h || Math.max(220, 44 + xLabels.length * 18)}
          />
        )}
      </div>
    );
  },
);
DataOverTimeWidgetContent.displayName = "DataOverTimeWidgetContent";

// ── Settings Panel (§7) ─────────────────────────────────────

const CHART_TYPE_CHOICES = ["line", "area", "bar", "column"] as const;
const SORT_OPTIONS: Array<{ value: DataOverTimeWidgetConfig["sortBy"]; label: string }> = [
  { value: "asc", label: "Chronological" },
  { value: "desc", label: "Reverse chronological" },
];

interface DataOverTimeSettingsProps {
  config: DataOverTimeWidgetConfig;
  columns: ColumnDefinition[];
  groups: BoardGroup[];
  onChange: (config: Partial<DataOverTimeWidgetConfig>) => void;
}

export const DataOverTimeWidgetSettings = memo(
  ({ config, columns, groups, onChange }: DataOverTimeSettingsProps) => {
    const [expanded, setExpanded] = useState<
      "time" | "aggregation" | "group" | "type" | "customize" | "benchmark" | "groups" | "show" | null
    >("time");
    const toggle = (s: Exclude<NonNullable<typeof expanded>, null>) =>
      setExpanded((p) => (p === s ? null : s));

    const dateColIds = getDateColumnIds(columns);
    const dateCols = columns.filter((c) => dateColIds.includes(c.id));
    const recordTitleColumn = createRecordTitleColumn();
    const allColumnsWithTitle = [recordTitleColumn, ...columns];
    const optionGroupCols = allColumnsWithTitle.filter((c) => OPTION_TYPES.includes(c.type) || TEXT_TYPES.includes(c.type));
    const numericColumns = columns.filter((c) => getNumericColumnIds(columns).includes(c.id));

    const handleGroupFilterChange = (next: DashboardWidgetGroupFilter) => onChange({ groups: next });

    return (
      <div className="flex h-full flex-col">
        <SectionHeader title="Time dimension" expanded={expanded === "time"} onClick={() => toggle("time")} />
        {expanded === "time" && (
          <div className="px-4 pb-3 space-y-2">
            <SearchableColumnSelect
              columns={dateCols}
              value={config.timeColumnId}
              placeholder={dateCols.length ? "Select date column" : "No date columns available"}
              onChange={(c) => onChange({ timeColumnId: c })}
            />
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium">Granularity</span>
              <InfoTooltip content="Group time values into Day/Week/Month/Quarter/Year buckets." />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 w-full justify-between text-sm">
                  {GRANULARITY.find((g) => g.value === config.granularity)?.label ?? "Month"}
                  <ChevronDown className="ml-1 size-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-44">
                {GRANULARITY.map((g) => (
                  <DropdownMenuItem
                    key={g.value}
                    className="text-sm"
                    onSelect={() => onChange({ granularity: g.value })}
                  >
                    {g.label}
                    {config.granularity === g.value && <span className="ml-auto">✓</span>}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        <SectionHeader title="Aggregation" expanded={expanded === "aggregation"} onClick={() => toggle("aggregation")} />
        {expanded === "aggregation" && (
          <div className="px-4 pb-3 space-y-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 w-full justify-between text-sm">
                  {config.valueMode === "count" ? "Count items" : columns.find((c) => c.id === config.valueColumnId)?.label ?? "Select column"}
                  <ChevronDown className="ml-1 size-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-52">
                <DropdownMenuItem
                  className="text-sm"
                  onSelect={() => onChange({ valueMode: "count", valueColumnId: "" })}
                >
                  Count items
                  {config.valueMode === "count" && <span className="ml-auto">✓</span>}
                </DropdownMenuItem>
                {numericColumns.length === 0 ? (
                  <DropdownMenuItem disabled className="text-sm">No numeric columns</DropdownMenuItem>
                ) : (
                  numericColumns.map((col) => (
                    <DropdownMenuItem
                      key={col.id}
                      className="text-sm"
                      onSelect={() => onChange({ valueMode: "column", valueColumnId: col.id })}
                    >
                      {col.label}
                      {config.valueMode === "column" && config.valueColumnId === col.id && <span className="ml-auto">✓</span>}
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {config.valueMode === "column" && (
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
                        onSelect={() => onChange({ calculation: c as DataOverTimeWidgetConfig["calculation"] })}
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

        <SectionHeader title="Group by (Series)" expanded={expanded === "group"} onClick={() => toggle("group")} />
        {expanded === "group" && (
          <div className="px-4 pb-3">
            <SearchableColumnSelect
              columns={optionGroupCols}
              value={config.groupByColumnId}
              placeholder="None"
              includeBlank
              blankLabel="None"
              onChange={(c) => onChange({ groupByColumnId: c })}
            />
            <div className="mt-2 flex items-center gap-1.5">
              <label className="flex items-center gap-1.5 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={config.stacked ?? false}
                  onChange={(e) => onChange({ stacked: e.target.checked })}
                  className="size-3.5 cursor-pointer rounded border border-input text-primary accent-primary"
                />
                <span>Stack series</span>
              </label>
              <InfoTooltip content="Stack values on top of each other within each time bucket." />
            </div>
          </div>
        )}

        <SectionHeader title="Chart type" expanded={expanded === "type"} onClick={() => toggle("type")} />
        {expanded === "type" && (
          <div className="px-4 pb-3">
            <div className="flex gap-1.5 flex-wrap">
              {CHART_TYPE_CHOICES.map((ct) => (
                <button
                  key={ct}
                  onClick={() => onChange({ chartType: ct })}
                  className={`px-2.5 py-1.5 text-sm rounded border ${config.chartType === ct ? "border-primary bg-accent" : "border-input hover:bg-accent"}`}
                >
                  {ct}
                </button>
              ))}
            </div>
          </div>
        )}

        <SectionHeader title="Customize" expanded={expanded === "customize"} onClick={() => toggle("customize")} />
        {expanded === "customize" && (
          <div className="px-4 pb-3 space-y-2">
            <StretchCheckbox
              label="Show labels"
              checked={config.showLabels ?? false}
              onChange={(c) => onChange({ showLabels: c })}
            />
            <StretchCheckbox
              label="Show grid"
              checked={config.showGrid ?? true}
              onChange={(c) => onChange({ showGrid: c })}
            />
            <StretchCheckbox
              label="Show only top/bottom series"
              checked={config.showTopBottomOnly ?? false}
              onChange={(c) => onChange({ showTopBottomOnly: c })}
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
              <InfoTooltip content="Running total of values across time." />
            </div>
            <StretchCheckbox
              label="Show empty values"
              checked={config.showEmptyValues ?? false}
              onChange={(c) => onChange({ showEmptyValues: c })}
            />
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Sort</span>
              <InfoTooltip content="Sort time buckets chronologically or reverse." />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 text-sm">
                    {SORT_OPTIONS.find((s) => s.value === config.sortBy)?.label ?? "Chronological"}
                    <ChevronDown className="ml-1 size-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-44">
                  {SORT_OPTIONS.map((s) => (
                    <DropdownMenuItem
                      key={s.value}
                      className="text-sm"
                      onSelect={() => onChange({ sortBy: s.value })}
                    >
                      {s.label}
                      {config.sortBy === s.value && <span className="ml-auto">✓</span>}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        )}

        <SectionHeader title="Benchmark lines" expanded={expanded === "benchmark"} onClick={() => toggle("benchmark")} />
        {expanded === "benchmark" && (
          <div className="py-1">
            <BenchmarkLinesSection value={config.benchmarkLines ?? []} onChange={(next) => onChange({ benchmarkLines: next })} />
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
      </div>
    );
  },
);
DataOverTimeWidgetSettings.displayName = "DataOverTimeWidgetSettings";
