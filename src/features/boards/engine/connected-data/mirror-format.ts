/**
 * Mirror Column — Pure Resolution Logic
 *
 * Framework-free helpers that turn a list of raw source values (read from the
 * connected board(s)) into a single displayable result. Kept separate from the
 * React renderer so the aggregation math is unit-testable without a DOM.
 *
 * ── Aggregation modes (stored in display_config.aggregation) ─────────
 *   Numbers : "sum" | "average" | "min" | "max" | "median" | "count"
 *   Dates   : "earliest" | "latest" | "range"
 *   Text/Status : "list" | "count" | "filter"
 *   null    : single-item mirror — display the raw value as-is.
 */

import type { ColumnValue } from "../types";

export const NUMBER_AGGREGATIONS = [
  "sum",
  "average",
  "min",
  "max",
  "median",
  "count",
] as const;
export type NumberAggregation = (typeof NUMBER_AGGREGATIONS)[number];

export const DATE_AGGREGATIONS = ["earliest", "latest", "range"] as const;
export type DateAggregation = (typeof DATE_AGGREGATIONS)[number];

export const TEXT_AGGREGATIONS = ["list", "count", "filter"] as const;
export type TextAggregation = (typeof TEXT_AGGREGATIONS)[number];

export type AggregationMode =
  | NumberAggregation
  | DateAggregation
  | TextAggregation;

export function isNumberAggregation(mode: string): mode is NumberAggregation {
  return (NUMBER_AGGREGATIONS as readonly string[]).includes(mode);
}

export function isDateAggregation(mode: string): mode is DateAggregation {
  return (DATE_AGGREGATIONS as readonly string[]).includes(mode);
}

export function isTextAggregation(mode: string): mode is TextAggregation {
  return (TEXT_AGGREGATIONS as readonly string[]).includes(mode);
}

/** Coerce a ColumnValue to a number for aggregation. Returns NaN if not numeric. */
export function toNumber(value: ColumnValue): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return NaN;
}

/** Human-readable label for an aggregation mode (used in tooltips/settings). */
export function aggregationLabel(mode: AggregationMode): string {
  switch (mode) {
    case "sum":
      return "Sum";
    case "average":
      return "Average";
    case "min":
      return "Min";
    case "max":
      return "Max";
    case "median":
      return "Median";
    case "count":
      return "Count";
    case "earliest":
      return "Earliest";
    case "latest":
      return "Latest";
    case "range":
      return "Range";
    case "list":
      return "List";
    case "filter":
      return "Filter (count matching)";
    default:
      return mode;
  }
}

export interface AggregateResult {
  /** The computed display value. */
  display: ColumnValue;
  /** Short descriptor of how it was computed, e.g. "Sum", "3 items". */
  detail: string;
}

/**
 * Aggregate a list of raw source values using the given mode.
 *
 * @param values   raw values read from the mirrored column on the connected board(s)
 * @param mode     aggregation mode (number/date/text). Caller is responsible for
 *                 picking a mode compatible with the mirrored column's type.
 * @param filterValue  optional filter target used by the text "filter" mode.
 */
export function aggregateValues(
  values: ColumnValue[],
  mode: string,
  filterValue?: string | null,
): AggregateResult {
  const defined = values.filter((v) => v !== null && v !== undefined);

  // "count" is type-agnostic: how many non-null values, regardless of their
  // shape. Handle it before the type-specific branches so it works for text,
  // numbers, and dates alike.
  if (mode === "count") {
    return { display: defined.length, detail: `${defined.length} items` };
  }

  if (isNumberAggregation(mode)) {
    const nums = defined.map(toNumber).filter((n) => !Number.isNaN(n));
    if (nums.length === 0) return { display: null, detail: "—" };
    switch (mode) {
      case "sum":
        return { display: nums.reduce((a, b) => a + b, 0), detail: "Sum" };
      case "average": {
        const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
        return { display: round(avg), detail: "Average" };
      }
      case "min":
        return { display: Math.min(...nums), detail: "Min" };
      case "max":
        return { display: Math.max(...nums), detail: "Max" };
      case "median":
        return { display: median(nums), detail: "Median" };
    }
  }

  if (isDateAggregation(mode)) {
    const dates = defined
      .map((v) => (typeof v === "string" ? v : String(v)))
      .filter((d) => !Number.isNaN(Date.parse(d)))
      .sort();
    if (dates.length === 0) return { display: null, detail: "—" };
    if (mode === "earliest") return { display: dates[0], detail: "Earliest" };
    if (mode === "latest") return { display: dates[dates.length - 1], detail: "Latest" };
    // range
    if (dates.length === 1) return { display: dates[0], detail: "Range" };
    return { display: `${dates[0]} – ${dates[dates.length - 1]}`, detail: "Range" };
  }

  // text / status (default to list behaviour for unknown modes)
  const labels = defined.map((v) => (typeof v === "string" ? v : String(v)));
  if (mode === "filter") {
    const target = filterValue ?? "";
    const matching = labels.filter((l) => l === target).length;
    return { display: matching, detail: `${matching} of ${labels.length} = ${target}` };
  }
  // list (default)
  const unique = [...new Set(labels)];
  return { display: unique.join(", "), detail: `${unique.length} values` };
}

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : round((sorted[mid - 1] + sorted[mid]) / 2);
}

function round(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/**
 * Pick a sensible default aggregation for a column type when the user hasn't
 * chosen one. Numbers → sum, Dates → latest, Text/Status → list.
 */
export function defaultAggregationForType(
  type: ColumnDefinition["type"] | undefined,
): AggregationMode {
  switch (type) {
    case "number":
    case "currency":
    case "rating":
    case "progress":
      return "sum";
    case "date":
    case "timeline":
      return "latest";
    default:
      return "list";
  }
}

import type { ColumnDefinition } from "../types";
