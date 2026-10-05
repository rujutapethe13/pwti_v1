"use client";

/**
 * Dashboard — Shared UI Primitives
 *
 * Reusable building blocks for widget settings panels and card chrome.
 * Keeps behaviour identical across Number, Chart, and Data-over-Time widgets.
 */

import { memo, useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  HelpCircle,
  Search,
  Calendar,
  BarChart3,
  PieChart,
  LineChart,
  AreaChart,
  Layers,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ColumnDefinition } from "../../../types";
import {
  type ColumnTypeKey,
  type ChartTypeKey,
  type BenchmarkLine,
} from "./dashboard-types";
import { CHART_PALETTE } from "./chart-svg";

// ═══════════════════════════════════════════════════════════
// ELEMENT SIZE (responsive chart reflow on resize)
// ═══════════════════════════════════════════════════════════

export interface ElementSize {
  w: number;
  h: number;
}

export function useElementSize<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState<ElementSize>({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as [React.RefObject<T>, ElementSize];
}

// ═══════════════════════════════════════════════════════════
// INFO TOOLTIP (§5.2 / §6.5 inline ⓘ)
// ═══════════════════════════════════════════════════════════

export interface InfoTooltipProps {
  content: string;
  className?: string;
}

export const InfoTooltip = memo(({ content, className }: InfoTooltipProps) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <HelpCircle className={cn("size-4 text-muted-foreground", className)} />
    </TooltipTrigger>
    <TooltipContent side="top" className="max-w-xs text-sm">
      {content}
    </TooltipContent>
  </Tooltip>
));
InfoTooltip.displayName = "InfoTooltip";

// ═══════════════════════════════════════════════════════════
// SECTION HEADER (accordion, one open at a time)
// ════════════════════════════════════════════════════════

export interface SectionHeaderProps {
  title: string;
  icon?: React.ReactNode;
  expanded: boolean;
  onClick: () => void;
  disabled?: boolean;
}

export const SectionHeader = memo(({ title, icon, expanded, onClick, disabled }: SectionHeaderProps) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={cn(
      "flex w-full items-center gap-2 border-b border-border px-4 py-3 text-left text-base font-medium text-foreground transition-colors",
      disabled ? "cursor-not-allowed" : "hover:bg-muted",
    )}
  >
    {icon}
    <span className="flex-1">{title}</span>
    <ChevronDown
      className={cn("size-4 text-muted-foreground transition-transform", expanded && "rotate-180")}
    />
  </button>
));
SectionHeader.displayName = "SectionHeader";

// ═══════════════════════════════════════════════════════════
// COLUMN TYPE BADGE (Tt / 123 / calendar / status bars)
// ════════════════════════════════════════════════════════

const COLUMN_TYPE_META: Record<ColumnTypeKey, { label: string; icon: LucideIcon | null }> = {
  text: { label: "Tt", icon: null },
  long_text: { label: "Tt", icon: null },
  number: { label: "123", icon: null },
  currency: { label: "123", icon: null },
  date: { label: "", icon: Calendar },
  timeline: { label: "", icon: Calendar },
  status: { label: "", icon: BarChart3 },
  priority: { label: "", icon: BarChart3 },
  dropdown: { label: "", icon: Layers },
  multi_select: { label: "123", icon: Layers },
  checkbox: { label: "☐", icon: null },
  person: { label: "", icon: null },
  email: { label: "Tt", icon: null },
  phone: { label: "Tt", icon: null },
  url: { label: "Tt", icon: null },
  formula: { label: "ƒ", icon: null },
  files: { label: "📎", icon: null },
  rating: { label: "★", icon: null },
  tags: { label: "#", icon: null },
  connected_board: { label: "↗", icon: null },
  mirror: { label: "⇋", icon: null },
  lookup: { label: "ƒ", icon: null },
  rollup: { label: "Σ", icon: null },
  ai_field: { label: "AI", icon: null },
  button: { label: "B", icon: null },
  progress: { label: "123", icon: null },
  time_tracking: { label: "⏱", icon: null },
};

export interface ColumnTypeBadgeProps {
  column: ColumnDefinition;
  showLabel?: boolean;
  className?: string;
}

export const ColumnTypeBadge = memo(({ column, showLabel: _showLabel = false, className }: ColumnTypeBadgeProps) => {
  const meta = COLUMN_TYPE_META[column.type] ?? { label: column.type[0]?.toUpperCase() ?? "?", icon: null };
  return (
    <span
      className={cn(
        "inline-flex size-5 shrink-0 items-center justify-center rounded bg-muted text-xs font-bold text-muted-foreground",
        className,
      )}
      title={column.label}
    >
      {meta.label ? (
        <span>{meta.label}</span>
      ) : meta.icon ? (
        <meta.icon className="size-3" />
      ) : (
        <span>{column.type[0]?.toUpperCase() ?? "?"}</span>
      )}
    </span>
  );
});
ColumnTypeBadge.displayName = "ColumnTypeBadge";

