/**
 * Time range presets shared by the Activity/Overview page and the query layer.
 *
 * The selector never slices a fixed dataset: it resolves a preset to a concrete
 * `from`/`to` window, and that window is sent to the query layer (`/api/overview`)
 * so every section on the page is re-queried for the selected range.
 */

export const TIME_RANGE_IDS = [
  "today",
  "7d",
  "15d",
  "30d",
  "90d",
  "6m",
  "1y",
  "all",
  "custom",
] as const;

export type TimeRangeId = (typeof TIME_RANGE_IDS)[number];

/** The concrete bounds a "custom" selection resolved to. */
export interface CustomRange {
  from: string;
  to: string;
}

export interface TimeRangePreset {
  id: TimeRangeId;
  label: string;
  /** Compact label for tight layouts. */
  shortLabel: string;
  /** Number of days the window spans, used for delta comparisons and bucket sizing. */
  days: number;
  /** Resolves the preset to a concrete window ending on `to` (inclusive). */
  resolve: (to: Date) => { from: Date; to: Date };
}

export const DEFAULT_TIME_RANGE_ID: TimeRangeId = "7d";

export const ALL_TIME_LABEL = "All time";
export const CUSTOM_LABEL = "Custom range";

/**
 * The window "All time" resolves to before the real data bounds are known.
 *
 * Deliberately not the Unix epoch: a `date` column holding a studio's history
 * is a few decades wide, and starting at year 1 would build thousands of empty
 * buckets. The server narrows this to the earliest actual `job_date` via
 * `overview_data_bounds` before the window is used.
 */
export const ALL_TIME_SENTINEL_FROM = "1900-01-01";

function subtractDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() - days);
  return next;
}

function subtractMonths(date: Date, months: number): Date {
  const next = new Date(date);
  const day = next.getDate();
  next.setDate(1);
  next.setMonth(next.getMonth() - months);
  const lastDayOfTarget = new Date(
    next.getFullYear(),
    next.getMonth() + 1,
    0,
  ).getDate();
  next.setDate(Math.min(day, lastDayOfTarget));
  return next;
}

/** Inclusive number of days between two dates, both at local midnight. */
export function daysInclusive(from: Date, to: Date): number {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

function dayWindow(days: number) {
  return (to: Date) => ({ from: subtractDays(to, days - 1), to: new Date(to) });
}

export const TIME_RANGE_PRESETS: readonly TimeRangePreset[] = [
  { id: "today", label: "Today", shortLabel: "1D", days: 1, resolve: dayWindow(1) },
  { id: "7d", label: "Last 7 days", shortLabel: "7D", days: 7, resolve: dayWindow(7) },
  { id: "15d", label: "Last 15 days", shortLabel: "15D", days: 15, resolve: dayWindow(15) },
  { id: "30d", label: "Last 30 days", shortLabel: "30D", days: 30, resolve: dayWindow(30) },
  { id: "90d", label: "Last 90 days", shortLabel: "90D", days: 90, resolve: dayWindow(90) },
  {
    id: "6m",
    label: "Last 6 months",
    shortLabel: "6M",
    days: 183,
    resolve: (to) => ({ from: subtractMonths(to, 6), to: new Date(to) }),
  },
  {
    id: "1y",
    label: "Last 1 year",
    shortLabel: "1Y",
    days: 366,
    resolve: (to) => ({ from: subtractMonths(to, 12), to: new Date(to) }),
  },
  {
    id: "all",
    label: ALL_TIME_LABEL,
    shortLabel: "ALL",
    // Not a real span — "All time" is narrowed to the data's own bounds by the
    // server before the window reaches a query. This value only decides that a
    // monthly bucket is the right granularity.
    days: 36500,
    resolve: (to) => ({ from: new Date(ALL_TIME_SENTINEL_FROM), to: new Date(to) }),
  },
  {
    id: "custom",
    label: CUSTOM_LABEL,
    shortLabel: "CUSTOM",
    days: 1,
    // Never resolved directly: a custom range always carries explicit bounds
    // from the picker. This is the fallback if those bounds are missing or
    // malformed, which keeps a bad request from widening into an open scan.
    resolve: dayWindow(1),
  },
] as const;

export function isTimeRangeId(value: unknown): value is TimeRangeId {
  return (
    typeof value === "string" &&
    (TIME_RANGE_IDS as readonly string[]).includes(value)
  );
}

export function getTimeRangePreset(id: TimeRangeId): TimeRangePreset {
  return (
    TIME_RANGE_PRESETS.find((preset) => preset.id === id) ??
    TIME_RANGE_PRESETS.find((preset) => preset.id === DEFAULT_TIME_RANGE_ID)!
  );
}

export interface ResolvedTimeRange {
  id: TimeRangeId;
  label: string;
  /** Inclusive `YYYY-MM-DD` bounds in the business timezone. */
  from: string;
  to: string;
  /** Inclusive day count of the window. */
  days: number;
}

export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function resolveTimeRange(
  id: TimeRangeId,
  today: Date = new Date(),
): ResolvedTimeRange {
  const preset = getTimeRangePreset(id);
  const { from, to } = preset.resolve(today);
  return {
    id: preset.id,
    label: preset.label,
    from: toDateKey(from),
    to: toDateKey(to),
    days: daysInclusive(from, to),
  };
}

/**
 * Resolves the window for a selection, applying the caller's custom bounds when
 * the selection is "custom".
 *
 * Kept separate from `resolveTimeRange` because the preset list has no knowledge
 * of picker state: a custom range is only ever as wide as the days the user
 * chose, and its day count must be real so bucket sizing and the prior-period
 * comparison stay correct.
 */
export function resolveSelectedTimeRange(
  id: TimeRangeId,
  custom?: CustomRange | null,
  today: Date = new Date(),
): ResolvedTimeRange {
  if (id === "custom" && custom && isDateKey(custom.from) && isDateKey(custom.to)) {
    const from = custom.from <= custom.to ? custom.from : custom.to;
    const to = custom.from <= custom.to ? custom.to : custom.from;
    return {
      id: "custom",
      label: `${CUSTOM_LABEL}: ${from} – ${to}`,
      from,
      to,
      days: daysInclusive(
        new Date(`${from}T00:00:00`),
        new Date(`${to}T00:00:00`),
      ),
    };
  }
  return resolveTimeRange(id, today);
}

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Inclusive UTC bounds for a `YYYY-MM-DD` day key, for timestamp columns. */
export function toTimestampBounds(range: { from: string; to: string }): {
  fromIso: string;
  toIso: string;
} {
  return {
    fromIso: new Date(`${range.from}T00:00:00.000Z`).toISOString(),
    toIso: new Date(`${range.to}T23:59:59.999Z`).toISOString(),
  };
}

export function isDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_KEY_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  // Compare on UTC fields so the check is timezone independent.
  const roundTrip = [
    parsed.getUTCFullYear(),
    String(parsed.getUTCMonth() + 1).padStart(2, "0"),
    String(parsed.getUTCDate()).padStart(2, "0"),
  ].join("-");
  return roundTrip === value;
}

