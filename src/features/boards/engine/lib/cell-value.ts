import type { ColumnValue } from "../types";

/**
 * Legacy imports wrote `JSON.stringify(null)` into `cell_values.value_text`,
 * so empty cells are stored as the literal strings "null" / "undefined".
 * Treat those as blank everywhere a value is displayed or serialized.
 */
const EMPTY_TEXT_MARKERS = new Set(["null", "undefined"]);

export function isBlankCellValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" || EMPTY_TEXT_MARKERS.has(trimmed.toLowerCase());
  }
  return false;
}

/** Render a cell value as display text, mapping empty markers to "". */
export function cellText(value: ColumnValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return isBlankCellValue(value) ? "" : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value) ?? "";
}

/**
 * Best-effort text for a title/primary cell. Strings/numbers pass through;
 * objects (person, option, etc.) resolve to their label/name so a title
 * never renders as "[object Object]".
 */
export function cellTitleText(value: ColumnValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return cellText(value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => cellTitleText(entry as ColumnValue)).filter(Boolean).join(", ");
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of ["label", "name", "title", "text", "value"]) {
      const candidate = obj[key];
      if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    }
  }
  return "";
}

/**
 * Serialize a cell value for `cell_values.value_text`.
 * Null/undefined become "" instead of the literal string "null".
 */
export function toValueText(value: ColumnValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value) ?? "";
}