export function ColumnTypeLabel(column: ColumnDefinition): string {
  const meta = COLUMN_TYPE_META[column.type] ?? { label: column.type, icon: null };
  return meta.label || column.type;
}

// ═══════════════════════════════════════════════════════════
// SEARCHABLE COLUMN SELECT (§6.2 / §6.3 / §6.4)
// ════════════════════════════════════════════════════════

export interface SearchableColumnSelectProps {
  columns: ColumnDefinition[];
  value: string;
  placeholder?: string;
  includeBlank?: boolean;
  blankLabel?: string;
  onChange: (columnId: string) => void;
  filter?: (column: ColumnDefinition) => boolean;
}

export const SearchableColumnSelect = memo(
  ({ columns, value, placeholder = "Select column", includeBlank, blankLabel = "None", onChange, filter }: SearchableColumnSelectProps) => {
    const selected = columns.find((c) => c.id === value);
    const items = filter ? columns.filter(filter) : columns;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex h-9 w-full items-center gap-2 rounded-md border border-input bg-background px-3 text-sm text-foreground hover:bg-accent"
          >
            <span className="truncate">
              {selected ? (
                <span className="flex items-center gap-1.5">
                  <ColumnTypeBadge column={selected} />
                  <span>{selected.label}</span>
                </span>
              ) : (
                placeholder
              )}
            </span>
            <ChevronDown className="ml-auto size-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-60" align="start">
          <div className="flex items-center border-b border-border px-2 py-1.5">
            <Search className="size-4 text-muted-foreground" />
            <span className="ml-1 text-sm uppercase text-muted-foreground">Search</span>
          </div>
          {includeBlank && (
            <>
              <DropdownMenuItem
                className="text-sm"
                onSelect={() => onChange("")}
              >
                <span className="truncate">{blankLabel}</span>
                {value === "" && <Check className="ml-auto size-3" />}
              </DropdownMenuItem>
              <DropdownMenuItem disabled className="h-px" />
            </>
          )}
          {items.length === 0 ? (
            <DropdownMenuItem disabled className="text-sm">
              No columns available
            </DropdownMenuItem>
          ) : (
            items.map((col) => (
              <DropdownMenuItem
                key={col.id}
                className="flex items-center gap-1.5 text-sm"
                onSelect={() => onChange(col.id)}
              >
                <ColumnTypeBadge column={col} />
                <span className="truncate">{col.label}</span>
                {value === col.id && <Check className="ml-auto size-3.5" />}
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  },
);
SearchableColumnSelect.displayName = "SearchableColumnSelect";

// ═══════════════════════════════════════════════════════════
// PILL TOGGLE (text-style segmented toggle)
// ════════════════════════════════════════════════════════

export interface PillToggleProps<T> {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  className?: string;
}

export function PillToggle<T extends string>({ value, options, onChange, className }: PillToggleProps<T>) {
  return (
    <div className={cn("inline-flex items-center rounded-lg bg-muted p-0.5 text-sm", className)}>
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "rounded px-3 py-1.5 font-medium transition-colors",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// STRETCH CHECKBOX
// ════════════════════════════════════════════════════════

export interface StretchCheckboxProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
  disabled?: boolean;
}

export function StretchCheckbox({ label, checked, onChange, className, disabled }: StretchCheckboxProps) {
  return (
    <label
      className={cn(
        "flex items-center gap-2 cursor-pointer rounded px-1 py-1.5 text-sm transition-colors",
        disabled && "cursor-not-allowed",
        className,
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 cursor-pointer rounded border border-input text-primary accent-primary focus:ring-1 focus:ring-ring"
      />
      <span className="flex-1">{label}</span>
    </label>
  );
}

// ═══════════════════════════════════════════════════════════
// COLOR SWATCH PICKER (10 preset colors)
// ════════════════════════════════════════════════════

export const BENCHMARK_COLORS = [
  "#22c55e", // green
  "#f97316", // orange
  "#3b82f6", // blue
  "#ef4444", // red
  "#84cc16", // light green
  "#94a3b8", // gray
  "#1e40af", // dark blue
  "#a855f7", // purple
  "#eab308", // yellow
  "#111827", // black
];

export interface ColorSwatchPickerProps {
  value: string;
  onChange: (color: string) => void;
  className?: string;
}

export const ColorSwatchPicker = memo(({ value, onChange, className }: ColorSwatchPickerProps) => (
  <div className={cn("flex flex-wrap gap-1", className)}>
    {BENCHMARK_COLORS.map((c) => (
      <button
        key={c}
        type="button"
        onClick={() => onChange(c)}
        className={cn(
          "size-5 rounded-sm border-2 transition-all",
          value === c ? "border-foreground" : "border-border",
        )}
        style={{ backgroundColor: c }}
        aria-label={c}
      />
    ))}
  </div>
));
ColorSwatchPicker.displayName = "ColorSwatchPicker";

export interface LabelColorSwatchProps {
  value: string;
  onChange: (color: string) => void;
}

export const LabelColorSwatch = memo(({ value, onChange }: LabelColorSwatchProps) => {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "size-5 rounded-sm border-2 transition-all",
            "hover:scale-110",
          )}
          style={{ backgroundColor: value }}
          aria-label="Choose color"
        />
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="start">
        <div className="grid grid-cols-8 gap-1.5">
          {CHART_PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                onChange(c);
                setOpen(false);
              }}
              className={cn(
                "size-6 rounded-sm border-2 transition-all hover:scale-110",
                value === c ? "border-foreground" : "border-border",
              )}
              style={{ backgroundColor: c }}
              aria-label={c}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
});
LabelColorSwatch.displayName = "LabelColorSwatch";

// ═══════════════════════════════════════════════════════════
// CHART TYPE PICKER (§6.1 — grouped visual picker)
// ══════════════════════════════==========═════════════════

export interface ChartTypePickerProps {
  value: ChartTypeKey;
  onChange: (type: ChartTypeKey) => void;
}

interface ChartTypeOption {
  value: ChartTypeKey;
  label: string;
  icon: LucideIcon;
}

const CHART_TYPE_GROUPS: Array<{ name: string; options: ChartTypeOption[] }> = [
  {
    name: "Most popular",
    options: [
      { value: "pie", label: "Pie", icon: PieChart },
      { value: "bar", label: "Bar", icon: BarChart3 },
      { value: "line", label: "Line", icon: LineChart },
      { value: "stacked_bar", label: "Stacked bar", icon: Layers },
      { value: "bubble", label: "Bubble", icon: BarChart3 },
    ],
  },
  {
    name: "Pie",
    options: [
      { value: "pie", label: "Pie", icon: PieChart },
      { value: "donut", label: "Donut", icon: PieChart },
    ],
  },
  {
    name: "Line",
    options: [
      { value: "line", label: "Single", icon: LineChart },
      { value: "line_multi", label: "Multi", icon: LineChart },
      { value: "line_smoothed", label: "Smoothed", icon: LineChart },
      { value: "line_dashed", label: "Dashed", icon: LineChart },
    ],
  },
  {
    name: "Bar",
    options: [
      { value: "bar", label: "Bar", icon: BarChart3 },
      { value: "stacked_bar", label: "Stacked bar", icon: Layers },
      { value: "bar_100", label: "100% stacked bar", icon: Layers },
    ],
  },
  {
    name: "Column",
    options: [
      { value: "column", label: "Column", icon: BarChart3 },
      { value: "stacked_column", label: "Stacked column", icon: Layers },
      { value: "column_100", label: "100% stacked column", icon: Layers },
    ],
  },
  {
    name: "Area",
    options: [
      { value: "area", label: "Area", icon: AreaChart },
      { value: "stacked_area", label: "Stacked area", icon: AreaChart },
      { value: "dual_tone_area", label: "Dual-tone area", icon: AreaChart },
    ],
  },
];

export const ChartTypePicker = memo(({ value, onChange }: ChartTypePickerProps) => (
  <div className="max-h-72 overflow-auto py-1">
    {CHART_TYPE_GROUPS.map((group) => (
      <div key={group.name} className="mb-3">
        <div className="px-2 text-sm uppercase text-muted-foreground">{group.name}</div>
        <div className="grid grid-cols-3 gap-1 px-2">
          {group.options.map((opt) => {
            const active = value === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onChange(opt.value)}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-md border px-2.5 py-2 text-sm transition-all min-h-[3.5rem]",
                  active
                    ? "border-blue-600 bg-blue-50 text-blue-700"
                    : "border-border bg-background text-muted-foreground hover:border-muted-foreground",
                )}
              >
                <opt.icon className="size-5" />
                <span className="text-center break-words">{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    ))}
  </div>
));
ChartTypePicker.displayName = "ChartTypePicker";

export type { BenchmarkLine };