/**
 * Reads `from`/`to` off a query string. The bounds are authoritative; `range`
 * (when valid) only labels the echoed preset. Falls back to the default preset
 * when either bound is missing or malformed, so a bad request can never widen
 * the window into an unbounded scan.
 */
export function parseTimeRangeQuery(
  params: Pick<URLSearchParams, "get">,
  fallback: TimeRangeId = DEFAULT_TIME_RANGE_ID,
): ResolvedTimeRange {
  const rangeParam = params.get("range");
  const id = isTimeRangeId(rangeParam) ? rangeParam : fallback;
  const from = params.get("from");
  const to = params.get("to");
  if (isDateKey(from) && isDateKey(to) && from <= to) {
    return {
      id,
      // A custom window is only meaningful when it says what it covers, so the
      // label carries the bounds rather than the bare preset name.
      label:
        id === "custom"
          ? `${CUSTOM_LABEL}: ${from} – ${to}`
          : getTimeRangePreset(id).label,
      from,
      to,
      days: daysInclusive(
        new Date(`${from}T00:00:00`),
        new Date(`${to}T00:00:00`),
      ),
    };
  }
  return resolveTimeRange(id);
}

export function timeRangeQueryString(range: ResolvedTimeRange): string {
  return `from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`;
}

export interface DateWindow {
  from: string;
  to: string;
}

/**
 * How the organization's records sit relative to the window on screen.
 *
 * Returned alongside every Overview aggregate so an empty window can say
 * something true and specific — "12,481 items exist outside this range" — rather
 * than the bare "No data in this period" that made a populated board look empty.
 */
export interface RangeCoverage {
  /** Every snapshot row in scope, dated or not. */
  totalRows: number;
  /** Rows carrying a received date. */
  datedRows: number;
  /** Rows whose received date falls inside the window. */
  inRange: number;
  /** Rows received before the window opened. */
  beforeRange: number;
  /** Rows received after the window closed. */
  afterRange: number;
  /** Rows with no received date at all, so no window can ever contain them. */
  undated: number;
  earliest: string | null;
  latest: string | null;
}

export const EMPTY_COVERAGE: RangeCoverage = {
  totalRows: 0,
  datedRows: 0,
  inRange: 0,
  beforeRange: 0,
  afterRange: 0,
  undated: 0,
  earliest: null,
  latest: null,
};

/**
 * Rows that exist in the workspace but cannot appear in the current window.
 *
 * Counts everything outside the window, and separately flags rows that carry no
 * received date at all — those are invisible to any date filter, so telling the
 * user only about the out-of-range count would still hide them.
 */
export function countOutsideRange(
  coverage: RangeCoverage,
): { total: number; dated: number; undated: number } {
  const dated = coverage.beforeRange + coverage.afterRange;
  return {
    total: dated + coverage.undated,
    dated,
    undated: coverage.undated,
  };
}

/**
 * Narrows an "All time" window to the bounds the data actually occupies.
 *
 * Any other selection is returned untouched: a user who picked "Last 30 days"
 * asked for 30 days, and silently stretching that to the full history would be
 * a different answer than the one they chose.
 *
 * When the workspace holds no dated records the window is left as-is, so the
 * empty state can still describe the range that was selected.
 */
export function narrowAllTimeRange(
  range: ResolvedTimeRange,
  bounds: { earliest: string | null; latest: string | null },
): ResolvedTimeRange {
  if (range.id !== "all") return range;
  if (!isDateKey(bounds.earliest)) return range;

  const from = bounds.earliest as string;
  const to = isDateKey(bounds.latest) ? (bounds.latest as string) : range.to;
  if (from > to) return range;

  return {
    ...range,
    from,
    to,
    days: daysInclusive(
      new Date(`${from}T00:00:00`),
      new Date(`${to}T00:00:00`),
    ),
  };
}

/**
 * The equal-length window immediately preceding `range`: it ends the day before
 * `range` starts and spans exactly as many days. Every stat-card trend is
 * computed against this window so a comparison is always "this period vs the
 * same number of days right before it", never an arbitrary baseline.
 */
export function priorPeriod(
  range: Pick<ResolvedTimeRange, "from" | "days">,
): DateWindow {
  const to = new Date(`${range.from}T00:00:00`);
  to.setDate(to.getDate() - 1);
  const from = new Date(to);
  from.setDate(from.getDate() - (range.days - 1));
  return { from: toDateKey(from), to: toDateKey(to) };
}
