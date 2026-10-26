"use client";

/**
 * Calendar View Renderer
 *
 * A monday.com-style calendar driven by a user-selected Date column.
 *
 * ── Layout ────────────────────────────────────────────────
 * - Toolbar: view name · Today · chevrons · period title ·
 *   Day|Week|Month toggle · Filter · Color by · Date column
 * - Month: 7 columns × 5-6 rows that fill the available height
 * - Week: 7 columns, items stacked per day
 * - Day: single column list
 *
 * ── Items ─────────────────────────────────────────────────
 * Every row whose date column has a value renders as a pill on that
 * day. The pill colour comes from the "Color by" column (Status by
 * default) and uses the very same label colours the Status column
 * shows. A pill whose colour is a light shade is drawn as a tinted
 * background with a coloured left edge and dark text; a saturated
 * colour is drawn as a full fill with white text.
 *
 * ── Interactions ──────────────────────────────────────────
 * - Drag a pill onto another day to reschedule that row
 * - Hover an empty day to add a new row pre-filled with that date
 * - Arrow keys move the focused day, Enter opens, Esc closes
 * - Unscheduled side panel lists rows with no date
 *
 * Dates are always parsed as LOCAL dates so a row dated 2026-01-29
 * never drifts onto 2026-01-30 because of a UTC offset.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  addDays,
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from "date-fns";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Filter,
  Inbox,
  Plus,
  Settings,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ViewRendererProps } from "../view-engine-types";
import type {
  BoardRecord,
  CalendarViewSettings,
  ColumnDefinition,
  ColumnValue,
} from "../../types";
import { findOptionForValue, getColumnOptions } from "../../lib/option-lookup";
import { parseCalendarDate, startOfLocalDay, toDayKey } from "./calendar-date-utils";
import { CalendarSettingsPanel } from "./calendar-settings-panel";
import { AdvancedFilterPanel } from "./advanced-filter-panel";
import { CalendarItemPanel } from "./calendar-item-panel";

// ── Design tokens (monday.com) ──────────────────────────────

const MONDAY = {
  text: "#323338",
  muted: "#676879",
  border: "#D0D4E4",
  inputBorder: "#C3C6D4",
  accent: "#0073EA",
  accentDark: "#0063C7",
  weekend: "#FAFAFB",
  outside: "#F1F2F5",
  hover: "#F7F8FA",
  dropTarget: "#E9F2FD",
  neutral: "#C3C6D4",
} as const;

/** Height of the date-number strip at the top of every day cell. */
const DATE_STRIP_HEIGHT = 28;
/** Vertical slot reserved for one lane of multi-day bars. */
const BAR_SLOT_HEIGHT = 28;
/** Height of a single pill / bar. */
const PILL_HEIGHT = 24;
/** Pills rendered inline before the "+N more" link appears. */
const MAX_INLINE_ITEMS = 3;

/** Sentinel id used by the "Color by" dropdown for board groups. */
const GROUP_COLOR_SOURCE = "__group__";

type CalendarMode = "month" | "week" | "day";

// ── Date helpers ────────────────────────────────────────────

// Re-exported so the view and its helpers share one implementation.
export { parseCalendarDate, startOfLocalDay, toDayKey } from "./calendar-date-utils";

// ── Colour helpers ──────────────────────────────────────────

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  let cleaned = hex.trim().replace("#", "");
  if (cleaned.length === 3) {
    cleaned = cleaned
      .split("")
      .map((char) => char + char)
      .join("");
  }
  if (cleaned.length !== 6) return null;
  const r = Number.parseInt(cleaned.slice(0, 2), 16);
  const g = Number.parseInt(cleaned.slice(2, 4), 16);
  const b = Number.parseInt(cleaned.slice(4, 6), 16);
  if ([r, g, b].some((channel) => Number.isNaN(channel))) return null;
  return { r, g, b };
}

/** True when the colour is a light shade that needs dark text on top. */
export function isLightColor(hex: string): boolean {
  const rgb = hexToRgb(hex);
  if (!rgb) return false;
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return luminance > 0.62;
}

/** Blend a colour towards white. `amount` 0 = unchanged, 1 = white. */
function tintColor(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const mix = (channel: number) => Math.round(channel + (255 - channel) * amount);
  return `rgb(${mix(rgb.r)}, ${mix(rgb.g)}, ${mix(rgb.b)})`;
}

// ── Fallback palettes ───────────────────────────────────────

const STATUS_FALLBACK_COLORS: Record<string, string> = {
  done: "#00C875",
  "working on it": "#FDAB3D",
  stuck: "#E2445C",
  "not started": "#C4C4C4",
  "to do": "#C4C4C4",
  "in progress": "#579BFC",
  "on hold": "#A25DDC",
  review: "#A25DDC",
};

function getStatusColor(status: string): string {
  return STATUS_FALLBACK_COLORS[status.trim().toLowerCase()] ?? "#579BFC";
}

const PERSON_COLORS = [
  "#579BFC",
  "#A25DDC",
  "#FF642E",
  "#00C875",
  "#FDAB3D",
  "#FF1582",
  "#E2445C",
  "#037F4C",
  "#A8C6FA",
  "#0086D0",
];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

const GROUP_FALLBACK_COLORS = [
  "#579BFC",
  "#A25DDC",
  "#FF642E",
  "#00C875",
  "#FDAB3D",
  "#FF1582",
  "#E2445C",
  "#037F4C",
  "#0086D0",
  "#9CDD01",
];

function getGroupFallbackColor(groupId: string): string {
  if (!groupId) return "#579BFC";
  return GROUP_FALLBACK_COLORS[hashString(groupId) % GROUP_FALLBACK_COLORS.length];
}

// ── Item model ──────────────────────────────────────────────

interface CalendarItem {
  id: string;
  recordId: string;
  title: string;
  /** The record's own title, without any secondary label. */
  recordTitle: string;
  /** First day the item covers (local midnight). */
  start: Date;
  /** Last day the item covers (local midnight, >= start). */
  end: Date;
  color: string;
  /** True when the colour is a light shade → dark text. */
  light: boolean;
}

interface ColorOption {
  id: string;
  label: string;
}

/** Columns that can drive the item colour. */
function colorSourceOptions(columns: ColumnDefinition[]): ColorOption[] {
  const options: ColorOption[] = [{ id: "", label: "None" }];
  for (const column of columns) {
    if (
      column.type === "status" ||
      column.type === "priority" ||
      column.type === "dropdown" ||
      column.type === "multi_select" ||
      column.type === "person"
    ) {
      options.push({ id: column.id, label: column.label });
    }
  }
  options.push({ id: GROUP_COLOR_SOURCE, label: "Group" });
  return options;
}

