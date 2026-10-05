"use client";

import { CalendarRange, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CUSTOM_LABEL,
  TIME_RANGE_PRESETS,
  getTimeRangePreset,
  isDateKey,
  type CustomRange,
  type TimeRangeId,
} from "@/features/overview/time-range";
import { cn } from "@/lib/utils";

interface TimeRangeSelectorProps {
  value: TimeRangeId;
  onChange: (value: TimeRangeId) => void;
  /** Bounds for the "Custom range" picker. Unused for every other preset. */
  customRange?: CustomRange | null;
  /** Fired whenever the custom bounds change, so the page can re-query. */
  onCustomRangeChange?: (range: CustomRange) => void;
  className?: string;
  disabled?: boolean;
}

const isCustomValue = (value: string): value is string =>
  isDateKey(value) && value.length === 10;

/**
 * Preset range selector for the Activity/Overview page. Picking a preset emits
 * the new range id; the page re-queries every section for that window.
 *
 * "All time" is a preset like any other — the server narrows it to the data's
 * own bounds. "Custom range" reveals two day inputs inside the same menu, so
 * picking a window never navigates away or opens a separate dialog.
 */
export function TimeRangeSelector({
  value,
  onChange,
  customRange,
  onCustomRangeChange,
  className,
  disabled,
}: TimeRangeSelectorProps) {
  const preset = getTimeRangePreset(value);

  // A custom range with incomplete bounds must not claim to be one yet.
  const hasCustomBounds =
    isCustomValue(customRange?.from ?? "") && isCustomValue(customRange?.to ?? "");

  const handleCustomChange = (part: "from" | "to", raw: string) => {
    const next: CustomRange = {
      from: part === "from" ? raw : (customRange?.from ?? ""),
      to: part === "to" ? raw : (customRange?.to ?? ""),
    };
    onCustomRangeChange?.(next);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className={cn("gap-1.5", className)}
          aria-label={`Time range: ${preset.label}`}
        >
          <CalendarRange className="size-3.5" aria-hidden="true" />
          <span>{value === "custom" && hasCustomBounds
            ? `${CUSTOM_LABEL}: ${customRange?.from} – ${customRange?.to}`
            : preset.label}</span>
          <ChevronDown className="size-3.5 opacity-60" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Time range</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next) => onChange(next as TimeRangeId)}
        >
          {TIME_RANGE_PRESETS.map((option) => (
            <DropdownMenuRadioItem key={option.id} value={option.id}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {value === "custom" && (
          <>
            <DropdownMenuSeparator />
            <div className="flex flex-col gap-2 px-2 py-1.5">
              <label className="flex items-center justify-between gap-2 text-xs">
                <span className="text-muted-foreground">From</span>
                <input
                  type="date"
                  value={customRange?.from ?? ""}
                  max={customRange?.to || undefined}
                  onChange={(e) => handleCustomChange("from", e.target.value)}
                  className="border-border bg-background h-7 rounded-md border px-1.5 text-xs"
                  aria-label="Custom range start date"
                />
              </label>
              <label className="flex items-center justify-between gap-2 text-xs">
                <span className="text-muted-foreground">To</span>
                <input
                  type="date"
                  value={customRange?.to ?? ""}
                  min={customRange?.from || undefined}
                  onChange={(e) => handleCustomChange("to", e.target.value)}
                  className="border-border bg-background h-7 rounded-md border px-1.5 text-xs"
                  aria-label="Custom range end date"
                />
              </label>
              {!hasCustomBounds && (
                <p className="text-muted-foreground text-[11px] leading-snug">
                  Pick both dates to apply a custom range.
                </p>
              )}
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
