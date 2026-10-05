"use client";

/**
 * Calendar View Renderer
 *
 * A full-featured calendar view driven by user-selected Date column(s).
 * Supports Month, Week, and Day views with colored chips, labels,
 * and a settings panel for full customization.
 *
 * ── Key Design Decisions ───────────────────────────────────
 * - Custom-built using CSS Grid + date-fns (no heavy calendar library)
 * - Click chip → open record detail
 * - Renders metadata only; owns no data
 * - Settings scoped per-view via onSettingsChange
 */

import { useCallback, useMemo, useState } from "react";
import {
  addDays,
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  format,
  isAfter,
  isBefore,
  isPast,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  User,
  Filter,
  Settings,
  CalendarDays,
  ChevronDown,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ViewRendererProps } from "../view-engine-types";
import type { CalendarViewSettings, ColumnValue, ColumnDefinition } from "../../types";
import { CalendarSettingsPanel } from "./calendar-settings-panel";
import { AdvancedFilterPanel } from "./advanced-filter-panel";

// ── Types ──────────────────────────────────────────────────

interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  recordId: string;
  groupId?: string | null;
  color?: string;
  label?: string;
}

// ── Color palette for people/owners ────────────────────────

const PERSON_COLORS = [
  "#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1",
];

function getPersonColor(index: number): string {
  return PERSON_COLORS[index % PERSON_COLORS.length];
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

const GROUP_FALLBACK_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f43f5e", "#f97316",
  "#f59e0b", "#84cc16", "#10b981", "#06b6d4", "#0ea5e9",
  "#3b82f6", "#d946ef", "#14b8a6", "#eab308", "#22c55e",
];

function getGroupFallbackColor(groupId: string): string {
  return GROUP_FALLBACK_COLORS[hashString(groupId) % GROUP_FALLBACK_COLORS.length];
}

// ── Event builders ──────────────────────────────────────────

