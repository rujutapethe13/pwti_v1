/**
 * Single source of truth for resolving option-column cell values to labels.
 *
 * Option columns (status / priority / dropdown / multi_select) store the
 * option **id** in `cell_values`; the human-readable text lives on the
 * column definition as `{ id, label, color? }`. Every surface that shows such
 * a value — table cells, filters, group-by, search, CSV export, dashboard
 * charts — must go through these helpers so a raw `opt-…` id is never rendered
 * to the user.
 *
 * ── Where the labels live ────────────────────────────────────
 *   • `status` column  → `column.settings.labels`  (canonical)
 *   • every other option type → `column.settings.options`
 *
 * A status column that has no `labels` array yet (created before the labels
 * migration, or by an older import) falls back to its legacy `options` array
 * so it still renders. The write path keeps both arrays in sync for status
 * columns, so the fallback is only ever a safety net.
 *
 * Rules enforced here:
 *   1. A cell stores the option id but displays the option's label.
 *   2. An id with no matching option renders the `UNKNOWN_OPTION_LABEL`
 *      fallback, never the raw id.
 *   3. A value that is already a plain label (legacy imports) still displays.
 */

import { DEFAULT_STATUS_LABELS, columnTypeRegistry } from "../column-registry";
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
      if (o.variant === "light" || o.variant === "default") entry.variant = o.variant as "light" | "default";
      out.push(entry);
    }
  }
  return out;
}

/**
 * Minimal shape a column must expose for its label list to be readable.
 * `type` is optional so partially-typed columns (tests, projections) still
 * resolve; without it the column is treated as a non-status option column.
 */
export interface LabelSource {
  settings?: Record<string, unknown>;
  type?: string;
}

/**
 * Read the label list of a column from the LIVE column definition.
 *
 * This is the ONLY accessor any surface may use to read a column's labels.
 * It returns the labels of the column as it exists right now — never a
 * hardcoded list, never a copy taken at mount.
 *
 *  • `status` columns read `settings.labels` (falling back to the legacy
 *    `settings.options` when no labels array exists yet).
 *  • every other option column type reads `settings.options`.
 */
export function getColumnOptions(column: LabelSource | null | undefined): DropdownOption[] {
  if (!column) return [];
  const settings = column.settings ?? {};

  if (column.type === "status") {
    const labels = normalizeOptions(settings.labels);
    if (labels.length > 0) return labels;
    return normalizeOptions(settings.options);
  }

  return normalizeOptions(settings.options);
}

/**
 * The default label list for a column type.
 *
 * A `status` column starts with the four standard labels; other option types
 * start with whatever the column registry declares (often nothing).
 */
export function getDefaultLabelsForType(type: string): DropdownOption[] {
  if (type === "status") return DEFAULT_STATUS_LABELS.map((opt) => ({ ...opt }));
  const defaults = columnTypeRegistry[type as keyof typeof columnTypeRegistry]?.defaultOptions;
  return defaults ? defaults.map((opt) => ({ ...opt })) : [];
}

/**
 * Build the settings object a column of `type` starts with.
 *
 * Status columns get `labels` (and a mirrored `options` array so legacy
 * readers keep working); other option types get `options`.
 */
export function buildColumnSettings(
  type: string,
  settings: Record<string, unknown> = {},
): Record<string, unknown> {
  const base = { ...settings };
  const defaults = getDefaultLabelsForType(type);
  if (defaults.length === 0) return base;

  if (type === "status") {
    if (!normalizeOptions(base.labels).length) base.labels = defaults;
    if (!normalizeOptions(base.options).length) base.options = base.labels;
    return base;
  }

  if (!normalizeOptions(base.options).length) base.options = defaults;
  return base;
}

/**
 * Make a label list safe to persist.
 *
 *  • entries with an empty name are dropped;
 *  • names are trimmed;
 *  • ids are made unique — a missing or duplicated id is replaced with a
 *    generated one so two labels can never share an id.
 */
export function sanitizeLabels(
  labels: Array<Partial<DropdownOption> & { id?: string; label?: string }>,
): DropdownOption[] {
  const out: DropdownOption[] = [];
  const usedIds = new Set<string>();

  for (const raw of labels) {
    const label = typeof raw?.label === "string" ? raw.label.trim() : "";
    if (!label) continue;

    let id = typeof raw.id === "string" ? raw.id.trim() : "";
    if (!id || usedIds.has(id)) {
      id = stableOptionId(label, usedIds);
    }
    usedIds.add(id);

    const entry: DropdownOption = { id, label };
    if (typeof raw.color === "string" && raw.color) entry.color = raw.color;
    if (raw.variant === "light" || raw.variant === "default") entry.variant = raw.variant;
    out.push(entry);
  }

  return out;
}

