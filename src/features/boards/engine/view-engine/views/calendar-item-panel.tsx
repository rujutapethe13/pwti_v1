"use client";

/**
 * Calendar Item Panel
 *
 * The detail panel a calendar item opens when it is clicked. It shows
 * the record title (editable) and every visible column with its value,
 * mirroring what a table row shows when it is opened.
 *
 * The panel is intentionally self-contained: it reads the record from
 * the board data it is handed and writes changes back through the
 * same `onCellChange` / `onTitleChange` callbacks the table view
 * uses, so the calendar never mutates data on its own.
 */

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";
import type { BoardRecord, ColumnDefinition, ColumnValue } from "../../types";
import { findOptionForValue, getColumnOptions } from "../../lib/option-lookup";

const MONDAY = {
  text: "#323338",
  muted: "#676879",
  border: "#D0D4E4",
  accent: "#0073EA",
  hover: "#F7F8FA",
} as const;

interface CalendarItemPanelProps {
  record: BoardRecord;
  columns: ColumnDefinition[];
  cellValues: Map<string, ColumnValue>;
  onCellChange?: (args: {
    recordId: string;
    columnId: string;
    value: ColumnValue;
  }) => void;
  onTitleChange?: (recordId: string, title: string) => void;
  onClose: () => void;
}

function formatValue(column: ColumnDefinition, value: ColumnValue | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (entry && typeof entry === "object") {
          const option = findOptionForValue(getColumnOptions(column), entry);
          return option?.label ?? "";
        }
        const option = findOptionForValue(getColumnOptions(column), entry);
        return option?.label ?? String(entry);
      })
      .filter(Boolean)
      .join(", ");
  }
  if (typeof value === "object") {
    const label = (value as Record<string, unknown>).label;
    if (typeof label === "string" && label) return label;
    return JSON.stringify(value);
  }
  if (
    column.type === "status" ||
    column.type === "priority" ||
    column.type === "dropdown" ||
    column.type === "multi_select"
  ) {
    const option = findOptionForValue(getColumnOptions(column), value);
    if (option?.label) return option.label;
  }
  return String(value);
}

function optionColor(
  column: ColumnDefinition,
  value: ColumnValue | undefined,
): string | undefined {
  if (
    column.type !== "status" &&
    column.type !== "priority" &&
    column.type !== "dropdown" &&
    column.type !== "multi_select"
  ) {
    return undefined;
  }
  const option = findOptionForValue(getColumnOptions(column), value);
  return option?.color;
}

/** `YYYY-MM-DD` for a date input, or an empty string. */
function dateInputValue(value: ColumnValue | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const raw = String(value);
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(raw);
  if (match) return match[1];
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  const month = `${parsed.getMonth() + 1}`.padStart(2, "0");
  const day = `${parsed.getDate()}`.padStart(2, "0");
  return `${parsed.getFullYear()}-${month}-${day}`;
}

export function CalendarItemPanel({
  record,
  columns,
  cellValues,
  onCellChange,
  onTitleChange,
  onClose,
}: CalendarItemPanelProps) {
  const [title, setTitle] = useState(record.title);

  useEffect(() => {
    setTitle(record.title);
  }, [record.id, record.title]);

  const visibleColumns = useMemo(
    () => columns.filter((column) => !column.hidden),
    [columns],
  );

  return (
    <aside
      className="flex h-full w-[320px] shrink-0 flex-col border-l bg-white"
      style={{ borderColor: MONDAY.border }}
      aria-label="Item details"
    >
      <div
        className="flex h-12 shrink-0 items-center justify-between gap-2 px-3"
        style={{ borderColor: MONDAY.border }}
      >
        <span className="text-[13px] font-semibold" style={{ color: MONDAY.text }}>
          Item details
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close item details"
          className="flex size-6 items-center justify-center rounded-[4px] transition-colors hover:bg-[#F1F2F5]"
          style={{ color: MONDAY.muted }}
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="border-b px-3 py-3" style={{ borderColor: MONDAY.border }}>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onTitleChange?.(record.id, title.trim() || record.title);
              }
            }}
            onBlur={() => {
              const next = title.trim();
              if (next && next !== record.title) onTitleChange?.(record.id, next);
            }}
            aria-label="Item name"
            className="h-8 w-full rounded-[4px] border border-transparent px-2 text-[14px] font-semibold transition-colors outline-none hover:border-[#D0D4E4] focus:border-[#0073EA]"
            style={{ color: MONDAY.text }}
          />
        </div>

        <dl>
          {visibleColumns.map((column) => {
            const value = cellValues.get(`${record.id}:${column.id}`);
            const color = optionColor(column, value);
            return (
              <div
                key={column.id}
                className="flex items-start gap-3 border-b px-3 py-2"
                style={{ borderColor: MONDAY.border }}
              >
                <dt
                  className="w-[110px] shrink-0 truncate text-[12px]"
                  style={{ color: MONDAY.muted }}
                >
                  {column.label}
                </dt>
                <dd className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px]">
                  {color && (
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: color }}
                      aria-hidden="true"
                    />
                  )}
                  {column.type === "date" || column.type === "timeline" ? (
                    <input
                      type="date"
                      value={dateInputValue(value)}
                      onChange={(event) =>
                        onCellChange?.({
                          recordId: record.id,
                          columnId: column.id,
                          value: event.target.value || null,
                        })
                      }
                      aria-label={column.label}
                      className="h-7 w-full min-w-0 rounded-[4px] border border-transparent bg-transparent px-1 text-[13px] transition-colors outline-none hover:border-[#D0D4E4] focus:border-[#0073EA]"
                      style={{ color: value ? MONDAY.text : MONDAY.muted }}
                    />
                  ) : (
                    <span
                      className={cn("truncate")}
                      style={{ color: value ? MONDAY.text : MONDAY.muted }}
                    >
                      {formatValue(column, value)}
                    </span>
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      </div>
    </aside>
  );
}