function buildEvents(
  records: ViewRendererProps["records"],
  dateColumnId: string,
  cellValues: Map<string, ColumnValue>,
  settings: CalendarViewSettings,
  columns: ColumnDefinition[],
  groups: ViewRendererProps["groups"],
  boardName?: string,
): CalendarEvent[] {
  if (!dateColumnId) return [];

  const events: CalendarEvent[] = [];
  const colorBy = settings.colorBy;
  const labelBy = settings.labelBy;

  // Find relevant columns for color/label
  const statusCol = columns.find((c) => c.type === "status");
  const personCol = columns.find((c) => c.type === "person");

  // Build a unified option lookup across every option-style column
  // (status, priority, dropdown). Imported rows frequently carry raw
  // option IDs (e.g. "opt-import-<timestamp>-<n>") — internal metadata
  // that should NEVER surface as the user-facing label or legend entry.
  // For each column we map id → label and label → label so resolution
  // works regardless of which shape the cell currently stores.
  const optionLabelByValue = new Map<string, string>();
  const optionColorByValue = new Map<string, string>();
  for (const col of columns) {
    if (col.type !== "status" && col.type !== "priority" && col.type !== "dropdown") continue;
    const opts = (col.settings?.options as Array<{ id?: string; label?: string; color?: string }>) || [];
    for (const opt of opts) {
      if (opt.id) {
        optionLabelByValue.set(opt.id.toLowerCase(), opt.label ?? opt.id);
        if (opt.color) optionColorByValue.set(opt.id.toLowerCase(), opt.color);
      }
      if (opt.label) {
        optionLabelByValue.set(opt.label.toLowerCase(), opt.label);
        if (opt.color) optionColorByValue.set(opt.label.toLowerCase(), opt.color);
      }
    }
  }

  // Resolve a stored cell value (option ID or raw label) to a
  // human-readable label. Falls back to the raw value when no match
  // is found so non-option columns render unchanged.
  const resolveOptionLabel = (val: string): string => {
    if (!val) return val;
    const lowerVal = val.toLowerCase();
    const resolved = optionLabelByValue.get(lowerVal);
    if (resolved) return resolved;
    // If the value looks like an internal import-batch ID, hide it from
    // the UI entirely. It's traceability metadata, not a display name.
    if (/^opt-import-\d/.test(lowerVal)) return "";
    return val;
  };

  // Resolve a stored cell value to its configured option color. Falls
  // back to undefined when no match exists; callers decide the default.
  const resolveOptionColor = (val: string): string | undefined => {
    if (!val) return undefined;
    return optionColorByValue.get(val.toLowerCase());
  };

  for (const record of records) {
    const key = `${record.id}:${dateColumnId}`;
    const value = cellValues.get(key);
    if (!value) continue;

    const dateStr = String(value);
    if (!dateStr || dateStr.length < 10) continue;

    // Skip hidden groups
    if (settings.visibleGroups.length > 0 && record.groupId && settings.visibleGroups.includes(record.groupId)) {
      continue;
    }

    // Determine color
    let color = "#6366f1";
    if (colorBy === "status" && statusCol) {
      const statusVal = cellValues.get(`${record.id}:${statusCol.id}`);
      const statusStr = String(statusVal || "");
      // Prefer the configured option color (covers status/priority/
      // dropdown) then the built-in status palette.
      color = resolveOptionColor(statusStr) || getStatusColor(statusStr);
    } else if (colorBy === "person" && personCol) {
      const personVal = cellValues.get(`${record.id}:${personCol.id}`);
      color = getPersonColor(hashString(String(personVal || "")));
    } else if (colorBy === "group" && record.groupId) {
      const group = groups.find((g) => g.id === record.groupId);
      color = group?.color || getGroupFallbackColor(record.groupId);
    }

    // Determine label: {Client Name} | {selected field value}
    let label = record.title;
    if (labelBy.length > 0 && !settings.hideItemNames) {
      let secondaryValue = "";
      for (const labelType of labelBy) {
        if (labelType === "board") {
          secondaryValue = boardName || "Board";
          break;
        } else if (labelType === "group" && record.groupId) {
          const group = groups.find((g) => g.id === record.groupId);
          secondaryValue = group?.name || "";
          break;
        } else {
          // It's a column ID
          const col = columns.find((c) => c.id === labelType);
          if (col) {
            const val = cellValues.get(`${record.id}:${col.id}`);
            const rawVal = String(val || "");
            // Resolve every option-style column (status, priority,
            // dropdown) from its stored ID/label to the human-readable
            // label. Internal import-batch IDs (opt-import-*) resolve
            // to "" and are intentionally excluded from the label.
            if (
              col.type === "status" ||
              col.type === "priority" ||
              col.type === "dropdown"
            ) {
              secondaryValue = resolveOptionLabel(rawVal);
            } else {
              secondaryValue = rawVal;
            }
            break;
          }
        }
      }
      if (secondaryValue) {
        label = `${record.title} | ${secondaryValue}`;
      }
    } else if (settings.hideItemNames) {
      label = "";
    }

    events.push({
      id: `event-${record.id}`,
      title: record.title,
      date: dateStr.slice(0, 10),
      recordId: record.id,
      groupId: record.groupId,
      color,
      label,
    });
  }
  return events;
}

function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    done: "#22c55e",
    "working on it": "#f59e0b",
    stuck: "#ef4444",
    "not started": "#9ca3af",
    "to do": "#9ca3af",
    "in progress": "#3b82f6",
  };
  return colors[status.toLowerCase()] || "#6366f1";
}

function getEventsForDay(events: CalendarEvent[], day: Date): CalendarEvent[] {
  return events.filter((event) => {
    try {
      const eventDate = new Date(event.date + "T00:00:00");
      return isSameDay(eventDate, day);
    } catch {
      return false;
    }
  });
}

// ── Month/Year Dropdowns ────────────────────────────────────

