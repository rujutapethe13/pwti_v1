"use client";

/**
 * Dashboard — Number / KPI Widget
 *
 * §5 Settings panel:
 *   5.1 Number columns  — Count | Columns (items/subitems, numeric column checklist)
 *   5.2 Customize       — Unit (pill) + alignment L/R, Calculation, Decimal places
 *   5.3 Groups          — dynamic board groups (reused)
 *   5.4 Columns         — dynamic column checklist (reused)
 */

import { memo, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ColumnDefinition, ColumnValue } from "../../../types";
import {
  type NumberWidgetConfig,
  type DashboardWidgetGroupFilter,
  type BoardGroup,
  type DashboardFilterCondition,
  getNumericColumnIds,
  aggregate,
  extractNumericValue,
  formatNumber,
  filterRecordsByGroups,
  applyFilters,
  resolveGroups,
  type FilterableRecord,
  createRecordTitleColumn,
} from "./dashboard-types";
import { SectionHeader, PillToggle, StretchCheckbox, InfoTooltip } from "./dashboard-shared";
import {
  GroupsSection,
  ColumnChecklistSection,
} from "./dashboard-sections";

// ═══════════════════════════════════════════════════════════
// CONTENT RENDERER
// ══════════════════════════════════════════════════==========

export interface WidgetContentProps {
  config: Record<string, unknown>;
  columns: ColumnDefinition[];
  groups: BoardGroup[];
  records: Array<FilterableRecord & { title: string; groupId?: string | null }>;
  cellValues: Map<string, ColumnValue>;
  filters: DashboardFilterCondition[];
}

export const NumberWidgetContent = memo(
  ({ config, columns, groups, records, cellValues, filters }: WidgetContentProps) => {
    const cfg = config as unknown as NumberWidgetConfig;
    const numericColumnIds = getNumericColumnIds(columns);

    const value = useMemo(() => {
      // 1. Restrict to selected structural groups.
      const groupFilter = cfg.groups ?? { all: true, top: true, ids: [] };
      let working = filterRecordsByGroups(records, resolveGroups(groups), groupFilter);

      // 2. Apply dashboard / widget filters.
      working = applyFilters(working, columns, cellValues, filters);

      if (cfg.countType === "columns") {
        const cols = (cfg.columnIds ?? []).filter((id) => numericColumnIds.includes(id));
        if (cols.length === 0) return "—";
        const calculation = cfg.calculation ?? "sum";
        let combined: (number | null)[] = [];
        for (const colId of cols) {
          combined = combined.concat(extractNumericValue(working, cellValues, colId));
        }
        const result = aggregate(combined, calculation as never, "");
        return formatNumber(result.value, {
          unit: cfg.unit,
          unitCustom: cfg.unitCustom,
          unitAlign: cfg.unitAlign,
          decimalPlaces: cfg.decimalPlaces,
        });
      }

      // Count mode
      const items = cfg.countOptions?.items ?? true;
      const subitems = cfg.countOptions?.subitems ?? true;
      let counted: typeof working = [];
      if (items && subitems) {
        counted = working;
      } else if (items) {
        counted = working.filter((r) => !r.groupId);
      } else if (subitems) {
        counted = working.filter((r) => r.groupId != null);
      }
      const result = aggregate(counted.map(() => 1), "count", "");
      return formatNumber(result.value, {
        unit: cfg.unit,
        unitCustom: cfg.unitCustom,
        unitAlign: cfg.unitAlign,
        decimalPlaces: cfg.decimalPlaces,
      });
    }, [cfg, columns, groups, records, cellValues, filters, numericColumnIds]);

    const label = cfg.countType === "columns" ? "Number columns" : "Items / Subitems";

    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-center">
        <div className="text-3xl font-bold text-foreground break-all">{value}</div>
        <div className="text-sm uppercase text-muted-foreground">{label}</div>
      </div>
    );
  },
);
NumberWidgetContent.displayName = "NumberWidgetContent";

// ═══════════════════════════════════════════════════════════
// SETTINGS PANEL (§5)
// ══════════════════════════════════════════════════==========

interface NumberWidgetSettingsProps {
  config: NumberWidgetConfig;
  columns: ColumnDefinition[];
  groups: BoardGroup[];
  onChange: (config: Partial<NumberWidgetConfig>) => void;
}

const UNIT_OPTIONS: Array<{ value: NumberWidgetConfig["unit"]; label: string }> = [
  { value: "none", label: "None" },
  { value: "currency", label: "$" },
  { value: "euro", label: "€" },
  { value: "pound", label: "£" },
  { value: "percent", label: "%" },
];

const CALC_OPTIONS: Array<{ value: NumberWidgetConfig["calculation"]; label: string }> = [
  { value: "sum", label: "Sum" },
  { value: "average", label: "Average" },
  { value: "median", label: "Median" },
  { value: "min", label: "Min" },
  { value: "max", label: "Max" },
  { value: "count", label: "Count" },
];

