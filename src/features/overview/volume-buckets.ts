/**
 * Buckets daily snapshot rows into chart points for an arbitrary time range.
 * Granularity widens with the window so a 1-year range doesn't try to render
 * 365 bars.
 */

export type VolumeGranularity = "day" | "week" | "month";

export interface VolumeBucket {
  /** Stable bucket key, e.g. "2026-01-05" (day/week) or "2026-01" (month). */
  key: string;
  label: string;
  jobs: number;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function pickVolumeGranularity(days: number): VolumeGranularity {
  if (days <= 31) return "day";
  if (days <= 120) return "week";
  return "month";
}

function dateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function startOfWeek(date: Date): Date {
  const start = new Date(date);
  start.setDate(start.getDate() - start.getDay());
  return start;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function nextBucketStart(date: Date, granularity: VolumeGranularity): Date {
  const next = new Date(date);
  if (granularity === "day") next.setDate(next.getDate() + 1);
  else if (granularity === "week") next.setDate(next.getDate() + 7);
  else next.setMonth(next.getMonth() + 1);
  return next;
}

/** Every bucket covering the inclusive `from`..`to` window, zero-filled. */
/** Start of the bucket that contains `date` for the given granularity. */
export function bucketStartFor(
  date: Date,
  granularity: VolumeGranularity,
): Date {
  if (granularity === "month") return startOfMonth(date);
  if (granularity === "week") return startOfWeek(date);
  return new Date(date);
}

export function buildVolumeBuckets(
  from: Date,
  to: Date,
  granularity: VolumeGranularity,
): Map<string, VolumeBucket> {
  const buckets = new Map<string, VolumeBucket>();

  let cursor = bucketStartFor(from, granularity);

  const end = new Date(to);
  while (cursor.getTime() <= end.getTime()) {
    const key =
      granularity === "month"
        ? dateKey(cursor).slice(0, 7)
        : dateKey(cursor);
    const label =
      granularity === "day"
        ? WEEKDAYS[cursor.getDay()]
        : granularity === "week"
          ? `${MONTHS[cursor.getMonth()]} ${cursor.getDate()}`
          : MONTHS[cursor.getMonth()];
    buckets.set(key, { key, label, jobs: 0 });
    cursor = nextBucketStart(cursor, granularity);
  }

  return buckets;
}

export function bucketKeyFor(
  date: Date,
  granularity: VolumeGranularity,
): string {
  if (granularity === "month") return dateKey(bucketStartFor(date, "month")).slice(0, 7);
  if (granularity === "week") return dateKey(bucketStartFor(date, "week"));
  return dateKey(date);
}

/**
 * One trend point: a bucket carrying both the received and the completed
 * volume. `received` and `completed` are independent counts — a job received
 * in this bucket and completed in a later one appears only in `received` here.
 */
export interface VolumeTrendPoint {
  key: string;
  label: string;
  /** Local midnight of the bucket's start, for highlighting "today". */
  date: Date | null;
  received: number;
  completed: number;
}

/**
 * Reconstructs the local-midnight Date a bucket key refers to, so callers can
 * compare a bucket against "today" without re-parsing the label. Returns null
 * when the key is not a recognized bucket key.
 */
export function bucketToDate(key: string): Date | null {
  if (/^(\d{4})-(\d{2})$/.test(key)) {
    const m = /^(\d{4})-(\d{2})$/.exec(key);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, 1);
  }
  const parsed = new Date(`${key}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

/**
 * Joins two zero-filled bucket series on their key. Missing entries on either
 * side read as 0 — a week with completions but no receipts is still a real
 * point, not a gap.
 */
export function mergeVolumeBuckets(
  received: VolumeBucket[],
  completed: VolumeBucket[],
): VolumeTrendPoint[] {
  const byKey = new Map<string, VolumeTrendPoint>();
  for (const bucket of received) {
    byKey.set(bucket.key, {
      key: bucket.key,
      label: bucket.label,
      date: bucketToDate(bucket.key) ?? new Date(NaN),
      received: bucket.jobs,
      completed: 0,
    });
  }
  for (const bucket of completed) {
    const existing = byKey.get(bucket.key);
    if (existing) {
      existing.completed = bucket.jobs;
    } else {
      byKey.set(bucket.key, {
        key: bucket.key,
        label: bucket.label,
        date: bucketToDate(bucket.key) ?? new Date(NaN),
        received: 0,
        completed: bucket.jobs,
      });
    }
  }
  return Array.from(byKey.values());
}