/**
 * Resolve which column drives the item colour.
 *
 * `colorByColumnId` is the canonical setting. When it is missing we
 * fall back to the legacy `colorBy` union and finally to the first
 * Status column, which is the documented default.
 */
function resolveColorSourceId(
  settings: CalendarViewSettings,
  columns: ColumnDefinition[],
): string {
  if (typeof settings.colorByColumnId === "string") return settings.colorByColumnId;

  switch (settings.colorBy) {
    case "status":
      return columns.find((c) => c.type === "status")?.id ?? "";
    case "person":
      return columns.find((c) => c.type === "person")?.id ?? "";
    case "group":
      return GROUP_COLOR_SOURCE;
    default:
      break;
  }

  return columns.find((c) => c.type === "status")?.id ?? "";
}

function resolveItemColor(
  sourceId: string,
  record: BoardRecord,
  cellValues: Map<string, ColumnValue>,
  columns: ColumnDefinition[],
  groups: ViewRendererProps["groups"],
): string {
  if (!sourceId) return MONDAY.neutral;

  if (sourceId === GROUP_COLOR_SOURCE) {
    const group = groups.find((g) => g.id === record.groupId);
    return group?.color || getGroupFallbackColor(record.groupId ?? "");
  }

  const column = columns.find((c) => c.id === sourceId);
  if (!column) return MONDAY.neutral;

  const value = cellValues.get(`${record.id}:${column.id}`);

  if (column.type === "person") {
    return PERSON_COLORS[hashString(String(value ?? "")) % PERSON_COLORS.length];
  }

  const options = getColumnOptions(column);
  const option = findOptionForValue(options, value);
  if (option?.color) return option.color;
  if (option?.label) return getStatusColor(option.label);

  return getStatusColor(String(value ?? ""));
}

function buildSecondaryLabel(
  record: BoardRecord,
  cellValues: Map<string, ColumnValue>,
  settings: CalendarViewSettings,
  columns: ColumnDefinition[],
  groups: ViewRendererProps["groups"],
  boardName: string,
): string {
  for (const source of settings.labelBy) {
    if (source === "board") return boardName;
    if (source === "group") {
      return groups.find((g) => g.id === record.groupId)?.name ?? "";
    }
    const column = columns.find((c) => c.id === source);
    if (!column) continue;
    const raw = cellValues.get(`${record.id}:${column.id}`);
    if (raw === null || raw === undefined) continue;
    if (
      column.type === "status" ||
      column.type === "priority" ||
      column.type === "dropdown"
    ) {
      const option = findOptionForValue(getColumnOptions(column), raw);
      if (option?.label) return option.label;
      continue;
    }
    return String(raw);
  }
  return "";
}

interface BuiltItems {
  items: CalendarItem[];
  /** Rows whose date cell is empty. */
  unscheduled: BoardRecord[];
}

function buildCalendarItems(args: {
  records: BoardRecord[];
  cellValues: Map<string, ColumnValue>;
  dateColumnId: string;
  endDateColumnId: string;
  colorSourceId: string;
  settings: CalendarViewSettings;
  columns: ColumnDefinition[];
  groups: ViewRendererProps["groups"];
  boardName: string;
}): BuiltItems {
  const {
    records,
    cellValues,
    dateColumnId,
    endDateColumnId,
    colorSourceId,
    settings,
    columns,
    groups,
    boardName,
  } = args;

  const items: CalendarItem[] = [];
  const unscheduled: BoardRecord[] = [];

  if (!dateColumnId) {
    return { items, unscheduled: [...records] };
  }

  for (const record of records) {
    const rawDate = cellValues.get(`${record.id}:${dateColumnId}`);
    const start = parseCalendarDate(rawDate);

    if (!start) {
      unscheduled.push(record);
      continue;
    }

    let end = start;
    if (endDateColumnId) {
      const rawEnd = cellValues.get(`${record.id}:${endDateColumnId}`);
      const parsedEnd = parseCalendarDate(rawEnd);
      if (parsedEnd && parsedEnd.getTime() > start.getTime()) end = parsedEnd;
    }

    const color = resolveItemColor(colorSourceId, record, cellValues, columns, groups);

    const secondary = settings.hideItemNames
      ? ""
      : buildSecondaryLabel(record, cellValues, settings, columns, groups, boardName);

    const title = settings.hideItemNames
      ? ""
      : secondary
        ? `${record.title} · ${secondary}`
        : record.title;

    items.push({
      id: `item:${record.id}`,
      recordId: record.id,
      title,
      recordTitle: record.title,
      start,
      end,
      color,
      light: isLightColor(color),
    });
  }

  return { items, unscheduled };
}

// ── Row layout (multi-day bars) ─────────────────────────────

interface RowBar {
  item: CalendarItem;
  startCol: number;
  endCol: number;
  lane: number;
}

interface RowLayout {
  bars: RowBar[];
  /** Items that render as a chip inside a single cell. */
  chipsByColumn: CalendarItem[][];
  /** Every item that covers each column (chips + bars passing over it). */
  itemsByColumn: CalendarItem[][];
  /** Number of lanes used by the multi-day bars. */
  laneCount: number;
}

function computeRowLayout(week: Date[], items: CalendarItem[]): RowLayout {
  const chipsByColumn: CalendarItem[][] = week.map(() => []);
  const itemsByColumn: CalendarItem[][] = week.map(() => []);
  const bars: RowBar[] = [];

  const weekStart = week[0]?.getTime() ?? 0;
  const weekEnd = week[week.length - 1]?.getTime() ?? 0;

  for (const item of items) {
    const startTime = item.start.getTime();
    const endTime = item.end.getTime();
    if (endTime < weekStart || startTime > weekEnd) continue;

    // Every day the item covers inside this week.
    for (let index = 0; index < week.length; index++) {
      const day = week[index];
      if (day.getTime() >= startTime && day.getTime() <= endTime) {
        itemsByColumn[index]?.push(item);
      }
    }

    const firstInside = week.findIndex((day) => day.getTime() >= startTime);
    const startCol = firstInside === -1 ? 0 : firstInside;
    const lastCol = week.reduce(
      (acc, day, index) => (day.getTime() <= endTime ? index : acc),
      0,
    );
    const endCol = Math.min(week.length - 1, lastCol);

    if (endCol > startCol) {
      bars.push({ item, startCol, endCol, lane: 0 });
    } else {
      chipsByColumn[startCol]?.push(item);
    }
  }

  // Assign lanes so overlapping bars never sit on top of each other.
  // Sorting by start column keeps the greedy assignment correct.
  bars.sort((a, b) => a.startCol - b.startCol || a.endCol - b.endCol);
  const laneEnd: number[] = [];
  for (const bar of bars) {
    let lane = 0;
    while (lane < laneEnd.length && (laneEnd[lane] ?? -1) >= bar.startCol) lane += 1;
    laneEnd[lane] = bar.endCol;
    bar.lane = lane;
  }

  const laneCount = bars.length > 0 ? Math.max(...bars.map((bar) => bar.lane)) + 1 : 0;

  return { bars, chipsByColumn, itemsByColumn, laneCount };
}