export const NumberWidgetSettings = memo(
  ({ config, columns, groups, onChange }: NumberWidgetSettingsProps) => {
    const [expanded, setExpanded] = useState<"columns" | "customize" | "groups" | "show" | null>("columns");
    const toggle = (section: "columns" | "customize" | "groups" | "show") =>
      setExpanded((prev) => (prev === section ? null : section));

    const numericColumns = columns.filter((c) => getNumericColumnIds(columns).includes(c.id));
    const recordTitleColumn = createRecordTitleColumn();
    const allColumnsWithTitle = [recordTitleColumn, ...columns];

    const isCountMode = config.countType === "count";

    const handleGroupFilterChange = (next: DashboardWidgetGroupFilter) => {
      onChange({ groups: next });
    };

    return (
      <div className="flex h-full flex-col">
        <SectionHeader title="Number columns" expanded={expanded === "columns"} onClick={() => toggle("columns")} />
        {expanded === "columns" && (
          <div className="px-4 pb-4">
            <div className="mb-2 flex items-center gap-1.5">
              <span className="text-sm text-muted-foreground">Count</span>
              <PillToggle
                value={config.countType}
                options={[
                  { value: "count", label: "Count" },
                  { value: "columns", label: "Columns" },
                ]}
                onChange={(v) => onChange({ countType: v, countOptions: { items: true, subitems: true } })}
              />
              <span className="text-sm text-muted-foreground">Columns</span>
            </div>

            {isCountMode ? (
              <div className="space-y-1.5">
                <StretchCheckbox
                  label="Items"
                  checked={config.countOptions.items}
                  onChange={(checked) => onChange({ countOptions: { ...config.countOptions, items: checked } })}
                />
                <StretchCheckbox
                  label="Subitems"
                  checked={config.countOptions.subitems}
                  onChange={(checked) =>
                    onChange({ countOptions: { ...config.countOptions, subitems: checked } })
                  }
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                {numericColumns.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No numeric columns on this board.</p>
                ) : (
                  numericColumns.map((col) => (
                    <StretchCheckbox
                      key={col.id}
                      label={col.label}
                      checked={config.columnIds.includes(col.id)}
                      onChange={(checked) => {
                        const next = checked
                          ? [...new Set([...config.columnIds, col.id])]
                          : config.columnIds.filter((id) => id !== col.id);
                        onChange({ columnIds: next });
                      }}
                    />
                  ))
                )}
              </div>
            )}
          </div>
        )}

        <SectionHeader title="Customize" expanded={expanded === "customize"} onClick={() => toggle("customize")} />
        {expanded === "customize" && (
          <div className="px-4 pb-4 space-y-4">
            {/* Unit selector */}
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Unit</label>
              <div className="flex flex-wrap items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 text-sm">
                      {UNIT_OPTIONS.find((u) => u.value === config.unit)?.label ?? "None"}
                      <ChevronDown className="ml-1 size-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-44">
                    {UNIT_OPTIONS.map((u) => (
                      <DropdownMenuItem
                        key={u.value}
                        className="text-sm"
                        onSelect={() => onChange({ unit: u.value, unitCustom: "" })}
                      >
                        {u.label}
                        {config.unit === u.value && <span className="ml-auto">✓</span>}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                {config.unit === "custom" && (
                  <Input
                    value={config.unitCustom}
                    onChange={(e) => onChange({ unitCustom: e.target.value })}
                    placeholder="Type your own"
                    className="h-8 w-32 text-sm"
                  />
                )}

                <div className="flex items-center gap-1">
                  <span className="text-sm text-muted-foreground">Position</span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 text-sm">
                        {config.unitAlign === "left" ? "Left" : "Right"}
                        <ChevronDown className="ml-1 size-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-32">
                      <DropdownMenuItem
                        className="text-sm"
                        onSelect={() => onChange({ unitAlign: "left" })}
                      >
                        L
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-sm"
                        onSelect={() => onChange({ unitAlign: "right" })}
                      >
                        R
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {/* Calculation */}
              <div className="mt-3">
                <label className="block text-sm font-medium text-muted-foreground mb-1">Calculation</label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 w-full justify-between text-sm">
                      {CALC_OPTIONS.find((c) => c.value === config.calculation)?.label ?? "Count"}
                      <ChevronDown className="size-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-40">
                    {CALC_OPTIONS.map((c) => (
                      <DropdownMenuItem
                        key={c.value}
                        className="text-sm"
                        onSelect={() => onChange({ calculation: c.value })}
                      >
                        {c.label}
                        {config.calculation === c.value && <span className="ml-auto">✓</span>}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Decimal places */}
              <div className="mt-3">
                <label className="flex items-center gap-1.5 text-sm text-muted-foreground mb-1">
                  Decimal places
                  <InfoTooltip content="Automatic picks 0 dp for whole numbers, 2 dp otherwise. .0 and .00 force a specific precision." />
                </label>
                <div className="flex items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 text-sm">
                        {config.decimalPlaces === "auto" ? "Automatic" : `${config.decimalPlaces} dp`}
                        <ChevronDown className="ml-1 size-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-40">
                      <DropdownMenuItem
                        className="text-sm"
                        onSelect={() => onChange({ decimalPlaces: "auto" })}
                      >
                        Automatic
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-sm"
                        onSelect={() => onChange({ decimalPlaces: 0 })}
                      >
                        Manual (.0)
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-sm"
                        onSelect={() => onChange({ decimalPlaces: 2 })}
                      >
                        Manual (.00)
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>
          </div>
        )}

        <SectionHeader title="Groups" expanded={expanded === "groups"} onClick={() => toggle("groups")} />
        {expanded === "groups" && (
          <div className="py-2">
            <GroupsSection groups={groups} value={config.groups ?? { all: true, top: true, ids: [] }} onChange={handleGroupFilterChange} />
          </div>
        )}

        <SectionHeader
          title="Choose which columns to show"
          expanded={expanded === "show"}
          onClick={() => toggle("show")}
        />
        {expanded === "show" && (
          <div className="py-2">
            <ColumnChecklistSection columns={allColumnsWithTitle} value={config.visibleColumns ?? []} onChange={(next) => onChange({ visibleColumns: next })} />
          </div>
        )}
      </div>
    );
  },
);
NumberWidgetSettings.displayName = "NumberWidgetSettings";
