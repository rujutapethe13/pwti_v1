/**
 * Single source of truth for resolving option-column cell values to labels.
 *
 * Option columns (status / priority / dropdown / multi_select) store the
 * option **id** in `cell_values`; the human-readable text lives in
 * `column.settings.options` as `{ id, label, color? }`. Every surface that
 * shows such a value — table cells, filters, group-by, search, CSV export,
 * dashboard charts — must go through these helpers so a raw `opt-…` id is
 * never rendered to the user.
 *
 * Rules enforced here:
 *   1. A cell stores the option id but displays the option's label.
 *   2. An id with no matching option renders the `UNKNOWN_OPTION_LABEL`
 *      fallback, never the raw id.
 *   3. A value that is already a plain label (legacy imports) still displays.
 */

import type { ColumnDefinition, ColumnValue, DropdownOption } from "../types";

/** Column types whose `settings.options` array is the source of truth. */
export const OPTION_COLUMN_TYPES = ["status", "priority", "dropdown", "multi_select"] as const;

export type OptionColumnType = (typeof OPTION_COLUMN_TYPES)[number];

/** Shown when a cell holds an option id that is missing from the options list. */
export const UNKNOWN_OPTION_LABEL = "Unknown option";

/** Placeholder used for an empty cell. */
export const EMPTY_OPTION_LABEL = "—";

export function isOptionColumnType(type: string): type is OptionColumnType {
  return (OPTION_COLUMN_TYPES as readonly string[]).includes(type);
}

/**
 * Matches the internal option-id shapes the app has generated over time:
 * `opt-1`, `opt-1790843037295-0`, `opt_import_42`, `opt-repair-…`.
 * Deliberately broader than the historical `opt-import-\d+` check.
 */
const OPTION_ID_PATTERN = /^opt[-_]/i;

export function looksLikeOptionId(value: unknown): boolean {
  return typeof value === "string" && OPTION_ID_PATTERN.test(value.trim());
}

/**
 * Build a deterministic option id from a label.
 *
 * Ids must be stable so that re-importing the same file resolves to the same
 * option instead of appending a duplicate. A `Date.now()`-based id cannot do
 * that: every re-import mints a fresh id for an identical label.
 */
export function stableOptionId(label: string, taken?: Set<string>): string {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "option";
  const candidate = `opt-import-${base}`;
  if (!taken) return candidate;
  if (!taken.has(candidate)) return candidate;
  let n = 2;
  while (taken.has(`${candidate}-${n}`)) n += 1;
  return `${candidate}-${n}`;
}

/**
 * Normalize `column.settings.options` into a stable `{ id, label, color? }[]`
 * shape, tolerating the legacy forms: plain string arrays, mixed arrays, and
 * objects missing an `id`.
 */
export function normalizeOptions(raw: unknown): DropdownOption[] {
  if (!Array.isArray(raw)) return [];
  const out: DropdownOption[] = [];
  for (const opt of raw) {
    if (typeof opt === "string") {
      const label = opt;
      if (label) out.push({ id: opt, label });
      continue;
    }
    if (opt && typeof opt === "object") {
      const o = opt as Record<string, unknown>;
      const label = typeof o.label === "string" ? o.label : "";
      const id = (typeof o.id === "string" && o.id.length > 0 ? o.id : label) || "";
      // An entry with neither an id nor a label carries no information.
      if (!id && !label) continue;
      const entry: DropdownOption = { id, label };
      if (typeof o.color === "string") entry.color = o.color;
      out.push(entry);
    }
  }
  return out;
}

/** Read the normalized options for a column. */
export function getColumnOptions(column: Pick<ColumnDefinition, "settings">): DropdownOption[] {
  return normalizeOptions(column.settings?.options);
}

/**
 * Find the option a cell value refers to. Matches by id first, then by label
 * (exact, then case-insensitive) so legacy cells holding a label still resolve.
 */
export function findOptionForValue(
  options: DropdownOption[],
  value: ColumnValue | undefined,
): DropdownOption | undefined {
  if (value === null || value === undefined) return undefined;

  if (typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    const label = typeof obj.label === "string" ? obj.label : "";
    if (!label) return undefined;
    return options.find((o) => o.id === obj.id || o.label === label);
  }

  if (typeof value !== "string") return undefined;
  const str = value.trim();
  if (!str) return undefined;

  return (
    options.find((o) => o.id === str) ??
    options.find((o) => o.label === str) ??
    options.find((o) => o.label.toLowerCase() === str.toLowerCase())
  );
}

export interface ResolvedOptionDisplay {
  /** Text to render. */
  label: string;
  /** The matched option, or null when the value is not a known option. */
  option: DropdownOption | null;
  /** True when the cell is empty. */
  isEmpty: boolean;
  /** True when the value looked like an option id but matched no option. */
  isUnknown: boolean;
}

/**
 * Resolve one cell value of an option column into its display label.
 *
 * An empty value yields `""` (callers pick their own placeholder). A value
 * that is an unrecognised `opt-…` id yields `UNKNOWN_OPTION_LABEL` so the raw
 * id is never shown. Anything else is returned as-is, which preserves plain
 * label strings written by older imports.
 */
export function resolveOptionDisplay(
  options: DropdownOption[],
  value: ColumnValue | undefined,
): ResolvedOptionDisplay {
  if (value === null || value === undefined || value === "") {
    return { label: "", option: null, isEmpty: true, isUnknown: false };
  }

  const option = findOptionForValue(options, value);
  if (option) {
    // A matched option with a blank label has no text to show; treat it as
    // unknown rather than echoing its id. A label that is itself an internal
    // `opt-…` id is equally un-displayable — it means the option was never
    // given a real name.
    if (option.label && !looksLikeOptionId(option.label)) {
      return { label: option.label, option, isEmpty: false, isUnknown: false };
    }
    return { label: UNKNOWN_OPTION_LABEL, option, isEmpty: false, isUnknown: true };
  }

  if (looksLikeOptionId(value)) {
    return { label: UNKNOWN_OPTION_LABEL, option: null, isEmpty: false, isUnknown: true };
  }

  return {
    label: typeof value === "string" ? value : String(value),
    option: null,
    isEmpty: false,
    isUnknown: false,
  };
}

/** Convenience wrapper resolving directly from a column. */
export function resolveOptionDisplayForColumn(
  column: Pick<ColumnDefinition, "settings">,
  value: ColumnValue | undefined,
): ResolvedOptionDisplay {
  return resolveOptionDisplay(getColumnOptions(column), value);
}

/**
 * Resolve a `multi_select` / `tags` cell (an array of option ids or labels)
 * into a comma-separated list of labels, dropping unknown ids.
 */
export function resolveOptionListDisplay(
  options: DropdownOption[],
  value: ColumnValue | undefined,
  separator = ", ",
): string {
  if (!Array.isArray(value)) {
    return resolveOptionDisplay(options, value).label;
  }
  return value
    .map((v) => resolveOptionDisplay(options, v))
    .filter((r) => !r.isEmpty && r.label !== UNKNOWN_OPTION_LABEL)
    .map((r) => r.label)
    .join(separator);
}