// ── Pill ────────────────────────────────────────────────────

function CalendarPill({
  item,
  onClick,
  isEditing = false,
  onRename,
  className,
  style,
}: {
  item: CalendarItem;
  onClick?: () => void;
  isEditing?: boolean;
  onRename?: (title: string) => void;
  className?: string;
  style?: CSSProperties;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: item.id });

  const background = item.light ? tintColor(item.color, 0.86) : item.color;
  const textColor = item.light ? MONDAY.text : "#FFFFFF";
  const borderLeft = item.light ? `4px solid ${item.color}` : "4px solid transparent";

  if (isEditing) {
    return (
      <input
        autoFocus
        defaultValue={item.recordTitle || item.title}
        onFocus={(e) => e.currentTarget.select()}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            onRename?.(e.currentTarget.value);
          } else if (e.key === "Escape") {
            e.preventDefault();
            onRename?.(item.recordTitle || item.title);
          }
        }}
        onBlur={(e) => onRename?.(e.currentTarget.value)}
        className="h-6 w-full min-w-0 rounded-[4px] border border-[#0073EA] bg-white px-1.5 text-[12px] text-[#323338] outline-none"
      />
    );
  }

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          onClick?.();
        }
      }}
      title={item.title}
      className={cn(
        "flex h-6 w-full min-w-0 cursor-pointer items-center rounded-[4px] pr-1 pl-1.5 text-[12px] leading-none transition-[box-shadow,transform]",
        "hover:-translate-y-px hover:shadow-[0_2px_6px_rgba(0,0,0,0.18)]",
        isDragging && "opacity-40",
        className,
      )}
      style={{
        backgroundColor: background,
        color: textColor,
        borderLeft,
        touchAction: "none",
        ...style,
      }}
    >
      <span className="truncate">{item.title}</span>
    </div>
  );
}

// ── "+N more" popover ───────────────────────────────────────

function DayMorePopover({ items }: { items: CalendarItem[] }) {
  const hidden = items.length - MAX_INLINE_ITEMS;
  if (hidden <= 0) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="shrink-0 px-1 text-left text-[11px] font-medium text-[#0073EA] hover:underline"
        >
          +{hidden} more
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-[240px] rounded-[8px] p-2"
        style={{
          backgroundColor: "#ffffff",
          border: "1px solid #D0D4E4",
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.12)",
          color: MONDAY.text,
        }}
      >
        <div className="max-h-[220px] overflow-y-auto">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-2 rounded-[4px] px-1.5 py-1 text-[12px] hover:bg-[#F7F8FA]"
            >
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: item.color }}
                aria-hidden="true"
              />
              <span className="truncate">{item.title}</span>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── Day cell ────────────────────────────────────────────────

interface DayCellProps {
  day: Date;
  allItems: CalendarItem[];
  chips: CalendarItem[];
  isOutside: boolean;
  isWeekend: boolean;
  isFocused: boolean;
  topOffset: number;
  stripHeight: number;
  showDate: boolean;
  editingItemId: string | null;
  onDayClick: (day: Date) => void;
  onItemClick: (item: CalendarItem) => void;
  onCreateItem: (day: Date) => void;
  onRenameItem: (item: CalendarItem, title: string) => void;
}

