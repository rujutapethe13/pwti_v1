/**
 * Volume breakdown — pure transform from raw per-group counts to donut slices.
 *
 * The Overview breakdown answers "where does the volume in this range actually
 * come from?". The grouping field was chosen from a real audit of the data
 * rather than picked by habit: this workspace has a populated "Job Type"
 * dropdown, only two boards (one of them a system board), and no client column
 * at all — so job type is the only field that can carry a meaningful breakdown.
 * That decision is recorded in the migration that adds the `job_type` mapping.
 *
 * This module is deliberately free of Supabase, React and Recharts. It owns the
 * rules that decide what a legend row says:
 *
 *  - percentages come from the counts actually present, not from a hardcoded
 *    split, and are computed against the sum of the *displayed* slices so the
 *    numbers on screen always add up to what the donut draws;
 *  - a category with zero volume is dropped, because a 0% legend row for an
 *    invisible slice is noise;
 *  - categories beyond the top few roll into "Other" so the donut stays
 *    readable, and the rollup is disclosed rather than hidden;
 *  - records with no job type are never silently dropped. They surface as an
 *    explicit "Unclassified" slice, so the chart still sums to the real total
 *    and the gap is visible instead of being absorbed into a real category.
 */

import type { ResolvedTimeRange } from "@/features/overview/time-range";

/** The grouping field this breakdown uses. See the audit note above. */
export const BREAKDOWN_FIELD = "job_type" as const;

/** Human-readable name of the grouping field, used in the section heading. */
export const BREAKDOWN_FIELD_LABEL = "Job type";

/** Label for records whose job-type cell is empty or absent. */
export const UNCLASSIFIED_LABEL = "Unclassified";

/** Label for the rolled-up tail of the distribution. */
export const OTHER_LABEL = "Other";

/**
 * Maximum number of named slices drawn individually before the rest roll into
 * "Other". The rollup only happens when there are MORE than this many distinct
 * types AND at least one of them is below the share threshold — see
 * `toBreakdownSlices`. Six keeps the donut readable while still naming the
 * whole real distribution when a board has only a handful of job types.
 */
export const MAX_NAMED_SLICES = 6;

/**
 * Share threshold below which a type is considered too small to name on its own.
 * A type whose share is under this value only rolls into "Other" when there are
 * more than `MAX_NAMED_SLICES` distinct types; otherwise it stays named.
 */
export const OTHER_SHARE_THRESHOLD = 5;

/**
 * Normalises a raw job-type string so the donut, legend and header all agree.
 * Trims, case-folds and maps known aliases to canonical names. Unknown types
 * keep their own name.
 */
export function normalizeJobType(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const aliasMap: Record<string, string> = {
    "genie backpack": "Backpack",
    "apperals": "Apparel",
    "apparels": "Apparel",
    "apparel": "Apparel",
  };
  const key = trimmed.toLowerCase();
  return aliasMap[key] ?? trimmed;
}

/**
 * Slice colors, taken as a single-hue ramp from the `--highlight` accent rather
 * than as a set of unrelated accent tokens. A donut still has to tell its
 * segments apart, but it should not spend four different colours doing it: the
 * reader gets one hue, stepped by opacity, and the composition stays in the one
 * accent the rest of the page uses. Index is the slice's rank, so a category
 * keeps its shade as long as it stays in the top few.
 */
const SLICE_COLORS = [
  "hsl(var(--highlight) / 1)",
  "hsl(var(--highlight) / 0.72)",
  "hsl(var(--highlight) / 0.52)",
  "hsl(var(--highlight) / 0.36)",
  "hsl(var(--highlight) / 0.24)",
  "hsl(var(--highlight) / 0.16)",
  "hsl(var(--highlight) / 0.1)",
  "hsl(var(--highlight) / 0.06)",
] as const;

/** Rollups and unclassified rows use a muted neutral so they read as summaries. */
const ROLLUP_COLOR = "hsl(var(--muted-foreground))";

/** One group's raw counts, exactly as the database reports them. */
export interface BreakdownItem {
  /** Job-type label, or `""` when the record has no job type. */
  key: string;
  volume: number;
  jobs: number;
}