function MonthYearPicker({
  currentDate,
  onSelect,
}: {
  currentDate: Date;
  onSelect: (date: Date) => void;
}) {
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const currentYear = currentDate.getFullYear();
  const years = Array.from({ length: 11 }, (_, i) => currentYear - 5 + i);

  return (
    <div className="flex items-center gap-1">
      {/* Month dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 px-2 text-xs font-medium">
            {months[currentDate.getMonth()]}
            <ChevronDown className="ml-1 size-3 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-24">
          {months.map((month, idx) => (
            <DropdownMenuItem
              key={month}
              onSelect={() => {
                const newDate = new Date(currentDate);
                newDate.setMonth(idx);
                onSelect(newDate);
              }}
              className={cn(currentDate.getMonth() === idx && "font-medium text-primary")}
            >
              {month}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Year dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 px-2 text-xs font-medium">
            {currentYear}
            <ChevronDown className="ml-1 size-3 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-20 max-h-48 overflow-y-auto">
          {years.map((year) => (
            <DropdownMenuItem
              key={year}
              onSelect={() => {
                const newDate = new Date(currentDate);
                newDate.setFullYear(year);
                onSelect(newDate);
              }}
              className={cn(currentDate.getFullYear() === year && "font-medium text-primary")}
            >
              {year}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ── Day Cell ───────────────────────────────────────────────

function DayCell({
  day,
  events,
  isCurrentMonth,
  isTodayDay,
  onClick,
  onEventClick,
  hideItemNames,
  isWeekend = false,
}: {
  day: Date;
  events: CalendarEvent[];
  isCurrentMonth: boolean;
  isTodayDay: boolean;
  onClick: () => void;
  onEventClick: (event: CalendarEvent) => void;
  hideItemNames: boolean;
  isWeekend?: boolean;
}) {
  return (
    <div
      className={cn(
        "min-h-[100px] border-r border-b border-border/60 p-1 transition-colors",
        isCurrentMonth ? "bg-background" : "bg-muted/30",
        isWeekend && "bg-muted/20",
      )}
    >
      <button
        onClick={onClick}
        className={cn(
          "mb-1 flex size-6 items-center justify-center rounded-full text-xs font-medium",
          isTodayDay && "bg-primary text-primary-foreground",
          !isTodayDay && isCurrentMonth && !isWeekend && "text-foreground",
          !isTodayDay && isCurrentMonth && isWeekend && "text-muted-foreground/60",
          !isTodayDay && !isCurrentMonth && "text-muted-foreground/50",
        )}
      >
        {format(day, "d")}
      </button>
      <div className={cn("space-y-0.5", !isCurrentMonth && "opacity-70")}>
        {events.slice(0, 3).map((event) => (
          <button
            key={event.id}
            onClick={(e) => {
              e.stopPropagation();
              onEventClick(event);
            }}
            className="w-full truncate rounded px-1.5 py-0.5 text-[9px] font-medium text-left text-white hover:opacity-80 transition-opacity"
            style={{ backgroundColor: event.color || "#6366f1" }}
          >
            {!hideItemNames && (event.label || event.title)}
          </button>
        ))}
        {events.length > 3 && (
          <span className="px-1 text-[9px] text-muted-foreground">
            +{events.length - 3} more
          </span>
        )}
      </div>
    </div>
  );
}

// ── Month View ─────────────────────────────────────────────

function MonthView({
  currentDate,
  events,
  onDayClick,
  onEventClick,
  hideItemNames,
  firstDayOfWeek,
  hideWeekends,
}: {
  currentDate: Date;
  events: CalendarEvent[];
  onDayClick: (date: Date) => void;
  onEventClick: (event: CalendarEvent) => void;
  hideItemNames: boolean;
  firstDayOfWeek: 0 | 1;
  hideWeekends: boolean;
}) {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: firstDayOfWeek });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: firstDayOfWeek });

  const weeks = useMemo(() => {
    const days: Date[][] = [];
    let day = calendarStart;
    while (day <= calendarEnd) {
      const week: Date[] = [];
      for (let i = 0; i < 7; i++) {
        week.push(day);
        day = addDays(day, 1);
      }
      days.push(week);
    }
    return days;
  }, [calendarStart, calendarEnd]);

  const dayLabels = firstDayOfWeek === 1
    ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Determine which column indices are weekends (0=Sun, 6=Sat)
  const isWeekendCol = (colIndex: number): boolean => {
    if (firstDayOfWeek === 1) {
      // Mon-Sun: Sat=5, Sun=6
      return colIndex === 5 || colIndex === 6;
    } else {
      // Sun-Sat: Sun=0, Sat=6
      return colIndex === 0 || colIndex === 6;
    }
  };

  return (
    <div>
      <div className="grid grid-cols-7 border-b border-border">
        {dayLabels.map((day, idx) => (
          <div
            key={day}
            className={cn(
              "px-2 py-2 text-xs font-medium",
              hideWeekends && isWeekendCol(idx)
                ? "text-muted-foreground/40"
                : "text-muted-foreground",
            )}
          >
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {weeks.flat().map((day, idx) => {
          const colIndex = idx % 7;
          const isWeekend = hideWeekends && isWeekendCol(colIndex);
          return (
            <DayCell
              key={idx}
              day={day}
              events={getEventsForDay(events, day)}
              isCurrentMonth={isSameMonth(day, currentDate)}
              isTodayDay={isToday(day)}
              onClick={() => onDayClick(day)}
              onEventClick={onEventClick}
              hideItemNames={hideItemNames}
              isWeekend={isWeekend}
            />
          );
        })}
      </div>
    </div>
  );
}

// ── Week View (with time grid) ──────────────────────────────

function WeekView({
  currentDate,
  events,
  onEventClick,
  showHours,
  hideItemNames,
  firstDayOfWeek,
  hideWeekends,
}: {
  currentDate: Date;
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
  showHours: boolean;
  hideItemNames: boolean;
  firstDayOfWeek: 0 | 1;
  hideWeekends: boolean;
}) {
  const weekStart = startOfWeek(currentDate, { weekStartsOn: firstDayOfWeek });
  const days: Date[] = [];
  let day = weekStart;
  for (let i = 0; i < 7; i++) {
    if (hideWeekends && (i === 0 || i === 6) && firstDayOfWeek === 1) continue;
    if (hideWeekends && (i === 5 || i === 6) && firstDayOfWeek === 0) continue;
    days.push(day);
    day = addDays(day, 1);
  }

  const hours = Array.from({ length: 13 }, (_, i) => i + 8); // 8 AM - 8 PM

  return (
    <div className="flex flex-col">
      {/* Day headers */}
      <div className="grid border-b border-border" style={{ gridTemplateColumns: `60px repeat(${days.length}, 1fr)` }}>
        <div className="border-r border-border/60" />
        {days.map((d) => (
          <div key={d.toISOString()} className="border-r border-border/60 px-2 py-2 text-center">
            <div className="text-xs text-muted-foreground">{format(d, "EEE")}</div>
            <div className={cn(
              "text-sm font-medium",
              isToday(d) ? "text-primary" : "text-foreground",
            )}>
              {format(d, "d")}
            </div>
          </div>
        ))}
      </div>

      {/* Time grid */}
      <div className="relative overflow-y-auto" style={{ maxHeight: 500 }}>
        {showHours ? (
          hours.map((hour) => (
            <div
              key={hour}
              className="grid border-b border-border/40"
              style={{ gridTemplateColumns: `60px repeat(${days.length}, 1fr)`, minHeight: 50 }}
            >
              <div className="border-r border-border/60 px-2 py-1 text-[9px] text-muted-foreground">
                {hour}:00
              </div>
              {days.map((d) => (
                <div key={d.toISOString()} className="border-r border-border/60" />
              ))}
            </div>
          ))
        ) : (
          <div
            className="grid"
            style={{ gridTemplateColumns: `60px repeat(${days.length}, 1fr)`, minHeight: 300 }}
          >
            <div className="border-r border-border/60" />
            {days.map((d) => (
              <div key={d.toISOString()} className="border-r border-border/60 p-1">
                <div className="space-y-0.5">
                  {getEventsForDay(events, d).slice(0, 4).map((event) => (
                    <button
                      key={event.id}
                      onClick={() => onEventClick(event)}
                      className="w-full truncate rounded px-1.5 py-0.5 text-[9px] font-medium text-left text-white hover:opacity-80"
                      style={{ backgroundColor: event.color || "#6366f1" }}
                    >
                      {!hideItemNames && (event.label || event.title)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Day View (with time grid) ──────────────────────────────

function DayView({
  currentDate,
  events,
  onEventClick,
  showHours,
  hideItemNames,
}: {
  currentDate: Date;
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
  showHours: boolean;
  hideItemNames: boolean;
}) {
  const dayEvents = getEventsForDay(events, currentDate);
  const hours = Array.from({ length: 13 }, (_, i) => i + 8);

  return (
    <div className="flex flex-col">
      {/* Day header */}
      <div className="border-b border-border px-4 py-3">
        <div className="text-xs text-muted-foreground">{format(currentDate, "EEEE")}</div>
        <div className="text-lg font-semibold text-foreground">{format(currentDate, "MMMM d, yyyy")}</div>
      </div>

      {/* Time grid */}
      <div className="relative overflow-y-auto" style={{ maxHeight: 500 }}>
        {showHours ? (
          hours.map((hour) => (
            <div key={hour} className="grid grid-cols-[60px_1fr] border-b border-border/40" style={{ minHeight: 50 }}>
              <div className="border-r border-border/60 px-2 py-1 text-[9px] text-muted-foreground">
                {hour}:00
              </div>
              <div className="p-1" />
            </div>
          ))
        ) : (
          <div className="p-4 space-y-2">
            {dayEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No events for this day.</p>
            ) : (
              dayEvents.map((event) => (
                <button
                  key={event.id}
                  onClick={() => onEventClick(event)}
                  className="w-full rounded-lg p-3 text-left text-sm font-medium text-white hover:opacity-80"
                  style={{ backgroundColor: event.color || "#6366f1" }}
                >
                  {!hideItemNames && (event.label || event.title)}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Color Legend ────────────────────────────────────────────

function ColorLegend({
  events,
  colorBy,
  groups,
  columns,
}: {
  events: CalendarEvent[];
  colorBy: string;
  groups: ViewRendererProps["groups"];
  columns: ColumnDefinition[];
}) {
  if (colorBy === "none") return null;

  let legendItems: Array<{ label: string; color: string }> = [];
  if (colorBy === "group") {
    legendItems = groups.map((g) => ({ label: g.name, color: g.color || getGroupFallbackColor(g.id) }));
  } else if (colorBy === "board") {
    legendItems = [{ label: "All items", color: "#6366f1" }];
  } else if (colorBy === "status") {
    // For status coloring, build the legend directly from the configured
    // status options (label + color from the column settings). This
    // guarantees the legend uses real column data instead of first-sample
    // label strings, which previously surfaced raw import-batch IDs.
    const statusCol = columns.find((c) => c.type === "status");
    const statusOptions = (statusCol?.settings?.options as Array<{
      id?: string;
      label?: string;
      color?: string;
    }>) || [];
    const eventColors = new Set(events.map((e) => e.color).filter(Boolean));
    legendItems = statusOptions
      .filter((opt) => opt.color && (eventColors.size === 0 || eventColors.has(opt.color)))
      .map((opt) => ({ label: opt.label || opt.id || "", color: opt.color || "#6366f1" }));
    // Fall back to first-sample labels if the status options list is empty
    // (e.g. column has no settings yet) — still avoiding raw opt-import IDs.
    if (legendItems.length === 0) {
      const seen = new Map<string, string>();
      for (const event of events) {
        if (!event.color || seen.has(event.color)) continue;
        seen.set(event.color, event.color);
      }
      for (const [, color] of seen) {
        const sample = events.find((e) => e.color === color);
        if (!sample) continue;
        const parts = (sample.label || "").split(" | ");
        const tail = parts.length > 1 ? parts[parts.length - 1].trim() : "";
        const candidate = tail && !/^opt-import-/i.test(tail) ? tail : sample.title;
        legendItems.push({ label: candidate, color });
      }
    }
  } else {
    // Person / other coloring: dedupe by color and pick a human label
    // from the first matching event's title (skipping raw opt-import IDs).
    const seen = new Map<string, string>();
    for (const event of events) {
      if (!event.color || seen.has(event.color)) continue;
      const parts = (event.label || "").split(" | ");
      const tail = parts.length > 1 ? parts[parts.length - 1].trim() : "";
      const candidate = tail && !/^opt-import-/i.test(tail) ? tail : event.title;
      seen.set(event.color, candidate);
    }
    legendItems = Array.from(seen.entries()).map(([color, label]) => ({ label, color }));
  }

  if (legendItems.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-2">
      {legendItems.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ backgroundColor: item.color }} />
          <span className="text-[9px] text-muted-foreground">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main Calendar View ─────────────────────────────────────

export function CalendarView({
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
  const calendarSettings = settings as CalendarViewSettings;
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<"month" | "week" | "day">(
    calendarSettings.defaultView === "agenda" ? "month" : calendarSettings.defaultView,
  );
  const [showSettings, setShowSettings] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [activeFilters, setActiveFilters] = useState<Array<{ id: string; columnId: string; operator: string; value: ColumnValue }>>([]);

  // Auto-detect the date column: use selected column or find first date column
  const detectedDateColumn = useMemo(() => {
    // If user has explicitly selected date columns, use the first one
    if (calendarSettings.selectedDateColumns.length > 0) {
      return calendarSettings.selectedDateColumns[0];
    }
    // If legacy dateColumnId is set, use it
    if (calendarSettings.dateColumnId) {
      return calendarSettings.dateColumnId;
    }
    // Auto-detect: find first column of type "date" or "timeline"
    const dateCol = columns.find((c) => c.type === "date" || c.type === "timeline");
    return dateCol?.id || "";
  }, [columns, calendarSettings.selectedDateColumns, calendarSettings.dateColumnId]);

  // Build events from records using the detected date column
  const allEvents = useMemo(
    () => buildEvents(records, detectedDateColumn, cellValues, calendarSettings, columns, groups, board.name),
    [records, detectedDateColumn, cellValues, calendarSettings, columns, groups, board.name],
  );

  // Apply active filters to events
  const events = useMemo(() => {
    if (activeFilters.length === 0) return allEvents;
    return allEvents.filter((event) => {
      return activeFilters.every((filter) => {
        // Handle Client Name pseudo-column
        if (filter.columnId === "__client_name") {
          const record = records.find((r) => r.id === event.recordId);
          if (!record) return false;
          const values = Array.isArray(filter.value) ? filter.value : [filter.value];
          if (values.length === 0 || (values.length === 1 && values[0] === "")) return true;
          return values.some((v) => String(v).toLowerCase() === record.title.toLowerCase());
        }
        const col = columns.find((c) => c.id === filter.columnId);
        if (!col) return true;
        const cellValue = cellValues.get(`${event.recordId}:${filter.columnId}`);
        return evaluateFilter(cellValue, filter.operator, filter.value, col.type);
      });
    });
  }, [allEvents, activeFilters, columns, cellValues, records]);

  const handleApplyFilters = useCallback((filters: Array<{ id: string; columnId: string; operator: string; value: ColumnValue }>) => {
    setActiveFilters(filters);
    setShowFilters(false);
  }, []);

  const navigatePrev = useCallback(() => {
    if (viewMode === "month") setCurrentDate((d) => subMonths(d, 1));
    else if (viewMode === "week") setCurrentDate((d) => subWeeks(d, 1));
    else if (viewMode === "day") setCurrentDate((d) => addDays(d, -1));
  }, [viewMode]);

  const navigateNext = useCallback(() => {
    if (viewMode === "month") setCurrentDate((d) => addMonths(d, 1));
    else if (viewMode === "week") setCurrentDate((d) => addWeeks(d, 1));
    else if (viewMode === "day") setCurrentDate((d) => addDays(d, 1));
  }, [viewMode]);

  const navigateToday = useCallback(() => {
    setCurrentDate(new Date());
  }, []);

  const handleDayClick = useCallback(
    (date: Date) => {
      setCurrentDate(date);
      setViewMode("day");
    },
    [],
  );

  const handleEventClick = useCallback(
    (event: CalendarEvent) => {
      console.log("Open record:", event.recordId);
    },
    [],
  );

  const handleViewModeChange = useCallback(
    (mode: "month" | "week" | "day") => {
      setViewMode(mode);
      onSettingsChange?.({ defaultView: mode });
    },
    [onSettingsChange],
  );

  // Always render the calendar grid — never show a blank "no column" placeholder
  // Events will layer on top once a date column is known

  const periodLabel =
    viewMode === "month"
      ? format(currentDate, "MMMM yyyy")
      : viewMode === "week"
        ? `${format(startOfWeek(currentDate, { weekStartsOn: calendarSettings.firstDayOfWeek }), "MMM d")} – ${format(endOfWeek(currentDate, { weekStartsOn: calendarSettings.firstDayOfWeek }), "MMM d, yyyy")}`
        : format(currentDate, "EEEE, MMMM d, yyyy");

  return (
    <div className={cn(
      "flex overflow-hidden rounded-xl border border-border bg-card shadow-sm",
    )}>
      {/* Main calendar area */}
      <div className="flex flex-1 flex-col">
        {/* ── Toolbar ───────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
          {/* Person Filter */}
          <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-muted-foreground">
            <User className="size-3.5" />
            <span className="hidden sm:inline">Person</span>
          </Button>

          {/* Filter */}
          <Button
            variant="ghost"
            size="sm"
            className={cn("h-8 gap-1.5 text-xs", showFilters ? "bg-muted text-foreground" : "text-muted-foreground")}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="size-3.5" />
            <span className="hidden sm:inline">Filter</span>
            {activeFilters.length > 0 && (
              <span className="ml-1 flex size-4 items-center justify-center rounded-full bg-primary text-[9px] text-primary-foreground">
                {activeFilters.length}
              </span>
            )}
          </Button>

          <div className="flex-1" />

          {/* Today */}
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={navigateToday}>
            Today
          </Button>

          {/* Navigation arrows */}
          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="icon" className="size-7" onClick={navigatePrev}>
              <ChevronLeft className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" className="size-7" onClick={navigateNext}>
              <ChevronRight className="size-4" />
            </Button>
          </div>

          {/* Month/Year pickers */}
          <MonthYearPicker
            currentDate={currentDate}
            onSelect={(date) => setCurrentDate(date)}
          />

          {/* View toggle */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs">
                <CalendarDays className="size-3.5" />
                {viewMode.charAt(0).toUpperCase() + viewMode.slice(1)}
                <ChevronDown className="size-3.5 opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-32">
              <DropdownMenuItem onSelect={() => handleViewModeChange("month")}>Month</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => handleViewModeChange("week")}>Week</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => handleViewModeChange("day")}>Day</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Settings gear */}
          <Button
            variant="ghost"
            size="icon"
            className={cn("size-7", showSettings && "bg-muted text-foreground")}
            aria-label="Settings"
            onClick={() => setShowSettings(!showSettings)}
          >
            <Settings className="size-3.5" />
          </Button>
        </div>

        {/* ── Calendar Content ──────────────────────────── */}
        <div className="flex-1 overflow-auto" style={{ minHeight: 400 }}>
          {viewMode === "month" && (
            <MonthView
              currentDate={currentDate}
              events={events}
              onDayClick={handleDayClick}
              onEventClick={handleEventClick}
              hideItemNames={calendarSettings.hideItemNames}
              firstDayOfWeek={calendarSettings.firstDayOfWeek}
              hideWeekends={calendarSettings.hideWeekends}
            />
          )}
          {viewMode === "week" && (
            <WeekView
              currentDate={currentDate}
              events={events}
              onEventClick={handleEventClick}
              showHours={calendarSettings.showHours}
              hideItemNames={calendarSettings.hideItemNames}
              firstDayOfWeek={calendarSettings.firstDayOfWeek}
              hideWeekends={calendarSettings.hideWeekends}
            />
          )}
          {viewMode === "day" && (
            <DayView
              currentDate={currentDate}
              events={events}
              onEventClick={handleEventClick}
              showHours={calendarSettings.showHours}
              hideItemNames={calendarSettings.hideItemNames}
            />
          )}
        </div>

        {/* ── Color Legend ───────────────────────────────── */}
        <ColorLegend events={events} colorBy={calendarSettings.colorBy} groups={groups} columns={columns} />

        {/* ── Footer ─────────────────────────────────────── */}
        <div className="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-muted-foreground">
          <span>
            {events.length} event{events.length !== 1 ? "s" : ""}
            {!detectedDateColumn && columns.length > 0 && (
              <span className="ml-2 text-amber-600">• No date column found</span>
            )}
          </span>
          {calendarSettings.showRecordCount && (
            <span>
              {records.length} record{records.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {/* ── Settings Panel (slide-out) ──────────────────── */}
      {showSettings && (
        <CalendarSettingsPanel
          settings={calendarSettings}
          columns={columns}
          groups={groups}
          onSettingsChange={onSettingsChange || (() => {})}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* ── Advanced Filter Panel (slide-out) ─────────────── */}
      {showFilters && (
        <AdvancedFilterPanel
          columns={columns}
          records={records}
          cellValues={cellValues}
          onClose={() => setShowFilters(false)}
          onApply={handleApplyFilters}
        />
      )}
    </div>
  );
}

// ── Filter Evaluation Logic ─────────────────────────────────

function evaluateFilter(
  cellValue: ColumnValue | undefined,
  operator: string,
  filterValue: ColumnValue,
  columnType: string
): boolean {
  if (operator === "is_empty") return cellValue == null || cellValue === "";
  if (operator === "not_empty") return cellValue != null && cellValue !== "";

  if (cellValue == null) return false;

  const cellStr = String(cellValue).toLowerCase();
  const filterStr = String(filterValue).toLowerCase();

  // Date-specific operators
  if (columnType === "date" || columnType === "timeline") {
    return evaluateDateFilter(cellValue, operator, filterValue);
  }

  switch (operator) {
    case "is":
    case "eq":
      return cellStr === filterStr;
    case "is_not":
    case "neq":
      return cellStr !== filterStr;
    case "contains":
      return cellStr.includes(filterStr);
    case "not_contains":
      return !cellStr.includes(filterStr);
    case "starts_with":
      return cellStr.startsWith(filterStr);
    case "ends_with":
      return cellStr.endsWith(filterStr);
    case "gt":
      return Number(cellValue) > Number(filterValue);
    case "lt":
      return Number(cellValue) < Number(filterValue);
    case "gte":
      return Number(cellValue) >= Number(filterValue);
    case "lte":
      return Number(cellValue) <= Number(filterValue);
    case "is_one_of": {
      const values = Array.isArray(filterValue) ? filterValue : [filterValue];
      return values.some((v) => String(v).toLowerCase() === cellStr);
    }
    case "is_true":
      return cellValue === true || cellValue === "true";
    case "is_false":
      return cellValue === false || cellValue === "false";
    default:
      return true;
  }
}

function evaluateDateFilter(
  cellValue: ColumnValue,
  operator: string,
  filterValue: ColumnValue
): boolean {
  try {
    const date = new Date(String(cellValue));
    const today = new Date();

    // Handle "between" date range - filterValue is [startDate, endDate]
    if (operator === "between") {
      const dates = Array.isArray(filterValue) ? filterValue : [filterValue, ""];
      const startStr = String(dates[0] || "");
      const endStr = String(dates[1] || "");
      if (!startStr && !endStr) return true;
      const startTime = startStr ? new Date(startStr).getTime() : Number.MIN_SAFE_INTEGER;
      const endTime = endStr ? new Date(endStr).getTime() : Number.MAX_SAFE_INTEGER;
      const dateTime = date.getTime();
      return dateTime >= startTime && dateTime <= endTime;
    }

    switch (operator) {
      case "is":
        return isSameDay(date, new Date(String(filterValue)));
      case "is_not":
        return !isSameDay(date, new Date(String(filterValue)));
      case "before":
        return isBefore(date, new Date(String(filterValue)));
      case "after":
        return isAfter(date, new Date(String(filterValue)));
      case "overdue":
        return isPast(date) && !isToday(date);
      case "today":
        return isToday(date);
      case "this_week": {
        const weekStart = startOfWeek(today);
        const weekEnd = endOfWeek(today);
        return !isBefore(date, weekStart) && !isAfter(date, weekEnd);
      }
      case "this_month": {
        const monthStart = startOfMonth(today);
        const monthEnd = endOfMonth(today);
        return !isBefore(date, monthStart) && !isAfter(date, monthEnd);
      }
      case "next_month": {
        const nextMonthStart = startOfMonth(addMonths(today, 1));
        const nextMonthEnd = endOfMonth(addMonths(today, 1));
        return !isBefore(date, nextMonthStart) && !isAfter(date, nextMonthEnd);
      }
      case "last_month": {
        const lastMonthStart = startOfMonth(subMonths(today, 1));
        const lastMonthEnd = endOfMonth(subMonths(today, 1));
        return !isBefore(date, lastMonthStart) && !isAfter(date, lastMonthEnd);
      }
      default:
        return true;
    }
  } catch {
    return false;
  }
}
