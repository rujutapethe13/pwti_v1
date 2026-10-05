"use client";

/**
 * Dashboard — Shared Settings Sections
 *
 * Sections reused across Number, Chart, and Data-over-Time widget settings:
 *  - §5.3 / §6.7 / §7 Groups       (dynamic board groups)
 *  - §5.4 / §6.8 / §7 Columns      (dynamic column checklist)
 *  - §6.6 Benchmark lines           (repeatable list with color swatches)
 */

import { memo, useCallback } from "react";
import { Plus, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ColumnDefinition } from "../../../types";
import type {
  DashboardWidgetGroupFilter,
  BoardGroup,
  BenchmarkLine,
  ChartTypeKey,
} from "./dashboard-types";
import { resolveGroups, getTopGroup } from "./dashboard-types";
import { ColumnTypeBadge, ColorSwatchPicker } from "./dashboard-shared";

// ═══════════════════════════════════════════════════════════
// GROUPS SECTION (§5.3 / §6.7 / §7)
// ══════════════════════════════════════════════════==========

export interface GroupsSectionProps {
  groups: BoardGroup[];
  value: DashboardWidgetGroupFilter;
  onChange: (value: DashboardWidgetGroupFilter) => void;
}

export const GroupsSection = memo(({ groups, value, onChange }: GroupsSectionProps) => {
  const resolved = resolveGroups(groups);
  const top = getTopGroup(groups);
  const topName = top?.name ?? "Top group";

  const toggleAll = useCallback(
    (checked: boolean) => onChange({ all: checked, top: checked, ids: [] }),
    [onChange],
  );

  const toggleTop = useCallback(
    (checked: boolean) => {
      const ids = checked ? value.ids : value.ids.filter((id) => id !== top!.id);
      onChange({ ...value, top: checked });
      void ids;
    },
    [value, onChange, top],
  );

  const toggleGroup = useCallback(
    (id: string) => {
      const ids = value.ids.includes(id) ? value.ids.filter((g) => g !== id) : [...value.ids, id];
      onChange({ ...value, ids });
    },
    [value, onChange],
  );

  const allChecked = value.all;
  const topChecked = value.top;

  return (
    <div className="px-2">
      <label className="block text-sm font-medium text-muted-foreground mb-1">Groups</label>
      <div className="space-y-1">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={allChecked}
            onChange={(e) => toggleAll(e.target.checked)}
            className="size-3.5 cursor-pointer rounded border border-input text-primary accent-primary"
          />
          <span className="text-sm">All groups</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={topChecked}
            disabled={!top}
            onChange={(e) => toggleTop(e.target.checked)}
            className="size-3.5 cursor-pointer rounded border border-input text-primary accent-primary disabled:cursor-not-allowed"
          />
          <span className="text-sm">Top group (currently &apos;{topName}&apos;)</span>
        </label>

        {resolved.map((g) => (
          <label key={g.id} className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={value.all ? true : value.ids.includes(g.id) || (g.isTop && value.top)}
              onChange={() => value.all || toggleGroup(g.id)}
              disabled={value.all || g.isTop}
              className={cn(
                "size-3.5 cursor-pointer rounded border border-input text-primary accent-primary",
                (value.all || g.isTop) && "text-muted-foreground",
              )}
            />
            <span
              className="text-sm"
              style={{ color: g.color ? undefined : undefined }}
            >
              {g.name}
            </span>
            {g.color && (
              <span className="size-2 rounded-full" style={{ backgroundColor: g.color }} />
            )}
          </label>
        ))}
      </div>
    </div>
  );
});
GroupsSection.displayName = "GroupsSection";

// ═══════════════════════════════════════════════════════════
// COLUMN CHECKLIST SECTION (§5.4 / §6.8 / §7)
// ══════════════════════════════════════════════════==========

export interface ColumnChecklistSectionProps {
  columns: ColumnDefinition[];
  value: string[];
  onChange: (value: string[]) => void;
}