/** Shape the API returns. */
export interface BreakdownPayload {
  range: ResolvedTimeRange;
  /** Always `"job_type"`; carried so the client never hardcodes the field. */
  grouping: {
    field: typeof BREAKDOWN_FIELD;
    label: string;
    /**
     * False when no board in the organization maps a job-type column, so every
     * record is unclassified. The UI must say so instead of presenting one
     * giant "Unclassified" slice as if it were a real category.
     */
    available: boolean;
  };
  total: {
    volume: number;
    jobs: number;
  };
  items: BreakdownItem[];
}

/** A chart-ready slice: a group's counts plus its share of the total. */
export interface BreakdownSlice {
  key: string;
  label: string;
  volume: number;
  jobs: number;
  /** Share of the displayed total, 0–100, to one decimal place. */
  percentage: number;
  color: string;
  /** True for the rolled-up tail. */
  isOther: boolean;
  /** True for records that carry no job type. */
  isUnclassified: boolean;
}

export interface BreakdownResult {
  slices: BreakdownSlice[];
  /** Sum of the displayed slices — the donut's actual 100%. */
  totalVolume: number;
  totalJobs: number;
  /** How many distinct categories the database reported, before rollup. */
  categoryCount: number;
  /** True when categories beyond `MAX_NAMED_SLICES` were folded into "Other". */
  rolledUp: boolean;
  /** True when the range holds no volume at all. */
  isEmpty: boolean;
  grouping: BreakdownPayload["grouping"];
  range: ResolvedTimeRange;
}

export function isWithinInclusiveDateWindow(
  date: string | null,
  from: string,
  to: string,
): boolean {
  return date !== null && date >= from && date <= to;
}