function DayCell({
  day,
  allItems,
  chips,
  isOutside,
  isWeekend,
  isFocused,
  topOffset,
  stripHeight,
  showDate,
  editingItemId,
  onDayClick,
  onItemClick,
  onCreateItem,
  onRenameItem,
}: DayCellProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${toDayKey(day)}` });
  const isEmpty = allItems.length === 0;
  const visibleChips = chips.slice(0, MAX_INLINE_ITEMS);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "group relative flex min-h-0 flex-col border-r border-b",
        isOutside ? "bg-[#F1F2F5]" : isWeekend ? "bg-[#FAFAFB]" : "bg-white",
        isOver && "bg-[#E9F2FD]",
        isFocused && "ring-2 ring-[#0073EA] ring-inset",
      )}
      style={{ borderColor: MONDAY.border }}
    >
      <div
        className="flex shrink-0 items-start justify-between px-1 pt-0.5"
        style={{ height: stripHeight }}
      >
        {showDate ? (
          <button
            type="button"
            onClick={() => onDayClick(day)}
            className={cn(
              "flex size-6 items-center justify-center rounded-full text-[13px] font-medium",
              isToday(day) && "bg-[#0073EA] text-white",
              !isToday(day) && isOutside && "text-[#A8ADBD]",
              !isToday(day) && !isOutside && "text-[#323338]",
            )}
          >
            {format(day, "d")}
          </button>
        ) : (
          <span />
        )}

        {isEmpty && (
          <button
            type="button"
            onClick={() => onCreateItem(day)}
            aria-label={`Add an item on ${format(day, "MMMM d, yyyy")}`}
            className="flex size-5 items-center justify-center rounded-[4px] text-[#676879] opacity-0 transition-opacity group-hover:opacity-100 hover:bg-[#EDEFF2] focus-visible:opacity-100"
          >
            <Plus className="size-3.5" />
          </button>
        )}
      </div>

      <div
        className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-1 pb-1"
        style={{ paddingTop: topOffset }}
      >
        {visibleChips.map((item) => (
          <CalendarPill
            key={item.id}
            item={item}
            isEditing={editingItemId === item.id}
            onRename={(title) => onRenameItem(item, title)}
            onClick={() => onItemClick(item)}
          />
        ))}
        <DayMorePopover items={allItems} />
      </div>
    </div>
  );
}

// ── Week row (shared by month + week views) ─────────────────

interface WeekRowProps {
  week: Date[];
  items: CalendarItem[];
  currentMonth: Date;
  focusedDay: Date | null;
  editingItemId: string | null;
  showDate: boolean;
  onDayClick: (day: Date) => void;
  onItemClick: (item: CalendarItem) => void;
  onCreateItem: (day: Date) => void;
  onRenameItem: (item: CalendarItem, title: string) => void;
}

function WeekRow({
  week,
  items,
  currentMonth,
  focusedDay,
  editingItemId,
  showDate,
  onDayClick,
  onItemClick,
  onCreateItem,
  onRenameItem,
}: WeekRowProps) {
  const layout = useMemo(() => computeRowLayout(week, items), [week, items]);
  const stripHeight = showDate ? DATE_STRIP_HEIGHT : 0;
  const topOffset = stripHeight + layout.laneCount * BAR_SLOT_HEIGHT;

  return (
    <div className="relative grid min-h-0 grid-cols-7" style={{ gridColumn: "1 / -1" }}>
      {week.map((day, index) => (
        <DayCell
          key={day.toISOString()}
          day={day}
          allItems={layout.itemsByColumn[index] ?? []}
          chips={layout.chipsByColumn[index] ?? []}
          isOutside={!isSameMonth(day, currentMonth)}
          isWeekend={day.getDay() === 0 || day.getDay() === 6}
          isFocused={focusedDay ? isSameDay(day, focusedDay) : false}
          topOffset={topOffset}
          stripHeight={stripHeight}
          showDate={showDate}
          editingItemId={editingItemId}
          onDayClick={onDayClick}
          onItemClick={onItemClick}
          onCreateItem={onCreateItem}
          onRenameItem={onRenameItem}
        />
      ))}

      {layout.bars.map((bar) => (
        <div
          key={bar.item.id}
          className="absolute z-10"
          style={{
            left: `${(bar.startCol / week.length) * 100}%`,
            width: `${((bar.endCol - bar.startCol + 1) / week.length) * 100}%`,
            top: stripHeight + bar.lane * BAR_SLOT_HEIGHT,
            height: PILL_HEIGHT,
          }}
        >
          <CalendarPill
            item={bar.item}
            isEditing={editingItemId === bar.item.id}
            onRename={(title) => onRenameItem(bar.item, title)}
            onClick={() => onItemClick(bar.item)}
          />
        </div>
      ))}
    </div>
  );
}

// ── Unscheduled panel ───────────────────────────────────────

function UnscheduledPanel({
  records,
  onItemClick,
  onCollapse,
}: {
  records: BoardRecord[];
  onItemClick: (record: BoardRecord) => void;
  onCollapse: () => void;
}) {
  return (
    <aside
      className="flex w-[280px] shrink-0 flex-col border-l bg-white"
      style={{ borderColor: MONDAY.border }}
    >
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 px-3">
        <div className="flex min-w-0 items-center gap-2">
          <Inbox className="size-4 shrink-0" style={{ color: MONDAY.muted }} />
          <span
            className="truncate text-[13px] font-semibold"
            style={{ color: MONDAY.text }}
          >
            Unscheduled
          </span>
          <span
            className="rounded-full bg-[#F1F2F5] px-1.5 text-[11px] font-medium"
            style={{ color: MONDAY.muted }}
          >
            {records.length}
          </span>
        </div>
        <button
          type="button"
          onClick={onCollapse}
          aria-label="Collapse unscheduled panel"
          className="flex size-6 items-center justify-center rounded-[4px] hover:bg-[#F1F2F5]"
          style={{ color: MONDAY.muted }}
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {records.length === 0 ? (
          <p className="px-1 py-2 text-[12px]" style={{ color: MONDAY.muted }}>
            Every item is scheduled.
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {records.map((record) => (
              <UnscheduledRow
                key={record.id}
                record={record}
                onClick={() => onItemClick(record)}
              />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

function UnscheduledRow({
  record,
  onClick,
}: {
  record: BoardRecord;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `item:${record.id}`,
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          onClick();
        }
      }}
      className={cn(
        "flex h-6 w-full min-w-0 cursor-grab items-center rounded-[4px] border-l-4 border-[#C3C6D4] bg-[#F7F8FA] px-2 text-[12px] text-[#323338] transition-shadow hover:shadow-[0_2px_6px_rgba(0,0,0,0.14)]",
        isDragging && "opacity-40",
      )}
      style={{ touchAction: "none" }}
    >
      <span className="truncate">{record.title}</span>
    </div>
  );
}

// ── Agenda list (narrow screens) ────────────────────────────

function AgendaList({
  days,
  items,
  focusedDay,
  onDayClick,
  onItemClick,
}: {
  days: Date[];
  items: CalendarItem[];
  focusedDay: Date | null;
  onDayClick: (day: Date) => void;
  onItemClick: (item: CalendarItem) => void;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {days.map((day) => {
        const dayItems = items.filter(
          (item) =>
            item.start.getTime() <= day.getTime() && item.end.getTime() >= day.getTime(),
        );
        return (
          <div
            key={day.toISOString()}
            className={cn(
              "flex gap-3 border-b px-3 py-2",
              focusedDay && isSameDay(day, focusedDay) && "bg-[#E9F2FD]",
            )}
            style={{ borderColor: MONDAY.border }}
          >
            <button
              type="button"
              onClick={() => onDayClick(day)}
              className="flex w-14 shrink-0 flex-col items-start"
            >
              <span className="text-[11px] uppercase" style={{ color: MONDAY.muted }}>
                {format(day, "EEE")}
              </span>
              <span
                className={cn(
                  "flex size-6 items-center justify-center rounded-full text-[13px] font-medium",
                  isToday(day) ? "bg-[#0073EA] text-white" : "text-[#323338]",
                )}
              >
                {format(day, "d")}
              </span>
            </button>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              {dayItems.length === 0 ? (
                <span className="text-[12px]" style={{ color: MONDAY.muted }}>
                  No items
                </span>
              ) : (
                dayItems.map((item) => (
                  <CalendarPill
                    key={item.id}
                    item={item}
                    onClick={() => onItemClick(item)}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Viewport hook ───────────────────────────────────────────

function useViewportWidth(): number {
  const [width, setWidth] = useState<number>(() =>
    typeof window === "undefined" ? 1280 : window.innerWidth,
  );

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return width;
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
  onRecordCreate,
  onRecordTitleChange,
}: ViewRendererProps) {
  const calendarSettings = settings as CalendarViewSettings;
  const viewportWidth = useViewportWidth();

  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [mode, setMode] = useState<CalendarMode>(() => {
    if (calendarSettings.mode) return calendarSettings.mode;
    if (calendarSettings.defaultView === "week") return "week";
    if (calendarSettings.defaultView === "day") return "day";
    return "month";
  });
  const [showSettings, setShowSettings] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [unscheduledOpen, setUnscheduledOpen] = useState(true);
  const [focusedDay, setFocusedDay] = useState<Date | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [openItemRecordId, setOpenItemRecordId] = useState<string | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [activeFilters, setActiveFilters] = useState<
    Array<{ id: string; columnId: string; operator: string; value: ColumnValue }>
  >([]);

  const justDraggedRef = useRef(0);

  const weekStart = calendarSettings.weekStart ?? calendarSettings.firstDayOfWeek ?? 0;
  const dateColumnId =
    calendarSettings.dateColumnId ||
    calendarSettings.selectedDateColumns[0] ||
    columns.find((c) => c.type === "date" || c.type === "timeline")?.id ||
    "";
  const endDateColumnId =
    calendarSettings.endDateColumnId ||
    (calendarSettings.selectedDateColumns.length > 1
      ? calendarSettings.selectedDateColumns[1]
      : "");

  const dateColumns = useMemo(
    () => columns.filter((c) => c.type === "date" || c.type === "timeline"),
    [columns],
  );

  const colorSourceId = useMemo(
    () => resolveColorSourceId(calendarSettings, columns),
    [calendarSettings, columns],
  );
  const colorOptions = useMemo(() => colorSourceOptions(columns), [columns]);

  const built = useMemo(
    () =>
      buildCalendarItems({
        records,
        cellValues,
        dateColumnId,
        endDateColumnId,
        colorSourceId,
        settings: calendarSettings,
        columns,
        groups,
        boardName: board.name,
      }),
    [
      records,
      cellValues,
      dateColumnId,
      endDateColumnId,
      colorSourceId,
      calendarSettings,
      columns,
      groups,
      board.name,
    ],
  );

  // Apply the toolbar filters to the built items.
  const items = useMemo(() => {
    if (activeFilters.length === 0) return built.items;
    return built.items.filter((item) =>
      activeFilters.every((filter) => {
        if (filter.columnId === "__client_name") {
          const record = records.find((r) => r.id === item.recordId);
          if (!record) return false;
          const values = Array.isArray(filter.value) ? filter.value : [filter.value];
          if (values.length === 0 || (values.length === 1 && values[0] === ""))
            return true;
          return values.some(
            (v) => String(v).toLowerCase() === record.title.toLowerCase(),
          );
        }
        const column = columns.find((c) => c.id === filter.columnId);
        if (!column) return true;
        const cellValue = cellValues.get(`${item.recordId}:${filter.columnId}`);
        return evaluateFilter(cellValue, filter.operator, filter.value, column.type);
      }),
    );
  }, [built.items, activeFilters, records, columns, cellValues]);

  const unscheduledRecords = useMemo(() => {
    if (activeFilters.length === 0) return built.unscheduled;
    return built.unscheduled.filter((record) =>
      activeFilters.every((filter) => {
        if (filter.columnId === "__client_name") {
          const values = Array.isArray(filter.value) ? filter.value : [filter.value];
          if (values.length === 0 || (values.length === 1 && values[0] === ""))
            return true;
          return values.some(
            (v) => String(v).toLowerCase() === record.title.toLowerCase(),
          );
        }
        const column = columns.find((c) => c.id === filter.columnId);
        if (!column) return true;
        const cellValue = cellValues.get(`${record.id}:${filter.columnId}`);
        return evaluateFilter(cellValue, filter.operator, filter.value, column.type);
      }),
    );
  }, [built.unscheduled, activeFilters, columns, cellValues]);

  // ── Visible days ─────────────────────────────────────────

  const weeks = useMemo(() => {
    const gridStart = startOfWeek(startOfMonth(currentDate), { weekStartsOn: weekStart });
    const gridEnd = endOfWeek(endOfMonth(currentDate), { weekStartsOn: weekStart });
    const result: Date[][] = [];
    let cursor = gridStart;
    while (cursor.getTime() <= gridEnd.getTime()) {
      const week: Date[] = [];
      for (let i = 0; i < 7; i++) {
        week.push(cursor);
        cursor = addDays(cursor, 1);
      }
      result.push(week);
    }
    return result;
  }, [currentDate, weekStart]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(currentDate, { weekStartsOn: weekStart });
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [currentDate, weekStart]);

  /**
   * Narrow screens cannot show seven columns, so the calendar falls
   * back to an agenda list of the current week.
   */
  const isNarrow = viewportWidth < 768;
  const effectiveMode: CalendarMode = isNarrow ? "week" : mode;

  // ── Navigation ──────────────────────────────────────────

  const navigatePrev = useCallback(() => {
    setCurrentDate((d) => {
      if (effectiveMode === "month") return subMonths(d, 1);
      if (effectiveMode === "week") return subWeeks(d, 1);
      return addDays(d, -1);
    });
  }, [effectiveMode]);

  const navigateNext = useCallback(() => {
    setCurrentDate((d) => {
      if (effectiveMode === "month") return addMonths(d, 1);
      if (effectiveMode === "week") return addWeeks(d, 1);
      return addDays(d, 1);
    });
  }, [effectiveMode]);

  const navigateToday = useCallback(() => {
    const today = new Date();
    setCurrentDate(today);
    setFocusedDay(today);
  }, []);

  const handleModeChange = useCallback(
    (next: CalendarMode) => {
      setMode(next);
      onSettingsChange?.({ mode: next, defaultView: next });
    },
    [onSettingsChange],
  );

  const handleDateColumnChange = useCallback(
    (columnId: string) => {
      onSettingsChange?.({
        dateColumnId: columnId,
        selectedDateColumns: columnId ? [columnId] : [],
      });
    },
    [onSettingsChange],
  );

  const handleColorSourceChange = useCallback(
    (sourceId: string) => {
      onSettingsChange?.({
        colorByColumnId: sourceId,
        colorBy: colorSourceIdToLegacy(sourceId, columns),
      });
    },
    [onSettingsChange, columns],
  );

  // ── Item interactions ────────────────────────────────────

  const handleItemClick = useCallback((item: CalendarItem) => {
    // A click that lands right after a drag must not open the panel.
    if (Date.now() - justDraggedRef.current < 250) return;
    setOpenItemRecordId(item.recordId);
  }, []);

  const handleUnscheduledClick = useCallback((record: BoardRecord) => {
    if (Date.now() - justDraggedRef.current < 250) return;
    setOpenItemRecordId(record.id);
  }, []);

  const handleCreateItem = useCallback(
    async (day: Date) => {
      if (!dateColumnId) return;
      const dayKey = toDayKey(day);
      const created = await onRecordCreate?.({
        title: "",
        cellValues: { [dateColumnId]: dayKey },
      });
      if (created) {
        setEditingItemId(`item:${created.id}`);
        setOpenItemRecordId(null);
      }
    },
    [dateColumnId, onRecordCreate],
  );

  const handleRenameItem = useCallback(
    (item: CalendarItem, title: string) => {
      setEditingItemId((current) => (current === item.id ? null : current));
      const trimmed = title.trim();
      const current = item.recordTitle || item.title;
      if (!trimmed || trimmed === current) return;
      onRecordTitleChange?.(item.recordId, trimmed);
    },
    [onRecordTitleChange],
  );

  // ── Keyboard navigation ──────────────────────────────────

  const handleGridKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const step =
        event.key === "ArrowLeft"
          ? -1
          : event.key === "ArrowRight"
            ? 1
            : event.key === "ArrowUp"
              ? -7
              : event.key === "ArrowDown"
                ? 7
                : 0;

      if (step !== 0) {
        event.preventDefault();
        const base = focusedDay ?? currentDate;
        const next = addDays(base, step);
        setFocusedDay(next);
        if (effectiveMode === "month" && !isSameMonth(next, currentDate)) {
          setCurrentDate(next);
        } else if (effectiveMode === "week") {
          setCurrentDate(next);
        } else if (effectiveMode === "day") {
          setCurrentDate(next);
        }
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        const day = focusedDay ?? currentDate;
        const first = items.find(
          (item) =>
            item.start.getTime() <= day.getTime() && item.end.getTime() >= day.getTime(),
        );
        if (first) setOpenItemRecordId(first.recordId);
        return;
      }

      if (event.key === "Escape") {
        setFocusedDay(null);
        setEditingItemId(null);
      }
    },
    [focusedDay, currentDate, effectiveMode, items],
  );

  // ── Drag and drop ────────────────────────────────────────

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const collisionDetection: CollisionDetection = useCallback((args) => {
    const pointer = pointerWithin(args);
    if (pointer.length > 0) return pointer;
    return rectIntersection(args);
  }, []);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveDragId(null);
      justDraggedRef.current = Date.now();

      if (!over) return;
      const overId = String(over.id);
      if (!overId.startsWith("day:")) return;
      const dayKey = overId.slice("day:".length);
      const recordId = String(active.id).replace(/^item:/, "");
      if (!dateColumnId) return;
      onCellChange?.({ recordId, columnId: dateColumnId, value: dayKey });
    },
    [dateColumnId, onCellChange],
  );

  const activeDragItem = useMemo(() => {
    if (!activeDragId) return null;
    const scheduled = items.find((item) => item.id === activeDragId);
    if (scheduled) return scheduled;

    // An unscheduled row was picked up from the side panel.
    const recordId = activeDragId.replace(/^item:/, "");
    const record = records.find((entry) => entry.id === recordId);
    if (!record) return null;
    return {
      id: activeDragId,
      recordId: record.id,
      title: record.title,
      recordTitle: record.title,
      start: new Date(),
      end: new Date(),
      color: MONDAY.neutral,
      light: true,
    } satisfies CalendarItem;
  }, [activeDragId, items, records]);

  // ── Derived view data ────────────────────────────────────

  const periodLabel =
    effectiveMode === "month"
      ? format(currentDate, "MMMM yyyy")
      : effectiveMode === "week"
        ? `${format(weekDays[0] ?? currentDate, "MMM d")} – ${format(weekDays[6] ?? currentDate, "MMM d, yyyy")}`
        : format(currentDate, "EEEE, MMMM d, yyyy");

  const weekdayLabels = useMemo(() => {
    const reference = startOfWeek(new Date(), { weekStartsOn: weekStart });
    return Array.from({ length: 7 }, (_, i) => format(addDays(reference, i), "EEE"));
  }, [weekStart]);

  const openRecord = useMemo(
    () => records.find((record) => record.id === openItemRecordId) ?? null,
    [records, openItemRecordId],
  );

  if (!dateColumnId) {
    return (
      <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-2 bg-white px-6 text-center">
        <p className="text-[15px] font-medium" style={{ color: MONDAY.text }}>
          Add a date column to use the calendar view
        </p>
        <p className="text-[13px]" style={{ color: MONDAY.muted }}>
          Pick a column of type Date or Timeline and this view will lay your items out on
          a calendar.
        </p>
      </div>
    );
  }

  const toolbarButtonClass =
    "flex h-8 items-center gap-1.5 rounded-[4px] px-2 text-[13px] font-medium transition-colors";

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveDragId(null)}
    >
      <div
        className="flex h-full min-h-0 flex-col overflow-hidden bg-white"
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          setOpenItemRecordId(null);
          setEditingItemId(null);
        }}
      >
        {/* ── Toolbar ──────────────────────────────────── */}
        <div
          className="flex min-h-12 shrink-0 flex-wrap items-center gap-2 border-b px-3 py-1.5"
          style={{ borderColor: MONDAY.border }}
        >
          <span
            className="mr-1 truncate text-[15px] font-semibold"
            style={{ color: MONDAY.text }}
          >
            {view.name}
          </span>

          <button
            type="button"
            onClick={navigateToday}
            className={cn(
              toolbarButtonClass,
              "border transition-colors hover:bg-[#F7F8FA]",
            )}
            style={{ borderColor: MONDAY.inputBorder, color: MONDAY.text }}
          >
            Today
          </button>

          <div className="flex items-center">
            <button
              type="button"
              onClick={navigatePrev}
              aria-label="Previous period"
              className="flex size-7 items-center justify-center rounded-[4px] transition-colors hover:bg-[#F1F2F5]"
              style={{ color: MONDAY.text }}
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              onClick={navigateNext}
              aria-label="Next period"
              className="flex size-7 items-center justify-center rounded-[4px] transition-colors hover:bg-[#F1F2F5]"
              style={{ color: MONDAY.text }}
            >
              <ChevronRight className="size-4" />
            </button>
          </div>

          <span className="text-[15px] font-semibold" style={{ color: MONDAY.text }}>
            {periodLabel}
          </span>

          <div className="flex-1" />

          {/* Day | Week | Month */}
          {!isNarrow && (
            <div className="flex items-center rounded-[4px] bg-[#F1F2F5] p-0.5">
              {(["day", "week", "month"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => handleModeChange(option)}
                  className={cn(
                    "h-7 rounded-[4px] px-3 text-[13px] font-medium capitalize transition-colors",
                    mode === option
                      ? "bg-white text-[#323338] shadow-[0_1px_2px_rgba(0,0,0,0.12)]"
                      : "text-[#676879] hover:text-[#323338]",
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
          )}

          {/* Filter */}
          <button
            type="button"
            onClick={() => setShowFilters((open) => !open)}
            className={cn(toolbarButtonClass, "hover:bg-[#F1F2F5]")}
            style={{ color: activeFilters.length > 0 ? MONDAY.accent : MONDAY.muted }}
          >
            <Filter className="size-3.5" />
            <span className="hidden sm:inline">Filter</span>
            {activeFilters.length > 0 && (
              <span
                className="flex size-4 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                style={{ backgroundColor: MONDAY.accent }}
              >
                {activeFilters.length}
              </span>
            )}
          </button>

          {/* Color by */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(toolbarButtonClass, "hover:bg-[#F1F2F5]")}
                style={{ color: MONDAY.muted }}
              >
                <span className="hidden sm:inline">Color by</span>
                <span style={{ color: MONDAY.text }}>
                  {colorOptions.find((option) => option.id === colorSourceId)?.label ??
                    "None"}
                </span>
                <ChevronDown className="size-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {colorOptions.map((option) => (
                <DropdownMenuItem
                  key={option.id || "none"}
                  onSelect={() => handleColorSourceChange(option.id)}
                  className="text-[13px]"
                >
                  {option.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Date column */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(toolbarButtonClass, "hover:bg-[#F1F2F5]")}
                style={{ color: MONDAY.muted }}
              >
                <span className="hidden sm:inline">Date column</span>
                <span style={{ color: MONDAY.text }}>
                  {dateColumns.find((c) => c.id === dateColumnId)?.label ?? "Select"}
                </span>
                <ChevronDown className="size-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {dateColumns.length === 0 ? (
                <DropdownMenuItem disabled className="text-[13px]">
                  No date columns
                </DropdownMenuItem>
              ) : (
                dateColumns.map((column) => (
                  <DropdownMenuItem
                    key={column.id}
                    onSelect={() => handleDateColumnChange(column.id)}
                    className="text-[13px]"
                  >
                    {column.label}
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <button
            type="button"
            onClick={() => setShowSettings((open) => !open)}
            aria-label="Calendar settings"
            className={cn(
              "flex size-8 items-center justify-center rounded-[4px] transition-colors hover:bg-[#F1F2F5]",
              showSettings && "bg-[#F1F2F5]",
            )}
            style={{ color: MONDAY.muted }}
          >
            <Settings className="size-4" />
          </button>
        </div>

        {/* ── Body ─────────────────────────────────────── */}
        <div className="flex min-h-0 flex-1">
          <div
            className="flex min-w-0 flex-1 flex-col"
            onKeyDown={handleGridKeyDown}
            tabIndex={0}
            role="application"
            aria-label="Calendar"
          >
            {isNarrow ? (
              <AgendaList
                days={weekDays}
                items={items}
                focusedDay={focusedDay}
                onDayClick={(day) => setFocusedDay(day)}
                onItemClick={handleItemClick}
              />
            ) : (
              <>
                {effectiveMode === "month" && (
                  <div className="flex min-h-0 flex-1 flex-col">
                    <div
                      className="grid shrink-0 border-b"
                      style={{
                        gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
                        borderColor: MONDAY.border,
                      }}
                    >
                      {weekdayLabels.map((label, index) => (
                        <div
                          key={label}
                          className="px-2 py-1.5 text-[11px] font-medium tracking-wide uppercase"
                          style={{
                            color: MONDAY.muted,
                            borderRight:
                              index < 6 ? `1px solid ${MONDAY.border}` : undefined,
                          }}
                        >
                          {label}
                        </div>
                      ))}
                    </div>

                    <div
                      className="grid min-h-0 flex-1"
                      style={{
                        gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
                        gridTemplateRows: `repeat(${weeks.length}, minmax(0, 1fr))`,
                      }}
                    >
                      {weeks.map((week) => (
                        <WeekRow
                          key={week[0]?.toISOString()}
                          week={week}
                          items={items}
                          currentMonth={currentDate}
                          focusedDay={focusedDay}
                          editingItemId={editingItemId}
                          showDate
                          onDayClick={(day) => {
                            setFocusedDay(day);
                          }}
                          onItemClick={handleItemClick}
                          onCreateItem={handleCreateItem}
                          onRenameItem={handleRenameItem}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {effectiveMode === "week" && (
                  <div className="flex min-h-0 flex-1 flex-col">
                    <div
                      className="grid shrink-0 border-b"
                      style={{
                        gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
                        borderColor: MONDAY.border,
                      }}
                    >
                      {weekDays.map((day, index) => (
                        <div
                          key={day.toISOString()}
                          className={cn(
                            "flex items-center justify-center gap-1.5 py-1.5",
                            focusedDay && isSameDay(day, focusedDay) && "bg-[#E9F2FD]",
                          )}
                          style={{
                            borderRight:
                              index < 6 ? `1px solid ${MONDAY.border}` : undefined,
                          }}
                        >
                          <span
                            className="text-[11px] font-medium uppercase"
                            style={{ color: MONDAY.muted }}
                          >
                            {format(day, "EEE")}
                          </span>
                          <span
                            className={cn(
                              "flex size-6 items-center justify-center rounded-full text-[13px] font-medium",
                              isToday(day) ? "bg-[#0073EA] text-white" : "text-[#323338]",
                            )}
                          >
                            {format(day, "d")}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div
                      className="grid min-h-0 flex-1"
                      style={{ gridTemplateRows: "minmax(0, 1fr)" }}
                    >
                      <WeekRow
                        week={weekDays}
                        items={items}
                        currentMonth={currentDate}
                        focusedDay={focusedDay}
                        editingItemId={editingItemId}
                        showDate={false}
                        onDayClick={(day) => setFocusedDay(day)}
                        onItemClick={handleItemClick}
                        onCreateItem={handleCreateItem}
                        onRenameItem={handleRenameItem}
                      />
                    </div>
                  </div>
                )}

                {effectiveMode === "day" && (
                  <div className="flex min-h-0 flex-1 flex-col">
                    <div
                      className="flex shrink-0 items-center gap-2 border-b px-3 py-2"
                      style={{ borderColor: MONDAY.border }}
                    >
                      <span
                        className="text-[15px] font-semibold"
                        style={{ color: MONDAY.text }}
                      >
                        {format(currentDate, "EEEE, MMMM d")}
                      </span>
                      <span className="text-[13px]" style={{ color: MONDAY.muted }}>
                        {
                          items.filter(
                            (item) =>
                              item.start.getTime() <= currentDate.getTime() &&
                              item.end.getTime() >= currentDate.getTime(),
                          ).length
                        }{" "}
                        item(s)
                      </span>
                    </div>
                    <AgendaList
                      days={[currentDate]}
                      items={items}
                      focusedDay={focusedDay}
                      onDayClick={(day) => setFocusedDay(day)}
                      onItemClick={handleItemClick}
                    />
                  </div>
                )}
              </>
            )}
          </div>

          {/* Unscheduled panel */}
          {unscheduledOpen && (
            <UnscheduledPanel
              records={unscheduledRecords}
              onItemClick={handleUnscheduledClick}
              onCollapse={() => setUnscheduledOpen(false)}
            />
          )}
          {!unscheduledOpen && (
            <button
              type="button"
              onClick={() => setUnscheduledOpen(true)}
              className="flex w-8 shrink-0 items-start justify-center border-l py-3"
              style={{ borderColor: MONDAY.border, color: MONDAY.muted }}
              aria-label="Show unscheduled items"
            >
              <Inbox className="size-4" />
            </button>
          )}

          {/* Settings panel */}
          {showSettings && (
            <CalendarSettingsPanel
              settings={calendarSettings}
              columns={columns}
              groups={groups}
              onSettingsChange={onSettingsChange || (() => {})}
              onClose={() => setShowSettings(false)}
            />
          )}

          {/* Item detail panel */}
          {openRecord && (
            <CalendarItemPanel
              record={openRecord}
              columns={columns}
              cellValues={cellValues}
              onCellChange={onCellChange}
              onTitleChange={onRecordTitleChange}
              onClose={() => setOpenItemRecordId(null)}
            />
          )}
        </div>

        {/* Advanced filter panel */}
        {showFilters && (
          <AdvancedFilterPanel
            columns={columns}
            records={records}
            cellValues={cellValues}
            onClose={() => setShowFilters(false)}
            onApply={(filters) => {
              setActiveFilters(filters);
              setShowFilters(false);
            }}
          />
        )}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeDragItem ? (
          <div
            className="flex h-6 items-center rounded-[4px] pr-1 pl-1.5 text-[12px] leading-none shadow-[0_4px_12px_rgba(0,0,0,0.24)]"
            style={{
              backgroundColor: activeDragItem.light
                ? tintColor(activeDragItem.color, 0.86)
                : activeDragItem.color,
              color: activeDragItem.light ? MONDAY.text : "#FFFFFF",
              borderLeft: activeDragItem.light
                ? `4px solid ${activeDragItem.color}`
                : "4px solid transparent",
            }}
          >
            <span className="truncate">{activeDragItem.title}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

// ── Helpers ─────────────────────────────────────────────────

/** Map a canonical colour source back onto the legacy `colorBy` union. */
function colorSourceIdToLegacy(
  sourceId: string,
  columns: ColumnDefinition[],
): CalendarViewSettings["colorBy"] {
  if (!sourceId) return "none";
  if (sourceId === GROUP_COLOR_SOURCE) return "group";
  const column = columns.find((c) => c.id === sourceId);
  if (!column) return "none";
  if (column.type === "person") return "person";
  if (column.type === "status") return "status";
  return "none";
}

// ── Filter evaluation logic ─────────────────────────────────

function evaluateFilter(
  cellValue: ColumnValue | undefined,
  operator: string,
  filterValue: ColumnValue,
  columnType: string,
): boolean {
  if (operator === "is_empty") return cellValue == null || cellValue === "";
  if (operator === "not_empty") return cellValue != null && cellValue !== "";

  if (cellValue == null) return false;

  const cellStr = String(cellValue).toLowerCase();
  const filterStr = String(filterValue).toLowerCase();

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
  filterValue: ColumnValue,
): boolean {
  const date = parseCalendarDate(cellValue);
  if (!date) return false;

  const today = startOfLocalDay(new Date());

  if (operator === "between") {
    const dates = Array.isArray(filterValue) ? filterValue : [filterValue, ""];
    const start = parseCalendarDate(dates[0]);
    const end = parseCalendarDate(dates[1]);
    if (!start && !end) return true;
    const time = date.getTime();
    if (start && time < start.getTime()) return false;
    if (end && time > end.getTime()) return false;
    return true;
  }

  switch (operator) {
    case "is": {
      const target = parseCalendarDate(filterValue);
      return target ? isSameDay(date, target) : false;
    }
    case "is_not": {
      const target = parseCalendarDate(filterValue);
      return target ? !isSameDay(date, target) : false;
    }
    case "before": {
      const target = parseCalendarDate(filterValue);
      return target ? date.getTime() < target.getTime() : false;
    }
    case "after": {
      const target = parseCalendarDate(filterValue);
      return target ? date.getTime() > target.getTime() : false;
    }
    case "overdue":
      return date.getTime() < today.getTime();
    case "today":
      return isSameDay(date, today);
    case "this_week": {
      const start = startOfWeek(today, { weekStartsOn: 0 });
      const end = endOfWeek(today, { weekStartsOn: 0 });
      return date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
    }
    case "this_month": {
      const start = startOfMonth(today);
      const end = endOfMonth(today);
      return date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
    }
    case "next_month": {
      const start = startOfMonth(addMonths(today, 1));
      const end = endOfMonth(addMonths(today, 1));
      return date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
    }
    case "last_month": {
      const start = startOfMonth(subMonths(today, 1));
      const end = endOfMonth(subMonths(today, 1));
      return date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
    }
    default:
      return true;
  }
}
