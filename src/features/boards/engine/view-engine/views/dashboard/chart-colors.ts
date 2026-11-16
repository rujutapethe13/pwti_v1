/**
 * Shared chart colour palette
 *
 * Every dashboard chart (Status breakdown, Data over time, …) resolves a
 * slice/series colour from here so the same status label is never drawn in
 * two different colours across the dashboard, and so a status that has no
 * mapped colour still gets a visible slice instead of disappearing.
 *
 * The map is keyed by the *display label* (case-insensitive) and falls back to
 * the standard Status palette from the column registry, then to a neutral
 * slate. Unknown / empty statuses therefore always render.
 */

import { DEFAULT_STATUS_LABELS } from "@/features/boards/engine/column-registry";

/** Slate grey — the colour every unmapped slice falls back to. */
export const FALLBACK_CHART_COLOR = "#94A3B8";

/**
 * Build the label → colour map from the standard Status palette.
 *
 * The standard labels (Done, Working on it, Stuck, Not Started) are always
 * present; a custom status label that the user added later keeps its own
 * colour when the caller passes it in, otherwise it falls through to the
 * neutral slate so it is never invisible.
 */
function buildStatusColorMap(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const opt of DEFAULT_STATUS_LABELS) {
    map[opt.label.toLowerCase()] = opt.color ?? FALLBACK_CHART_COLOR;
  }
  // Friendly aliases for the bucket names used by the status breakdown.
  map["done"] = "#67C37D";
  map["working on it"] = "#EDAE52";
  map["on hold"] = "#C5414E";
  map["not started"] = "#C4C4C4";
  return map;
}

export const STATUS_COLOR_MAP: Record<string, string> = buildStatusColorMap();

/**
 * Resolve a colour for a slice/series label.
 *
 * 1. Explicit per-widget override (`seriesColors[label]`).
 * 2. The shared status palette (matched case-insensitively).
 * 3. The neutral slate — never an invisible slice.
 */
export function getChartColor(
  label: string | null | undefined,
  overrides?: Record<string, string>,
): string {
  if (overrides && label) {
    const direct = overrides[label];
    if (direct) return direct;
  }
  if (!label) return FALLBACK_CHART_COLOR;
  return STATUS_COLOR_MAP[label.toLowerCase()] ?? FALLBACK_CHART_COLOR;
}

/** Deterministic colour for arbitrary labels (e.g. clients, job types). */
export function hashColor(seed: string | number): string {
  const palette = [
    "#67C37D",
    "#EDAE52",
    "#C5414E",
    "#C4C4C4",
    "#5B8FF9",
    "#5AD8A6",
    "#F6BD16",
    "#E86452",
    "#6DC8EC",
    "#9270CA",
    "#FF9845",
    "#1E939D",
  ];
  const key = String(seed);
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}