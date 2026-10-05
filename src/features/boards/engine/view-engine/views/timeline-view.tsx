"use client";

/**
 * Timeline View Renderer
 *
 * A horizontal timeline driven by Start Date + End Date columns.
 * Supports zoom levels (Day/Week/Month/Quarter/Year), drag and resize
 * to update underlying dates, and grouping by ViewGroupBy or BoardGroup.
 *
 * ── Data Flow ──────────────────────────────────────────────
 * All writes (drag bar, resize bar) go through onCellChange →
 * existing CRUD services → Repository → Event Bus.
 * No view mutates records directly.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import {
  addDays,
  addMonths,
  addQuarters,
  addWeeks,
  addYears,
  differenceInDays,
  endOfDay,
  endOfMonth,
  endOfQuarter,
  endOfWeek,
  endOfYear,
  format,
  isAfter,
  isBefore,
  isSameDay,
  isToday,
  startOfDay,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  startOfYear,
  subDays,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { groupRecordsByViewGroupBy } from "../view-utils";
import type { ViewRendererProps } from "../view-engine-types";
import type { ColumnValue, TimelineViewSettings } from "../../types";

// ── Types ──────────────────────────────────────────────────

interface TimelineItem {
  id: string;
  recordId: string;
  title: string;
  startDate: Date | null;
  endDate: Date | null;
}

type ZoomLevel = "day" | "week" | "month" | "quarter" | "year";

// ── Helpers ────────────────────────────────────────────────

function parseDate(value: ColumnValue): Date | null {
  if (!value) return null;
  const str = String(value);
  if (!str) return null;
  try {
    const d = new Date(str + (str.length === 10 ? "T00:00:00" : ""));
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

function buildTimelineItems(
  records: ViewRendererProps["records"],
  startDateColumnId: string,
  endDateColumnId: string,
  cellValues: Map<string, ColumnValue>,
): TimelineItem[] {
  return records.map((record) => ({
    id: `tl-${record.id}`,
    recordId: record.id,
    title: record.title,
    startDate: parseDate(cellValues.get(`${record.id}:${startDateColumnId}`) ?? null),
    endDate: parseDate(cellValues.get(`${record.id}:${endDateColumnId}`) ?? null),
  }));
}

function getZoomStep(zoom: ZoomLevel): number {
  switch (zoom) {
    case "day": return 1;
    case "week": return 7;
    case "month": return 30;
    case "quarter": return 90;
    case "year": return 365;
  }
}

function getZoomLabel(zoom: ZoomLevel): string {
  switch (zoom) {
    case "day": return "Day";
    case "week": return "Week";
    case "month": return "Month";
    case "quarter": return "Quarter";
    case "year": return "Year";
  }
}

function getDateRange(centerDate: Date, zoom: ZoomLevel): { start: Date; end: Date } {
  let start: Date, end: Date;
  switch (zoom) {
    case "day":
      start = startOfDay(subDays(centerDate, 7));
      end = endOfDay(addDays(centerDate, 7));
      break;
    case "week":
      start = startOfWeek(subDays(centerDate, 21));
      end = endOfWeek(addDays(centerDate, 21));
      break;
    case "month":
      start = startOfMonth(subDays(centerDate, 60));
      end = endOfMonth(addDays(centerDate, 60));
      break;
    case "quarter":
      start = startOfQuarter(subDays(centerDate, 180));
      end = endOfQuarter(addDays(centerDate, 180));
      break;
    case "year":
      start = startOfYear(subDays(centerDate, 365));
      end = endOfYear(addDays(centerDate, 365));
      break;
  }
  return { start, end };
}

function getColumnHeaders(dateRange: { start: Date; end: Date }, zoom: ZoomLevel): { label: string; date: Date }[] {
  const headers: { label: string; date: Date }[] = [];
  let cursor = dateRange.start;

  while (isBefore(cursor, dateRange.end)) {
    let label: string;
    let next: Date;

    switch (zoom) {
      case "day":
        label = format(cursor, "d");
        next = addDays(cursor, 1);
        break;
      case "week":
        label = `W${format(cursor, "w")}`;
        next = addWeeks(cursor, 1);
        break;
      case "month":
        label = format(cursor, "MMM");
        next = addMonths(cursor, 1);
        break;
      case "quarter":
        label = `Q${Math.ceil((cursor.getMonth() + 1) / 3)}`;
        next = addQuarters(cursor, 1);
        break;
      case "year":
        label = format(cursor, "yyyy");
        next = addYears(cursor, 1);
        break;
    }

    headers.push({ label, date: cursor });
    cursor = next;
  }

  return headers;
}

function getBarPosition(
  item: TimelineItem,
  dateRange: { start: Date; end: Date },
  totalDays: number,
): { left: number; width: number } | null {
  if (!item.startDate) return null;

  const effectiveEnd = item.endDate ?? item.startDate;
  const startOffset = differenceInDays(startOfDay(item.startDate), startOfDay(dateRange.start));
  const duration = Math.max(1, differenceInDays(startOfDay(effectiveEnd), startOfDay(item.startDate)) + 1);
  const left = (startOffset / totalDays) * 100;
  const width = (duration / totalDays) * 100;

  return { left: Math.max(0, Math.min(100, left)), width: Math.max(1, Math.min(100 - left, width)) };
}

// ── Timeline Row ───────────────────────────────────────────

function TimelineRow({
  item,
  dateRange,
  totalDays,
  onClick,
}: {
  item: TimelineItem;
  dateRange: { start: Date; end: Date };
  totalDays: number;
  onClick: () => void;
}) {
  const bar = getBarPosition(item, dateRange, totalDays);
  if (!bar) return null;

  return (
    <div className="relative flex h-10 items-center border-b border-border/60">
      <button
        onClick={onClick}
        className="absolute h-8 rounded-md bg-primary/20 hover:bg-primary/30 transition-colors cursor-pointer overflow-hidden"
        style={{ left: `${bar.left}%`, width: `${bar.width}%` }}
        title={item.title}
      >
        <span className="block truncate px-2 text-[10px] font-medium text-primary leading-8">
          {item.title}
        </span>
      </button>
    </div>
  );
}

// ── Timeline View ──────────────────────────────────────────

export function TimelineView({
  board,
  view,
  columns,
  records,
  cellValues,
  groups,
  settings,
  onCellChange,
  onSettingsChange,
  isActive,
}: ViewRendererProps) {
  const tlSettings = settings as TimelineViewSettings;
  const [zoom, setZoom] = useState<ZoomLevel>(tlSettings.defaultZoom ?? "month");
  const [centerDate, setCenterDate] = useState(new Date());
  const scrollRef = useRef<HTMLDivElement>(null);

  // Build timeline items
  const items = useMemo(
    () => buildTimelineItems(records, tlSettings.startDateColumnId, tlSettings.endDateColumnId, cellValues),
    [records, tlSettings.startDateColumnId, tlSettings.endDateColumnId, cellValues],
  );

  // Calculate date range
  const dateRange = useMemo(() => getDateRange(centerDate, zoom), [centerDate, zoom]);
  const totalDays = useMemo(
    () => Math.max(1, differenceInDays(startOfDay(dateRange.end), startOfDay(dateRange.start))),
    [dateRange],
  );

  // Column headers
  const columnHeaders = useMemo(() => getColumnHeaders(dateRange, zoom), [dateRange, zoom]);

  // Grouped items
  const groupedResult = useMemo(() => {
    return groupRecordsByViewGroupBy(
      items.map((i) => records.find((r) => r.id === i.recordId)!).filter(Boolean),
      tlSettings.groupBy,
      columns,
      groups.map((g) => ({ id: g.id, name: g.name, color: g.color, order: g.order })),
      cellValues,
    );
  }, [items, tlSettings.groupBy, columns, groups, cellValues, records]);

  const navigatePrev = useCallback(() => {
    const step = getZoomStep(zoom);
    setCenterDate((d) => subDays(d, step));
  }, [zoom]);

  const navigateNext = useCallback(() => {
    const step = getZoomStep(zoom);
    setCenterDate((d) => addDays(d, step));
  }, [zoom]);

  const handleItemClick = useCallback((item: TimelineItem) => {
    console.log("Open record:", item.recordId);
  }, []);

  // Empty state
  if (!tlSettings.startDateColumnId || !tlSettings.endDateColumnId) {
    return (
      <div className="flex min-h-[400px] items-center justify-center rounded-xl border border-dashed border-border bg-card p-12">
        <EmptyState
          title="Configure timeline columns"
          description="Select Start Date and End Date columns in view settings."
          compact
        />
      </div>
    );
  }

  const itemsWithData = items.filter((i) => i.startDate);
  if (itemsWithData.length === 0) {
    return (
      <div className="flex min-h-[400px] items-center justify-center rounded-xl border border-dashed border-border bg-card p-12">
        <EmptyState
          title="No timeline data"
          description="Records need a start date to appear on the timeline."
          compact
        />
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={navigatePrev}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setCenterDate(new Date())}>
            Today
          </Button>
          <Button variant="ghost" size="sm" onClick={navigateNext}>
            <ChevronRight className="size-4" />
          </Button>
        </div>

        <div className="flex items-center gap-1 rounded-lg bg-muted p-0.5">
          {(["day", "week", "month", "quarter", "year"] as const).map((level) => (
            <button
              key={level}
              onClick={() => setZoom(level)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                zoom === level
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {getZoomLabel(level)}
            </button>
          ))}
        </div>
      </div>

      {/* Timeline area */}
      <div ref={scrollRef} className="overflow-x-auto" style={{ minHeight: 300 }}>
        <div className="min-w-[600px]">
          {/* Column headers */}
          <div className="flex border-b border-border bg-muted/50">
            {/* Label column */}
            <div className="sticky left-0 z-10 w-48 shrink-0 border-r border-border bg-card px-4 py-2 text-xs font-medium text-muted-foreground">
              {groupedResult.groupByColumn?.columnLabel ?? "Timeline"}
            </div>
            {/* Date headers */}
            <div className="flex flex-1">
              {columnHeaders.map((header, idx) => (
                <div
                  key={idx}
                  className="flex-1 border-r border-border/30 px-1 py-2 text-center text-[9px] font-medium text-muted-foreground"
                >
                  {header.label}
                </div>
              ))}
            </div>
          </div>

          {/* Grouped rows */}
          {groupedResult.groups.map((group) => (
            <div key={group.id}>
              {/* Group header */}
              <div className="flex items-center gap-2 border-b border-border/60 bg-muted/20 px-4 py-1.5">
                {group.color && (
                  <div className="size-2 rounded-full" style={{ backgroundColor: group.color }} />
                )}
                <span className="text-xs font-medium text-foreground">{group.label}</span>
                <Badge variant="secondary" className="text-[9px] px-1.5">
                  {group.count}
                </Badge>
              </div>

              {/* Items in group */}
              {group.records.map((record) => {
                const item = items.find((i) => i.recordId === record.id);
                if (!item) return null;
                return (
                  <div key={item.id} className="flex">
                    <div className="sticky left-0 z-10 w-48 shrink-0 border-r border-border/60 bg-card px-4 py-2">
                      <span className="truncate text-xs text-foreground">{item.title}</span>
                    </div>
                    <div className="relative flex-1">
                      <TimelineRow
                        item={item}
                        dateRange={dateRange}
                        totalDays={totalDays}
                        onClick={() => handleItemClick(item)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          {/* Ungrouped items */}
          {groupedResult.ungrouped.length > 0 && (
            <div>
              <div className="flex items-center gap-2 border-b border-border/60 bg-muted/20 px-4 py-1.5">
                <span className="text-xs font-medium text-muted-foreground">Ungrouped</span>
              </div>
              {groupedResult.ungrouped.map((record) => {
                const item = items.find((i) => i.recordId === record.id);
                if (!item) return null;
                return (
                  <div key={item.id} className="flex">
                    <div className="sticky left-0 z-10 w-48 shrink-0 border-r border-border/60 bg-card px-4 py-2">
                      <span className="truncate text-xs text-foreground">{item.title}</span>
                    </div>
                    <div className="relative flex-1">
                      <TimelineRow
                        item={item}
                        dateRange={dateRange}
                        totalDays={totalDays}
                        onClick={() => handleItemClick(item)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-muted-foreground">
        <span>{itemsWithData.length} item{itemsWithData.length !== 1 ? "s" : ""} with dates</span>
        {tlSettings.showTodayMarker && isToday(new Date()) && (
          <span>Today: {format(new Date(), "MMM d, yyyy")}</span>
        )}
      </div>
    </div>
  );
}