export const ColumnChecklistSection = memo(({ columns, value, onChange }: ColumnChecklistSectionProps) => {
  const allChecked = columns.length > 0 && columns.every((c) => value.includes(c.id));
  const someChecked = value.length > 0 && !allChecked;

  const toggleAll = useCallback(
    (checked: boolean) => onChange(checked ? columns.map((c) => c.id) : []),
    [columns, onChange],
  );

  const toggleColumn = useCallback(
    (columnId: string) => {
      const next = value.includes(columnId) ? value.filter((id) => id !== columnId) : [...value, columnId];
      onChange(next);
    },
    [value, onChange],
  );

  return (
    <div className="px-2">
      <label className="flex items-center justify-between cursor-pointer rounded py-1">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={allChecked}
            ref={(el) => {
              if (el) (el as HTMLInputElement).indeterminate = someChecked;
            }}
            onChange={(e) => toggleAll(e.target.checked)}
            className="size-3.5 cursor-pointer rounded border border-input text-primary accent-primary"
          />
          <span className="text-sm font-medium text-foreground">All columns for this Board</span>
        </div>
      </label>

      <div className="mt-1 space-y-0.5 max-h-60 overflow-y-auto border-t border-border">
        {columns.map((col, index) => (
          <label key={`${col.id}-${index}`} className="flex items-center gap-2 cursor-pointer rounded px-1 py-1 text-sm hover:bg-muted">
            <input
              type="checkbox"
              checked={value.includes(col.id)}
              onChange={() => toggleColumn(col.id)}
              className="size-3 cursor-pointer rounded border border-input text-primary accent-primary"
            />
            <ColumnTypeBadge column={col} />
            <span className="flex-1 truncate">{col.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
});
ColumnChecklistSection.displayName = "ColumnChecklistSection";

// ══════════════════════════════════════════════════==========
// BENCHMARK LINES SECTION (§6.6)
// ══════════════════════════════════════════════════==========

export interface BenchmarkLinesSectionProps {
  value: BenchmarkLine[];
  onChange: (value: BenchmarkLine[]) => void;
}

export const BenchmarkLinesSection = memo(({ value, onChange }: BenchmarkLinesSectionProps) => {
  const addLine = useCallback(() => {
    const line: BenchmarkLine = {
      id: `bl-${Date.now()}`,
      value: 0,
      label: "",
      color: "#ef4444",
    };
    onChange([...value, line]);
  }, [value, onChange]);

  const updateLine = useCallback(
    (id: string, patch: Partial<Omit<BenchmarkLine, "id">>) => {
      onChange(value.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    },
    [value, onChange],
  );

  const removeLine = useCallback(
    (id: string) => onChange(value.filter((l) => l.id !== id)),
    [value, onChange],
  );

  return (
    <div className="px-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">Benchmark lines</span>
        <Button variant="ghost" size="sm" className="h-6 gap-1 text-sm" onClick={addLine}>
          <Plus className="size-3" />
          Add benchmark line
        </Button>
      </div>
      {value.length === 0 ? (
        <p className="text-sm text-muted-foreground">No benchmark lines added yet.</p>
      ) : (
        <div className="space-y-3">
          {value.map((line) => (
            <div key={line.id} className="flex items-end gap-2 rounded-md border border-border p-2">
              <div className="flex-1 space-y-1">
                <label className="text-sm uppercase text-muted-foreground">Value</label>
                <Input
                  type="number"
                  value={line.value}
                  onChange={(e) => updateLine(line.id, { value: Number(e.target.value) })}
                  className="h-7 text-sm"
                />
              </div>
              <div className="flex-1 space-y-1">
                <label className="text-sm uppercase text-muted-foreground">Label</label>
                <Input
                  type="text"
                  value={line.label}
                  onChange={(e) => updateLine(line.id, { label: e.target.value })}
                  placeholder="e.g. Target"
                  className="h-7 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm uppercase text-muted-foreground">Color</label>
                <ColorSwatchPicker
                  value={line.color}
                  onChange={(color) => updateLine(line.id, { color })}
                  className="mt-1"
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="size-6 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => removeLine(line.id)}
                aria-label="Remove benchmark line"
              >
                <Trash2 className="size-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
BenchmarkLinesSection.displayName = "BenchmarkLinesSection";

// Re-export ChartTypeKey type accessor so importing files pull one surface.
export type { ChartTypeKey };
