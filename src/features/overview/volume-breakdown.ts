/**
 * Volume breakdown � pure transform from raw per-group counts to donut slices.
 *
 * Shows EVERY job type individually (no "Other" grouping by default).
 * Uses shared normalization/aliasing so numbers always agree across chart,
 * legend, drill-down, and exports.
 */

import type { ResolvedTimeRange } from "@/features/overview/time-range";
import { normalizeJobTypeForGrouping, isUnclassifiedJobType } from "@/lib/job-type-aliases";

/** The grouping field this breakdown uses. */
export const BREAKDOWN_FIELD = "job_type" as const;

/** Human-readable name of the grouping field, used in the section heading. */
export const BREAKDOWN_FIELD_LABEL = "Job type";

/** Label for records whose job-type cell is empty or absent. */
export const UNCLASSIFIED_LABEL = "Unclassified";

/** Label for the rolled-up tail of the distribution (only used if explicitly needed). */
export const OTHER_LABEL = "Other";

/**
 * For backwards compatibility - no longer used as default, but kept
 */
export const MAX_NAMED_SLICES = 1000;
export const OTHER_SHARE_THRESHOLD = 0;

/**
 * Normalises a raw job-type string so the donut, legend and header all agree.
 * Uses shared alias map from lib/job-type-aliases.ts
 */
export function normalizeJobType(raw: string): string {
  if (typeof raw !== "string") return "";
  return normalizeJobTypeForGrouping(raw);
}

/**
 * Generate distinct, accessible colors for many categories.
 * Uses hash-based selection for stability across renders.
 */
function generateSliceColor(label: string, index: number): string {
  // Special handling for Unclassified
  if (label === UNCLASSIFIED_LABEL) {
    return "hsl(var(--muted-foreground))";
  }
  
  // Use a hash of the label for stability
  let hash = 0;
  for (let i = 0; i < label.length; i++) {
    hash = (hash << 5) - hash + label.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  // Generate distinct colors using golden ratio for good distribution
  const goldenRatio = 0.618033988749895;
  const hue = ((Math.abs(hash) * goldenRatio) % 1) * 360;
  const saturation = 65 + (index % 3) * 10; // 65%, 75%, 85%
  const lightness = 45 + (index % 4) * 5;   // 45%, 50%, 55%, 60%
  
  return `hsl(${hue.toFixed(1)}, ${saturation}%, ${lightness}%)`;
}

/** Rollups use muted neutral */
const ROLLUP_COLOR = "hsl(var(--muted-foreground))";

/** One group's raw counts */
export interface BreakdownItem {
  /** Job-type label, or `""` when the record has no job type. */
  key: string;
  volume: number;
  jobs: number;
}

/** Shape the API returns. */
export interface BreakdownPayload {
  range: ResolvedTimeRange;
  grouping: {
    field: typeof BREAKDOWN_FIELD;
    label: string;
    available: boolean;
  };
  total: {
    volume: number;
    jobs: number;
  };
  items: BreakdownItem[];
}

/** A chart-ready slice */
export interface BreakdownSlice {
  key: string;
  label: string;
  volume: number;
  jobs: number;
  percentage: number;
  color: string;
  isOther: boolean;
  isUnclassified: boolean;
}

export interface BreakdownResult {
  slices: BreakdownSlice[];
  totalVolume: number;
  totalJobs: number;
  categoryCount: number;
  rolledUp: boolean;
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
 * displayed shares add up to exactly 100 using largest-remainder method.
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
 * Shows EVERY job type individually - no "Other" grouping by default.
 * "Other" only appears if a type is literally named "Other" in the data.
 */
export function toBreakdownSlices(payload: BreakdownPayload): BreakdownResult {
  // Normalize every item's key so aliases roll up before any counting happens.
  const normalized = payload.items
    .map((item) => ({
      ...item,
      key: normalizeJobType(item.key),
    }))
    .filter((item) => item.volume > 0);

  // Merge duplicate normalized keys
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

  // Sort by volume desc, then by label asc for ties
  const sorted = Array.from(merged.entries())
    .map(([key, counts]) => ({ key, volume: counts.volume, jobs: counts.jobs }))
    .sort((a, b) => b.volume - a.volume || a.key.localeCompare(b.key));

  // Separate unclassified from real types
  const isUnclassified = (key: string) => key.trim().length === 0 || isUnclassifiedJobType(key);
  const unclassified = sorted.filter((item) => isUnclassified(item.key));
  const real = sorted.filter((item) => !isUnclassified(item.key));

  // Check if there's literally a type named "Other" in the data
  const hasLiteralOther = real.some((item) => item.key.trim() === OTHER_LABEL);

  const segments: Array<{
    key: string;
    label: string;
    volume: number;
    jobs: number;
    color: string;
    isOther: boolean;
    isUnclassified: boolean;
  }> = [];

  let colorIndex = 0;
  // Add all real types (including literal "Other" if it exists)
  for (const item of real) {
    const label = item.key.trim();
    const isOther = label === OTHER_LABEL && hasLiteralOther;
    segments.push({
      key: isOther ? "__other_literal__" : item.key,
      label: label,
      volume: item.volume,
      jobs: item.jobs,
      color: isOther ? ROLLUP_COLOR : generateSliceColor(label, colorIndex++),
      isOther: isOther,
      isUnclassified: false,
    });
  }

  // Add unclassified if exists
  if (unclassified.length > 0) {
    segments.push({
      key: "__unclassified__",
      label: UNCLASSIFIED_LABEL,
      volume: unclassified.reduce((sum, item) => sum + item.volume, 0),
      jobs: unclassified.reduce((sum, item) => sum + item.jobs, 0),
      color: "hsl(var(--muted-foreground))",
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
    categoryCount: real.length, // Count of real job types (not including unclassified)
    rolledUp: false, // Never roll up by default
    isEmpty: slices.length === 0,
    grouping: payload.grouping,
    range: payload.range,
  };
}

/**
 * Formats a share for the legend. Always show 1 decimal place as requested.
 */
export function formatPercent(percentage: number): string {
  const safe = Number.isFinite(percentage) ? percentage : 0;
  // Show 1 decimal place consistently
  return `${safe.toFixed(1)}%`;
}