/**
 * The effective label list of a status column: the labels it already has,
 * plus any of the four standard labels that are missing.
 *
 * A standard label that already exists keeps its id — so the cells pointing
 * at it stay valid — and takes the standard colour. Labels that are not one
 * of the four standard ones are kept exactly as they are.
 */
export function buildStatusLabels(existing: DropdownOption[]): DropdownOption[] {
  const current = sanitizeLabels(existing);
  const byLabel = new Map(current.map((opt) => [opt.label.toLowerCase(), opt]));
  const usedIds = new Set(current.map((opt) => opt.id));

  for (const fallback of DEFAULT_STATUS_LABELS) {
    const key = fallback.label.toLowerCase();
    const existingLabel = byLabel.get(key);
    if (existingLabel) {
      existingLabel.color = fallback.color;
      continue;
    }
    const id = usedIds.has(fallback.id) ? stableOptionId(fallback.label, usedIds) : fallback.id;
    usedIds.add(id);
    const entry: DropdownOption = { id, label: fallback.label, color: fallback.color };
    current.push(entry);
    byLabel.set(key, entry);
  }

  return current;
}

/**
 * Merge two label lists by id.
 *
 * The local list is the base: an id that exists in both keeps the local
 * entry, a label that only exists in the incoming list is appended. A label
 * that the local list dropped is therefore NOT resurrected by a stale
 * response.
 */
export function mergeLabels(
  local: DropdownOption[],
  incoming: DropdownOption[],
): DropdownOption[] {
  if (incoming.length === 0) return local;
  if (local.length === 0) return incoming;

  const merged = new Map<string, DropdownOption>();
  for (const opt of local) merged.set(opt.id, opt);
  for (const opt of incoming) {
    const existing = merged.get(opt.id);
    if (!existing) {
      merged.set(opt.id, opt);
      continue;
    }
    merged.set(opt.id, {
      ...existing,
      ...opt,
      label: opt.label || existing.label,
    });
  }
  return Array.from(merged.values());
}

/** True when `a` is strictly older than `b`. Unparseable timestamps count as "not older". */
function isOlderTimestamp(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return false;
  return ta < tb;
}

/**
 * The label list a column must end up with after a refresh.
 *
 * A response that carries no labels, or that is older than the local column,
 * never overwrites the local labels. Otherwise the two lists are merged by id.
 */
export function mergeColumnLabels(
  localColumn: ColumnDefinition | undefined,
  incomingColumn: ColumnDefinition,
): DropdownOption[] {
  const local = getColumnOptions(localColumn);
  const incoming = getColumnOptions(incomingColumn);
  if (incoming.length === 0) return local;
  if (local.length === 0) return incoming;
  if (isOlderTimestamp(incomingColumn.updatedAt, localColumn?.updatedAt)) return local;
  return mergeLabels(local, incoming);
}

/**
 * Merge a freshly loaded column list into the local one.
 *
 * The incoming list decides WHICH columns exist; the local labels decide what
 * those columns show. A local column that the server no longer returns is
 * dropped, a column the server returns for the first time is added as-is.
 */
export function mergeColumns(
  local: ColumnDefinition[],
  incoming: ColumnDefinition[],
): ColumnDefinition[] {
  const localById = new Map(local.map((col) => [col.id, col]));
  return incoming.map((col) => {
    const localCol = localById.get(col.id);
    if (!localCol) return col;
    const labels = mergeColumnLabels(localCol, col);
    if (labels.length === 0) return col;
    const settings = { ...localCol.settings, ...col.settings };
    if (col.type === "status") {
      settings.labels = labels;
      settings.options = labels;
    } else {
      settings.options = labels;
    }
    return { ...col, settings };
  });
}

/**
 * Apply a set of column updates to the local column list.
 *
 * Columns that are not part of the local list are ignored — an update for a
 * column of another board must not leak into this board.
 */
export function applyColumnUpdates(
  local: ColumnDefinition[],
  updates: ColumnDefinition[],
): ColumnDefinition[] {
  if (updates.length === 0) return local;
  const updatesById = new Map(updates.map((col) => [col.id, col]));
  return local.map((col) => {
    const update = updatesById.get(col.id);
    if (!update) return col;
    const labels = mergeColumnLabels(col, update);
    if (labels.length === 0) return col;
    const settings = { ...col.settings, ...update.settings };
    if (col.type === "status") {
      settings.labels = labels;
      settings.options = labels;
    } else {
      settings.options = labels;
    }
    return { ...col, settings, updatedAt: update.updatedAt ?? col.updatedAt };
  });
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