export function turnaroundDays(
  received: string | null,
  uploaded: string | null,
): number | null {
  if (!received || !uploaded) return null;
  const start = Date.parse(`${received}T00:00:00Z`);
  const end = Date.parse(`${uploaded}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.round((end - start) / 86400000);
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/**
 * Splits 100% across `volumes`, rounded to one decimal place, such that the
 * displayed shares add up to exactly 100.
 *
 * Rounding each share on its own is wrong here: three equal slices would each
 * read 33.3% and the legend would total 99.9%, which looks like a bug to anyone
 * checking the arithmetic. So the shares are floored to a tenth of a percent and
 * the leftover tenths are handed to the slices with the largest discarded
 * remainders (largest-remainder / Hare quota). Every slice is off by at most
 * 0.1pp from its exact share, and the total is exact.
 */
function allocateShares(volumes: number[]): number[] {
  const total = volumes.reduce((sum, volume) => sum + volume, 0);
  if (total <= 0) return volumes.map(() => 0);

  // Work in tenths of a percent so every value stays an exact integer.
  const tenths = volumes.map((volume) => (volume / total) * 1000);
  const shares = tenths.map((tenth) => Math.floor(tenth));

  let leftover = 1000 - shares.reduce((sum, share) => sum + share, 0);
  if (leftover <= 0) return shares.map((tenth) => tenth / 10);

  const byRemainder = tenths
    .map((tenth, index) => ({ index, remainder: tenth - Math.floor(tenth) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);

  for (const { index } of byRemainder) {
    if (leftover <= 0) break;
    shares[index] += 1;
    leftover -= 1;
  }

  return shares.map((tenth) => tenth / 10);
}

/**
 * Projects a payload into donut slices.
 *
 * Percentages are computed against the sum of the slices that survive rollup,
 * so the legend percentages always sum to 100% of what the donut draws. A
 * payload with no volume yields an empty slice list rather than NaN shares.
 *
 * Job-type normalization is applied here so the chart, legend and header counts
 * all derive from the same normalized view. The "Other" bucket is only created
 * when there are MORE than `MAX_NAMED_SLICES` distinct normalized types AND at
 * least one of them is below `OTHER_SHARE_THRESHOLD` — otherwise every type is
 * named. The header "N job types" equals the number of distinct normalized
 * types (before rollup), so it can never disagree with the chart.
 */
export function toBreakdownSlices(payload: BreakdownPayload): BreakdownResult {
  // Normalize every item's key so aliases roll up before any counting happens.
  const normalized = payload.items
    .map((item) => ({
      ...item,
      key: normalizeJobType(item.key),
    }))
    .filter((item) => item.volume > 0);

  // Merge duplicate normalized keys (e.g. "Genie Backpack" + "backpack").
  const merged = new Map<string, { volume: number; jobs: number }>();
  for (const item of normalized) {
    const existing = merged.get(item.key);
    if (existing) {
      existing.volume += item.volume;
      existing.jobs += item.jobs;
    } else {
      merged.set(item.key, { volume: item.volume, jobs: item.jobs });
    }
  }

  const named = Array.from(merged.entries())
    .map(([key, counts]) => ({ key, volume: counts.volume, jobs: counts.jobs }))
    .sort((a, b) => b.volume - a.volume || a.key.localeCompare(b.key));

  // Unclassified rows are held out of the rollup: a record with no job type is
  // a data gap, not a small category, and folding it into "Other" would hide it.
  const isUnclassified = (key: string) => key.trim().length === 0;
  const unclassified = named.filter((item) => isUnclassified(item.key));
  const real = named.filter((item) => !isUnclassified(item.key));

  // Decide whether the tail rolls into "Other". The rule is:
  //   - more than MAX_NAMED_SLICES distinct types, AND
  //   - at least one type's share is below OTHER_SHARE_THRESHOLD.
  // Otherwise every type is named — the header count matches the chart.
  const totalRealVolume = real.reduce((sum, item) => sum + item.volume, 0);
  const hasSmallType = real.some(
    (item) => totalRealVolume > 0 && (item.volume / totalRealVolume) * 100 < OTHER_SHARE_THRESHOLD,
  );
  const shouldRollUp = real.length > MAX_NAMED_SLICES && hasSmallType;
  const head = shouldRollUp
    ? real.filter(
        (item) => (item.volume / totalRealVolume) * 100 >= OTHER_SHARE_THRESHOLD,
      )
    : real;
  const tail = shouldRollUp
    ? real.filter(
        (item) => (item.volume / totalRealVolume) * 100 < OTHER_SHARE_THRESHOLD,
      )
    : [];

  // The tail and the untyped records are drawn as their own slices, so every
  // displayed segment is named before the shares are allocated across the set.
  const segments: Array<{
    key: string;
    label: string;
    volume: number;
    jobs: number;
    color: string;
    isOther: boolean;
    isUnclassified: boolean;
  }> = [];

  for (const item of head) {
    segments.push({
      key: item.key,
      label: item.key.trim(),
      volume: item.volume,
      jobs: item.jobs,
      color: SLICE_COLORS[segments.length % SLICE_COLORS.length],
      isOther: false,
      isUnclassified: false,
    });
  }

  if (tail.length > 0) {
    segments.push({
      key: "__other__",
      label: OTHER_LABEL,
      volume: tail.reduce((sum, item) => sum + item.volume, 0),
      jobs: tail.reduce((sum, item) => sum + item.jobs, 0),
      color: ROLLUP_COLOR,
      isOther: true,
      isUnclassified: false,
    });
  }

  if (unclassified.length > 0) {
    segments.push({
      key: "__unclassified__",
      label: UNCLASSIFIED_LABEL,
      volume: unclassified.reduce((sum, item) => sum + item.volume, 0),
      jobs: unclassified.reduce((sum, item) => sum + item.jobs, 0),
      color: ROLLUP_COLOR,
      isOther: false,
      isUnclassified: true,
    });
  }

  const shares = allocateShares(segments.map((segment) => segment.volume));
  const slices: BreakdownSlice[] = segments.map((segment, index) => ({
    ...segment,
    percentage: clampPercent(shares[index]),
  }));

  return {
    slices,
    totalVolume: slices.reduce((sum, slice) => sum + slice.volume, 0),
    totalJobs: slices.reduce((sum, slice) => sum + slice.jobs, 0),
    categoryCount: real.length,
    rolledUp: tail.length > 0,
    isEmpty: slices.length === 0,
    grouping: payload.grouping,
    range: payload.range,
  };
}

/**
 * Formats a share for the legend. Trailing `.0` is dropped so a 40% share does
 * not read as "40.0%" next to a 4.3% one.
 */
export function formatPercent(percentage: number): string {
  const safe = Number.isFinite(percentage) ? percentage : 0;
  return `${safe.toFixed(1).replace(/\.0$/, "")}%`;
}
