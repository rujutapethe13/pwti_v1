import * as XLSX from "xlsx";
import type {
  ColumnDefinition,
  ColumnTypeKey,
  ColumnValue,
  DropdownOption,
  Group,
} from "../types";
import { columnTypeRegistry } from "../column-registry";
import {
  normalizeOptions,
  resolveOptionDisplay,
  stableOptionId,
} from "./option-lookup";

export { normalizeOptions };

/* ─────────────────────────────────────────────────────────────
 * Constants
 * ───────────────────────────────────────────────────────────── */

export const MAX_IMPORT_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_IMPORT_ROWS = 10_000;
export const PREVIEW_ROW_COUNT = 5;

export const SUPPORTED_IMPORT_EXTENSIONS = [".xlsx", ".xls", ".csv"] as const;
export type SupportedImportExtension = (typeof SUPPORTED_IMPORT_EXTENSIONS)[number];

/** Column types a user can create from the import wizard. Excludes
 *  derived/connected-only types that need a server-side target. */
export const CREATABLE_IMPORT_TYPES: ColumnTypeKey[] = [
  "text",
  "long_text",
  "number",
  "currency",
  "date",
  "status",
  "priority",
  "dropdown",
  "checkbox",
  "person",
  "email",
  "phone",
  "url",
  "rating",
  "tags",
];

/* ─────────────────────────────────────────────────────────────
 * Types
 * ───────────────────────────────────────────────────────────── */

export interface ParsedFile {
  headers: string[];
  rows: Array<Record<string, ColumnValue>>;
  totalRowCount: number;
}

export type ColumnMappingAction =
  | { kind: "skip" }
  | { kind: "existing"; columnId: string }
  | { kind: "create"; type: ColumnTypeKey; label: string };

export interface ColumnMapping {
  /** Unique per-mapping row identifier. */
  id: string;
  /** The original column header from the file. */
  fileColumn: string;
  action: ColumnMappingAction;
}

export interface OptionMapping {
  /** A raw value found in the file. */
  rawValue: string;
  /** Target existing option label, or null to auto-create a new one. */
  targetLabel: string | null;
  createNew: boolean;
}

export interface FileValidationError {
  code:
    | "unsupported_type"
    | "too_large"
    | "empty"
    | "no_headers"
    | "too_many_rows"
    | "read_failed";
  message: string;
}

export interface ColumnMappingValidation {
  valid: boolean;
  mappedCount: number;
  createCount: number;
  errors: string[];
  warnings: string[];
}

export function getMappableMappings(
  mappings: ColumnMapping[],
  titleColumnFileHeader: string | null,
): ColumnMapping[] {
  if (!titleColumnFileHeader) return mappings;
  return mappings.filter((mapping) => mapping.fileColumn !== titleColumnFileHeader);
}

export function getMappedExistingColumnIds(mappings: ColumnMapping[]): string[] {
  const columnIds = new Set<string>();
  for (const mapping of mappings) {
    if (mapping.action.kind === "existing") {
      columnIds.add(mapping.action.columnId);
    }
  }
  return Array.from(columnIds);
}

export function isProtectedImportColumn(column: ColumnDefinition): boolean {
  const label = column.label.trim().toLowerCase();
  const key = column.key.trim().toLowerCase();
  return (
    label === "status" ||
    label === "assigned to" ||
    key === "status" ||
    key === "assigned_to"
  );
}

export function getColumnIdsToDelete(
  columns: ColumnDefinition[],
  mappedColumnIds: string[],
): string[] {
  const mapped = new Set(mappedColumnIds);
  return columns
    .filter(
      (column) => !mapped.has(column.id) && !isProtectedImportColumn(column),
    )
    .map((column) => column.id);
}

export interface BuildRecordInput {
  mapping: ColumnMapping;
  /** Existing columns on the board, after any "create new" columns have been added. */
  effectiveColumns: ColumnDefinition[];
  /** For status/person columns, the option mapping chosen by the user. */
  optionMappings?: Record<string, Record<string, OptionMapping>>;
}

/* ─────────────────────────────────────────────────────────────
 * File validation
 * ───────────────────────────────────────────────────────────── */

export function validateImportFile(file: File): FileValidationError | null {
  const name = file.name.toLowerCase();
  const isSupported = SUPPORTED_IMPORT_EXTENSIONS.some((ext) => name.endsWith(ext));
  if (!isSupported) {
    return {
      code: "unsupported_type",
      message: `Unsupported file type. Please upload ${SUPPORTED_IMPORT_EXTENSIONS.join(", ")}.`,
    };
  }
  if (file.size > MAX_IMPORT_FILE_SIZE_BYTES) {
    const sizeMb = (MAX_IMPORT_FILE_SIZE_BYTES / (1024 * 1024)).toFixed(0);
    return {
      code: "too_large",
      message: `File is too large. Maximum size is ${sizeMb} MB.`,
    };
  }
  if (file.size === 0) {
    return {
      code: "empty",
      message: "The file is empty.",
    };
  }
  return null;
}

/* ─────────────────────────────────────────────────────────────
 * File parsing
 * ───────────────────────────────────────────────────────────── */

function normalizeHeader(header: unknown, index: number): string {
  if (header === null || header === undefined || header === "") {
    return `Column ${index + 1}`;
  }
  return String(header).trim();
}

function normalizeCellValue(value: unknown): ColumnValue {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    // Excel DATE: when cellDates is not set, dates come through as numbers
    // (serial day count). When reading with `raw: true`, the caller can choose
    // to use the date serialization. We default to string preservation here
    // so that the export/import round-trip stays lossless for non-date types.
    return trimmed;
  }
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/** Parse an in-memory workbook (parsed from any supported file type). */
function parseWorkbook(workbook: XLSX.WorkBook): ParsedFile {
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error("The file contains no sheets.");
  }
  const sheet = workbook.Sheets[firstSheetName];
  if (!sheet) {
    throw new Error("The first sheet could not be read.");
  }
  const matrix: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    raw: false,
  });
  if (matrix.length === 0) {
    throw new Error("The file is empty.");
  }
  const headerRow = (matrix[0] ?? []) as unknown[];
  const headers = headerRow.map((h, i) => normalizeHeader(h, i));
  const dataRows = matrix.slice(1);
  if (dataRows.length === 0) {
    return { headers, rows: [], totalRowCount: 0 };
  }
  if (dataRows.length > MAX_IMPORT_ROWS) {
    throw new Error(
      `File has too many rows (${dataRows.length}). Maximum is ${MAX_IMPORT_ROWS}.`,
    );
  }
  const rows: Array<Record<string, ColumnValue>> = dataRows.map((row) => {
    const arr = (Array.isArray(row) ? row : []) as unknown[];
    const out: Record<string, ColumnValue> = {};
    headers.forEach((header, idx) => {
      out[header] = normalizeCellValue(arr[idx]);
    });
    return out;
  });
  console.info(
    `[import] Parsed workbook: ${headers.length} headers, ${rows.length} rows`,
  );
  console.info("[import] Headers:", headers);
  if (rows.length > 0) {
    console.info("[import] Sample row 0:", JSON.stringify(rows[0]));
  }
  return { headers, rows, totalRowCount: rows.length };
}

export async function parseFile(file: File): Promise<ParsedFile> {
  const buffer = await file.arrayBuffer();
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(new Uint8Array(buffer), { type: "array", cellDates: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown read error.";
    throw new Error(`Could not read file: ${message}`);
  }
  return parseWorkbook(workbook);
}

/** Test-friendly synchronous parser that accepts an array buffer directly. */
export function parseBuffer(buffer: ArrayBuffer): ParsedFile {
  const workbook = XLSX.read(new Uint8Array(buffer), { type: "array", cellDates: true });
  return parseWorkbook(workbook);
}

/* ─────────────────────────────────────────────────────────────
 * Auto-mapping
 * ───────────────────────────────────────────────────────────── */

function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s_\-]+/g, "")
    .trim();
}

/** Returns a similarity score 0..1 using the longest-common-substring ratio. */
function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) {
    return Math.min(a.length, b.length) / Math.max(a.length, b.length);
  }
  // Simple token overlap (handles "Client" → "Client Name").
  const aTokens = new Set(a.split(/(?=[A-Z])|[\s_\-]+/).filter(Boolean));
  const bTokens = new Set(b.split(/(?=[A-Z])|[\s_\-]+/).filter(Boolean));
  if (aTokens.size === 0 || bTokens.size === 0) return 0;
  let overlap = 0;
  for (const t of aTokens) if (bTokens.has(t)) overlap++;
  return overlap / Math.max(aTokens.size, bTokens.size);
}

export function suggestColumnMapping(
  fileHeader: string,
  existingColumns: ColumnDefinition[],
): { columnId: string; score: number } | null {
  const target = normalizeForMatch(fileHeader);
  if (!target) return null;
  let best: { columnId: string; score: number } | null = null;
  for (const col of existingColumns) {
    const score = similarity(target, normalizeForMatch(col.label));
    if (score > 0 && (!best || score > best.score)) {
      best = { columnId: col.id, score };
    }
  }
  if (!best) return null;
  // Require at least a token/contains match to avoid spurious mappings.
  if (best.score < 0.5) return null;
  return best;
}

export function buildInitialMappings(
  headers: string[],
  existingColumns: ColumnDefinition[],
): ColumnMapping[] {
  return headers.map((header, index) => {
    const suggestion = suggestColumnMapping(header, existingColumns);
    if (suggestion) {
      return {
        id: `mapping-${index}`,
        fileColumn: header,
        action: { kind: "existing", columnId: suggestion.columnId },
      };
    }
    return { id: `mapping-${index}`, fileColumn: header, action: { kind: "skip" } };
  });
}

/* ─────────────────────────────────────────────────────────────
 * Mapping validation
 * ───────────────────────────────────────────────────────────── */

export function validateMappings(
  mappings: ColumnMapping[],
  existingColumns: ColumnDefinition[],
  newColumns: ColumnDefinition[],
): ColumnMappingValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  let mappedCount = 0;
  let createCount = 0;

  for (const m of mappings) {
    if (m.action.kind === "skip") continue;
    mappedCount += 1;
    if (m.action.kind === "existing") {
      const targetId = m.action.columnId;
      const target = existingColumns.find((c) => c.id === targetId);
      if (!target) {
        errors.push(`"${m.fileColumn}" is mapped to a column that no longer exists.`);
      }
      if (target && isOptionColumn(target)) {
        const opts = normalizeOptions(target.settings?.options);
        const emptyLabels = opts.filter((o) => !o.label && o.id).map((o) => o.id);
        if (emptyLabels.length > 0) {
          warnings.push(
            `"${target.label}" has ${emptyLabels.length} option(s) with missing labels (IDs: ${emptyLabels.slice(0, 3).join(", ")}${emptyLabels.length > 3 ? "..." : ""}). These will appear as raw IDs in charts and exports.`,
          );
        }
      }
    } else if (m.action.kind === "create") {
      createCount += 1;
      const createLabel = m.action.label;
      if (!createLabel.trim()) {
        errors.push(`"${m.fileColumn}" needs a column name when creating a new column.`);
      }
      if (!CREATABLE_IMPORT_TYPES.includes(m.action.type)) {
        errors.push(`"${m.fileColumn}" cannot be created as type "${m.action.type}".`);
      }
    }
  }
  // Detect duplicate new-column labels
  const newLabels = new Map<string, number>();
  for (const m of mappings) {
    if (m.action.kind !== "create") continue;
    const key = m.action.label.trim().toLowerCase();
    if (!key) continue;
    newLabels.set(key, (newLabels.get(key) ?? 0) + 1);
  }
  for (const [label, count] of newLabels) {
    if (count > 1) {
      errors.push(`Multiple new columns would share the name "${label}".`);
    }
  }
  // Detect a new label colliding with an existing column label
  const existingLabels = new Set(
    existingColumns.map((c) => c.label.trim().toLowerCase()),
  );
  for (const m of mappings) {
    if (m.action.kind !== "create") continue;
    const key = m.action.label.trim().toLowerCase();
    if (existingLabels.has(key)) {
      errors.push(
        `"${m.action.label}" already exists as a board column. Map to it instead.`,
      );
    }
  }
  return {
    valid: mappedCount > 0 && errors.length === 0,
    mappedCount,
    createCount,
    errors,
    warnings,
  };
}

/* ─────────────────────────────────────────────────────────────
 * Build columns to be created from mappings
 * ───────────────────────────────────────────────────────────── */

function slugifyKey(label: string): string {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60) || "imported_column"
  );
}

export function buildNewColumnsFromMappings(
  boardId: string,
  mappings: ColumnMapping[],
  startOrder: number,
  existingColumns?: ColumnDefinition[],
): ColumnDefinition[] {
  const now = new Date().toISOString();
  const result: ColumnDefinition[] = [];
  const usedSlugs = new Set((existingColumns ?? []).map((column) => column.key));
  let order = startOrder;

  const existingByNormalized = new Map<string, ColumnDefinition>();
  const createdNormalized = new Set<string>();
  for (const col of existingColumns ?? []) {
    existingByNormalized.set(col.label.trim().toLowerCase(), col);
  }

  for (const m of mappings) {
    if (m.action.kind !== "create") continue;
    const normalizedLabel = m.action.label.trim().toLowerCase();

    if (
      existingByNormalized.has(normalizedLabel) ||
      createdNormalized.has(normalizedLabel)
    ) {
      continue;
    }
    createdNormalized.add(normalizedLabel);

    const type = m.action.type;
    const def = columnTypeRegistry[type];
    const settings: Record<string, unknown> = {};
    if (def?.defaultOptions) {
      settings.options = def.defaultOptions.map((opt) => ({ ...opt }));
    }
    const baseSlug = slugifyKey(m.action.label);
    let slugifiedKey = baseSlug;
    let slugSuffix = 2;
    while (usedSlugs.has(slugifiedKey)) {
      slugifiedKey = `${baseSlug}_${slugSuffix}`;
      slugSuffix += 1;
    }
    usedSlugs.add(slugifiedKey);
    const column: ColumnDefinition = {
      id: `col-import-${slugifiedKey}`,
      boardId,
      key: slugifiedKey,
      label: m.action.label.trim(),
      type,
      required: false,
      hidden: false,
      frozen: false,
      defaultValue: def?.defaultValue ?? null,
      settings,
      permissions: {
        view: ["owner", "editor", "commenter", "viewer"],
        edit: ["owner", "editor"],
        configure: ["owner"],
      },
      validation: [],
      version: 1,
      order,
      createdAt: now,
      updatedAt: now,
    };
    result.push(column);
    order += 1;
  }
  return result;
}

/* ─────────────────────────────────────────────────────────────
 * Build a single record from one parsed row
 * ───────────────────────────────────────────────────────────── */

/**
 * Parse a date value that may come from Excel/CSV in any common
 * spreadsheet format and return a YYYY-MM-DD string.
 *
 * Excel's CSV exports typically use dd-mm-yyyy or dd/mm/yyyy. Locale
 * exports may use mm/dd/yyyy. Native JS Date parsing only accepts ISO
 * 8601 reliably, so we explicitly try the common formats before
 * falling back to a heuristic.
 *
 * Ambiguous formats like "01-02-2026" are interpreted as dd-mm-yyyy
 * (matches what spreadsheet tools write by default for non-US locales).
 */
function parseImportDate(raw: string | number): string | null {
  if (typeof raw === "number") {
    // Excel serial day number: days since 1899-12-30 (account for the
    // 1900 leap-year bug).
    const epoch = Date.UTC(1899, 11, 30);
    const ms = epoch + raw * 86400000;
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    return null;
  }
  const s = String(raw).trim();
  if (!s) return null;
  // ISO 8601: YYYY-MM-DD or with time.
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  // dd-mm-yyyy or dd/mm/yyyy (day-first).
  const dmy = s.match(/^(\d{1,2})[\-\/\.](\d{1,2})[\-\/\.](\d{2,4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    let year = Number(dmy[3]);
    if (year < 100) year += year < 70 ? 2000 : 1900;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const d = new Date(Date.UTC(year, month - 1, day));
      if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
  }
  // mm-dd-yyyy (US format) as a last resort.
  const mdy = s.match(/^(\d{1,2})[\-\/\.](\d{1,2})[\-\/\.](\d{2,4})$/);
  if (mdy) {
    const month = Number(mdy[1]);
    const day = Number(mdy[2]);
    let year = Number(mdy[3]);
    if (year < 100) year += year < 70 ? 2000 : 1900;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const d = new Date(Date.UTC(year, month - 1, day));
      if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
  }
  // Native fallback (handles "Sep 1 2026" etc.).
  const fallback = new Date(s);
  if (!Number.isNaN(fallback.getTime())) {
    return fallback.toISOString().slice(0, 10);
  }
  return null;
}

function coerceForColumn(
  raw: ColumnValue,
  column: ColumnDefinition,
  optionMapping?: OptionMapping,
): ColumnValue {
  if (raw === null || raw === undefined) return column.defaultValue;
  switch (column.type) {
    case "checkbox":
      if (typeof raw === "boolean") return raw;
      if (typeof raw === "number") return raw !== 0;
      const s = String(raw).toLowerCase().trim();
      return s === "true" || s === "yes" || s === "1" || s === "y";
    case "number":
    case "currency":
    case "rating":
    case "progress": {
      if (typeof raw === "number") return raw;
      const cleaned = String(raw).replace(/[, $€£¥]/g, "");
      const n = Number(cleaned);
      return Number.isFinite(n) ? n : (column.defaultValue ?? 0);
    }
    case "date": {
      if (raw instanceof Date) {
        return raw.toISOString().slice(0, 10);
      }
      if (typeof raw === "string" || typeof raw === "number") {
        const parsed = parseImportDate(raw);
        if (parsed) return parsed;
      }
      return null;
    }
    case "status":
    case "priority":
    case "dropdown": {
      const rawString = typeof raw === "string" ? raw : String(raw);
      const rawTarget = optionMapping?.targetLabel ?? rawString;
      const targetValue = /^opt[-_]import[-_]\d/i.test(rawTarget) ? rawString : rawTarget;
      const options = normalizeOptions(column.settings?.options);
      const exactOption = options.find((option) => option.id === targetValue);
      if (exactOption) return exactOption.id;
      const matchedOption = options.find(
        (option) => option.label.toLowerCase() === targetValue.toLowerCase(),
      );
      return matchedOption?.id ?? targetValue;
    }
    case "tags":
    case "multi_select": {
      if (Array.isArray(raw)) return raw.map(String);
      if (typeof raw === "string") {
        return raw
          .split(/[,;|]/)
          .map((s) => s.trim())
          .filter(Boolean);
      }
      return [];
    }
    case "person":
    case "email":
    case "phone":
    case "url":
    case "text":
    case "long_text":
    default:
      return typeof raw === "string" ? raw : String(raw);
  }
}

export interface BuiltRecord {
  recordTitle: string;
  cellValues: Record<string, ColumnValue>;
  rowIndex: number;
  rawRow: Record<string, ColumnValue>;
  /** Set of column IDs whose raw value was a recognized problem. */
  warnings: string[];
}

export function buildRecordFromRow(
  row: Record<string, ColumnValue>,
  rowIndex: number,
  mappings: ColumnMapping[],
  effectiveColumns: ColumnDefinition[],
  titleColumnFileHeader: string | null,
  optionMappings?: Record<string, Record<string, OptionMapping>>,
): BuiltRecord {
  const cellValues: Record<string, ColumnValue> = {};
  const warnings: string[] = [];
  const regularMappings = getMappableMappings(mappings, titleColumnFileHeader);
  const rawTitle =
    titleColumnFileHeader !== null ? row[titleColumnFileHeader] : null;
  let recordTitle =
    rawTitle !== null && rawTitle !== undefined && rawTitle !== ""
      ? String(rawTitle)
      : `Imported row ${rowIndex + 1}`;

  for (const m of regularMappings) {
    if (m.action.kind === "skip") continue;
    let column: ColumnDefinition | undefined;
    if (m.action.kind === "existing") {
      const targetColumnId = m.action.columnId;
      column = effectiveColumns.find((c) => c.id === targetColumnId);
    } else {
      const createLabel = m.action.label;
      column = effectiveColumns.find(
        (c) => c.label.trim().toLowerCase() === createLabel.trim().toLowerCase(),
      );
    }
     if (!column) {
       continue;
     }
     const raw = row[m.fileColumn];
     const optMap = optionMappings?.[m.fileColumn]?.[String(raw ?? "")];
     const coerced = coerceForColumn(raw ?? null, column, optMap);
     cellValues[column.id] = coerced;
     if (raw !== null && raw !== undefined && raw !== "") {
       const needsOptionCheck =
         column.type === "status" ||
         column.type === "priority" ||
         column.type === "dropdown";
       if (needsOptionCheck && !optMap) {
         warnings.push(column.id);
       }
     }
   }
   if (!recordTitle) {
     recordTitle = `Imported row ${rowIndex + 1}`;
   }
   return { recordTitle, cellValues, rowIndex, rawRow: row, warnings };
}

/* ─────────────────────────────────────────────────────────────
 * Find unmatched option values (for the status/option preview screen)
 * ───────────────────────────────────────────────────────────── */

export function findUnmatchedOptions(
  rows: Array<Record<string, ColumnValue>>,
  mappings: ColumnMapping[],
  existingColumns: ColumnDefinition[],
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const m of mappings) {
    if (m.action.kind !== "existing") continue;
    const targetId = m.action.columnId;
    const column = existingColumns.find((c) => c.id === targetId);
    if (!column) continue;
    if (
      column.type !== "status" &&
      column.type !== "priority" &&
      column.type !== "dropdown" &&
      column.type !== "person"
    ) {
      continue;
    }
    const optionLabels = new Set<string>();
    const settingsOptions = column.settings?.options;
    if (Array.isArray(settingsOptions)) {
      for (const opt of settingsOptions) {
        if (typeof opt === "string") optionLabels.add(opt);
        else if (
          opt &&
          typeof opt === "object" &&
          "label" in (opt as Record<string, unknown>)
        ) {
          optionLabels.add(String((opt as Record<string, unknown>).label));
        }
      }
    }
    const unmatched = new Set<string>();
    for (const row of rows) {
      const raw = row[m.fileColumn];
      if (raw === null || raw === undefined || raw === "") continue;
      const value = String(raw).trim();
      if (!value) continue;
      if (column.type === "person") {
        // For person columns we can't reliably validate without directory data,
        // so we always surface values for the user to review.
        unmatched.add(value);
        continue;
      }
      const matchFound = Array.from(optionLabels).some(
        (label) => label.toLowerCase() === value.toLowerCase(),
      );
      if (!matchFound) unmatched.add(value);
    }
    if (unmatched.size > 0) {
      result[m.fileColumn] = Array.from(unmatched);
    }
  }
  return result;
}

/* ─────────────────────────────────────────────────────────────
 * Option column helpers
 * ───────────────────────────────────────────────────────────── */

/** Column types whose `settings.options` array is the source of truth
 *  for the dropdown/select list of a cell. */
/** Column types whose `settings.options` array is the source of truth
 *  for the dropdown/select list of a cell. `multi_select` is handled
 *  separately because its cell value is an array. */
export function isOptionColumn(column: ColumnDefinition): boolean {
  return (
    column.type === "status" || column.type === "priority" || column.type === "dropdown"
  );
}

/** Resolve a cell value (which may be a raw label string or an option id)
 *  into the matching option id stored on the column. Values that cannot be
 *  matched are returned unchanged so callers can detect them. */
export function resolveOptionIdForColumn(
  column: ColumnDefinition,
  value: ColumnValue,
): ColumnValue {
  if (typeof value !== "string" || value.length === 0) return value;
  const options = normalizeOptions(column.settings?.options);
  if (options.some((o) => o.id === value)) return value;
  const byLabel = options.find((o) => o.label.toLowerCase() === value.toLowerCase());
  return byLabel ? byLabel.id : value;
}

/** Result of repairing the option list / cell references of a dropdown column. */
export interface DropdownColumnRepair {
  /** Column with a reconciled, complete `settings.options` array. */
  updatedColumn: ColumnDefinition;
  /** Cell values to relink: `recordId` -> resolved option id. */
  relinks: Array<{ recordId: string; value: string }>;
  /** Labels of options that had to be created during the repair. */
  createdOptionLabels: string[];
}

/**
 * Retroactively repair a single dropdown-style column whose rows may hold
 * raw label strings (the pre-fix import bug) instead of option id foreign keys.
 *
 * For every cell value that is not already an option id:
 *  - if it matches an existing option's label (case-insensitive), relink it
 *    to that option's id;
 *  - otherwise create a new option for it and relink the cell to the new id.
 *
 * The pass is idempotent: cells that already reference a valid option id or
 * whose label already has a matching option are left untouched, and options
 * are never duplicated.
 */
export function reconcileDropdownColumnOptions(
  column: ColumnDefinition,
  cellValues: Array<{ recordId: string; value: ColumnValue }>,
): DropdownColumnRepair {
  const existing = normalizeOptions(column.settings?.options);
  const labelKey = (l: string) => l.toLowerCase();
  const idToOption = new Map<string, DropdownOption>();
  const labelToOption = new Map<string, DropdownOption>();
  for (const opt of existing) {
    idToOption.set(opt.id, opt);
    if (opt.label) labelToOption.set(labelKey(opt.label), opt);
  }

  const additions: DropdownOption[] = [];
  const takenIds = new Set(existing.map((o) => o.id));
  const processedLabels = new Set<string>();

  const ensureOption = (label: string): DropdownOption => {
    const key = labelKey(label);
    const existingOpt = labelToOption.get(key);
    if (existingOpt) return existingOpt;
    const existingAdd = additions.find((a) => labelKey(a.label) === key);
    if (existingAdd) return existingAdd;
    const newOpt: DropdownOption = {
      id: stableOptionId(label.trim(), takenIds),
      label,
    };
    takenIds.add(newOpt.id);
    additions.push(newOpt);
    labelToOption.set(key, newOpt);
    idToOption.set(newOpt.id, newOpt);
    return newOpt;
  };

  const relinks: Array<{ recordId: string; value: string }> = [];
  const createdOptionLabels: string[] = [];

  for (const cell of cellValues) {
    if (cell.value === null || cell.value === undefined || cell.value === "") continue;
    if (typeof cell.value !== "string") continue;
    const rawValue = cell.value.trim();
    if (!rawValue) continue;

    // Already references a valid option id → nothing to do.
    if (idToOption.has(rawValue)) continue;

    // Matches an existing option's label → relink to its id.
    const byLabel = labelToOption.get(labelKey(rawValue));
    if (byLabel) {
      relinks.push({ recordId: cell.recordId, value: byLabel.id });
      continue;
    }

    // A raw label with no matching option → create one (once) and relink.
    if (!processedLabels.has(labelKey(rawValue))) {
      processedLabels.add(labelKey(rawValue));
      const newOpt = ensureOption(rawValue);
      createdOptionLabels.push(newOpt.label);
    }
    const opt = labelToOption.get(labelKey(rawValue))!;
    relinks.push({ recordId: cell.recordId, value: opt.id });
  }

  const updatedColumn: ColumnDefinition = {
    ...column,
    settings: {
      ...column.settings,
      options: [...existing, ...additions],
    },
    updatedAt: new Date().toISOString(),
  };

  return { updatedColumn, relinks, createdOptionLabels };
}

/* ─────────────────────────────────────────────────────────────
 * Apply option mappings to a column's settings.options array
 * ───────────────────────────────────────────────────────────── */

/**
 * Returns the column-to-fileColumn mapping pairs for dropdown-style columns.
 *
 * The dropdown's option list must be the single source of truth: every unique
 * value that appears in a mapped dropdown column across ALL rows must exist as
 * an actual option (with a stable id) in `column.settings.options`, otherwise
 * the cell renders the value as plain display text but the dropdown itself
 * shows an empty list ("Edit Labels" / "+ New label" only).
 *
 * `optionMappings` honors explicit user choices from the unmatched-values
 * review step; the `rows` scan guarantees that *every* unique raw value is
 * committed as an option even when the user never touched that UI (in which
 * case `optionMappings` is empty). Options are deduplicated by label
 * (case-insensitive) and normalized to `{ id, label, color? }` objects.
 */
export function applyOptionMappingsToColumns(
  columns: ColumnDefinition[],
  mappings: ColumnMapping[],
  optionMappings: Record<string, Record<string, OptionMapping>>,
  rows: Array<Record<string, ColumnValue>> = [],
): ColumnDefinition[] {
  return columns.map((column) => {
    if (!isOptionColumn(column)) return column;

    // Which file-column header is mapped to this target column?
    const fileColumn = mappings.find((m) => {
      if (m.action.kind === "existing") return m.action.columnId === column.id;
      if (m.action.kind === "create") {
        return (
          column.label.trim().toLowerCase() === m.action.label.trim().toLowerCase() &&
          column.type === m.action.type
        );
      }
      return false;
    })?.fileColumn;
    if (!fileColumn) return column;

    const perFile = optionMappings[fileColumn] ?? {};
    const existing = normalizeOptions(column.settings?.options);
    const labelToOption = new Map<string, DropdownOption>();
    for (const opt of existing) {
      if (opt.label) labelToOption.set(opt.label.toLowerCase(), opt);
    }

    const additions: DropdownOption[] = [];
    const takenIds = new Set(existing.map((o) => o.id));

    const ensureOption = (label: string): string => {
      const key = label.toLowerCase();
      const existingOpt = labelToOption.get(key);
      if (existingOpt) return existingOpt.id;
      const existingAdd = additions.find((a) => a.label.toLowerCase() === key);
      if (existingAdd) return existingAdd.id;
      // Deterministic id: re-importing the same data reuses the same option
      // rather than appending a duplicate with a fresh timestamp.
      const newOpt: DropdownOption = {
        id: stableOptionId(label.trim(), takenIds),
        label,
      };
      takenIds.add(newOpt.id);
      additions.push(newOpt);
      labelToOption.set(key, newOpt);
      return newOpt.id;
    };

    // 1) Honor explicit user option mappings for new options.
    for (const opt of Object.values(perFile)) {
      if (!opt.createNew) continue;
      const label = opt.targetLabel?.trim();
      if (!label) continue;
      ensureOption(label);
    }

    // 2) Commit every unique raw value found in the rows as an option.
    //    This is the self-correcting step: without it, a column whose
    //    `optionMappings` state is empty leaves the dropdown option list
    //    empty while cells hold raw label strings. Explicit user mappings
    //    (createNew with a custom label, or mapped to an existing label) are
    //    honored; any value with no mapping is auto-created using the raw
    //    value as its label.
    const seen = new Set<string>();
    for (const row of rows) {
      const raw = row[fileColumn];
      if (raw === null || raw === undefined || raw === "") continue;
      const value = typeof raw === "string" ? raw.trim() : String(raw);
      if (!value || seen.has(value)) continue;
      seen.add(value);

      const userMapping = perFile[value];
      if (userMapping && userMapping.targetLabel?.trim()) {
        // User explicitly chose a target label for this value — honor it.
        ensureOption(userMapping.targetLabel.trim());
      } else {
        // No explicit mapping: auto-create an option using the raw value.
        ensureOption(value);
      }
    }

    if (additions.length === 0) return column;

    return {
      ...column,
      settings: {
        ...column.settings,
        options: [...existing, ...additions],
      },
      updatedAt: new Date().toISOString(),
    };
  });
}

/* ─────────────────────────────────────────────────────────────
 * Build a default title column from a file
 * ───────────────────────────────────────────────────────────── */

export function findBestTitleColumn(
  headers: string[],
  existingColumns: ColumnDefinition[],
): string | null {
  const titleLikeHeaders = new Set(
    [
      "name",
      "title",
      "client",
      "client name",
      "company name",
      "customer name",
      "account name",
      "project name",
      "record name",
      "item name",
    ].map(normalizeForMatch),
  );
  const titleTokens = [
    "client",
    "company",
    "customer",
    "account",
    "project",
    "record",
    "item",
  ];

  const exactTitleLike = headers.find((header) => {
    const normalized = normalizeForMatch(header);
    if (titleLikeHeaders.has(normalized)) return true;
    return titleTokens.some(
      (token) =>
        normalized.includes(token) &&
        (normalized.includes("name") || normalized.includes("title")),
    );
  });
  if (exactTitleLike) return exactTitleLike;

  const textColumns = existingColumns.filter(
    (column) => column.type === "text" || column.type === "long_text",
  );
  const suggestedTextColumn = headers.find((header) => {
    const target = normalizeForMatch(header);
    if (!target) return false;
    return textColumns.some((column) => {
      const candidate = normalizeForMatch(column.label);
      if (!candidate) return false;
      if (target === candidate || target.includes(candidate) || candidate.includes(target)) {
        return true;
      }
      const targetTokens = new Set(target.split(/(?=[A-Z])|[\s_\-]+/).filter(Boolean));
      const candidateTokens = new Set(
        candidate.split(/(?=[A-Z])|[\s_\-]+/).filter(Boolean),
      );
      if (targetTokens.size === 0 || candidateTokens.size === 0) return false;
      const overlap = [...targetTokens].filter((token) => candidateTokens.has(token)).length;
      return overlap / Math.max(targetTokens.size, candidateTokens.size) >= 0.4;
    });
  });
  return suggestedTextColumn ?? null;
}

/* ─────────────────────────────────────────────────────────────
 * Build a single workbook from a list of records (for export)
 *
 * Uses Option B (flat sheet with a "Group" column) per the spec — easier
 * to re-import and preserves the data shape.
 * ───────────────────────────────────────────────────────────── */

export interface ExportInput {
  boardName: string;
  columns: ColumnDefinition[];
  /**
   * Current column order from the board's view state — an array of column IDs
   * in the order they appear in the UI table headers. When omitted, the export
   * falls back to sorting `columns` by their `order` field.
   */
  columnOrder?: string[];
  /**
   * Label for the primary / record-title column ("Name", "Client Name", etc.).
   * Defaults to "Name" when not provided. This column is always included in
   * the export as the first column, mirroring the sticky title column in the
   * board view.
   */
  primaryColumnLabel?: string;
  records: Array<{
    record: { id: string; title: string; groupId: string | null };
    cellValues: Record<string, ColumnValue>;
  }>;
  groups: Group[];
  /** If true, only export records currently visible (after filters/sort). */
  visibleRecordIds?: Set<string>;
}

/** Synthetic column ID for the record-title (primary) column. */
export const RECORD_TITLE_COLUMN_ID = "__record_title";

/**
 * Resolve a single cell value into a human-friendly export value, switching
 * explicitly on `column.type` so that option-based columns (status, priority,
 * dropdown) export their display label rather than a raw option ID or
 * `[object Object]`, and date columns export a real Date.
 *
 * Unlike the deprecated `valueToCell`, this never silently produces blank
 * output for non-string values — objects with a `label` are unwrapped, and
 * only genuinely empty (null/undefined/empty-string) values yield `""`.
 */
export function getExportValue(
  column: ColumnDefinition,
  cell: ColumnValue,
): string | number | Date | null {
  if (cell === null || cell === undefined) {
    return "";
  }

  // Status / priority / dropdown columns store option IDs (or occasionally
  // label strings or `{ label, color }` objects). Resolve to the label.
  if (isOptionColumn(column)) {
    return resolveOptionLabel(column, cell);
  }

  // multi_select stores an array of option IDs / labels / objects.
  if (column.type === "multi_select") {
    if (Array.isArray(cell)) {
      const options = normalizeOptions(column.settings?.options);
      return cell
        .map((v) => resolveOptionLabelFromValue(options, v))
        .filter((v) => v !== "")
        .join(", ");
    }
    return typeof cell === "object"
      ? resolveOptionLabelFromValue([], cell)
      : String(cell);
  }

  // Date columns: return a real Date so XLSX serialises it properly.
  if (column.type === "date") {
    if (cell instanceof Date) return cell;
    if (typeof cell === "string") {
      const d = new Date(cell);
      if (!Number.isNaN(d.getTime())) return d;
    }
    if (typeof cell === "number") {
      const d = new Date(cell);
      if (!Number.isNaN(d.getTime())) return d;
    }
    return String(cell);
  }

  // Timeline columns store `{ start, end }` date ranges.
  if (column.type === "timeline") {
    if (typeof cell === "object" && cell !== null && !Array.isArray(cell)) {
      const obj = cell as Record<string, unknown>;
      const start = formatExportDate(obj.start);
      const end = formatExportDate(obj.end);
      const combined = [start, end].filter(Boolean).join(" → ");
      return combined || "";
    }
    return String(cell);
  }

  // Checkbox columns.
  if (column.type === "checkbox") {
    if (typeof cell === "boolean") return cell ? "Yes" : "No";
    return String(cell);
  }

  // Numeric columns — return the raw number so Excel keeps its type.
  if (
    column.type === "number" ||
    column.type === "currency" ||
    column.type === "rating" ||
    column.type === "progress"
  ) {
    if (typeof cell === "number") return cell;
    if (typeof cell === "string") {
      const n = Number(cell);
      if (!Number.isNaN(n)) return n;
    }
    return String(cell);
  }

  // Array values (tags, files, etc.).
  if (Array.isArray(cell)) {
    return cell
      .map((v) => {
        if (typeof v === "string") return v;
        if (v && typeof v === "object") {
          const obj = v as Record<string, unknown>;
          if (typeof obj.label === "string") return obj.label;
          if (typeof obj.name === "string") return obj.name;
        }
        return String(v);
      })
      .filter(Boolean)
      .join(", ");
  }

  // Object values (person, connected_board, etc.).
  if (typeof cell === "object" && cell !== null) {
    const obj = cell as Record<string, unknown>;
    if (typeof obj.label === "string") return obj.label;
    if (typeof obj.name === "string") return obj.name;
    return JSON.stringify(cell);
  }

  // Primitives: string, number, boolean.
  return cell as string | number;
}

/** Resolve a cell value for an option column (status / priority / dropdown)
 *  into the option's display label. Handles option-ID strings, label strings,
 *  and `{ label, color }` objects. */
function resolveOptionLabel(column: ColumnDefinition, cell: ColumnValue): string {
  return resolveOptionDisplay(normalizeOptions(column.settings?.options), cell).label;
}

/** Given a normalized option list and a single value (ID, label, or object),
 *  return the option's label. A value that looks like an option id but matches
 *  no option yields the "Unknown option" fallback so a raw `opt-…` id is never
 *  written to the export. */
function resolveOptionLabelFromValue(options: DropdownOption[], value: unknown): string {
  return resolveOptionDisplay(options, value as ColumnValue).label;
}

function formatExportDate(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  const d = new Date(value as string | number);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

/** Build a synthetic ColumnDefinition for the record-title (primary) column. */
export function createExportTitleColumn(label: string): ColumnDefinition {
  return {
    id: RECORD_TITLE_COLUMN_ID,
    boardId: "",
    key: "record_title",
    label,
    type: "text",
    required: false,
    hidden: false,
    frozen: false,
    defaultValue: "",
    settings: {},
    permissions: {
      view: ["owner", "editor", "commenter", "viewer"],
      edit: ["owner", "editor"],
      configure: ["owner"],
    },
    validation: [],
    version: 0,
    order: -1,
    createdAt: "",
    updatedAt: "",
  };
}

export function buildExportWorkbook(input: ExportInput): XLSX.WorkBook {
  const columnsById = new Map<string, ColumnDefinition>();
  for (const col of input.columns) {
    columnsById.set(col.id, col);
  }

  // ── Determine ordered list of column IDs ──────────────────
  // Prefer the board's view-state column order (visibleColumnIds) when
  // provided; otherwise fall back to the in-memory columns array order.
  // In both cases we filter out hidden columns and de-duplicate.
  const primaryLabel = input.primaryColumnLabel ?? "Name";

  let orderedIds: string[];
  if (input.columnOrder && input.columnOrder.length > 0) {
    orderedIds = input.columnOrder.filter((id) => {
      const col = columnsById.get(id);
      if (col === undefined) {
        // Regression guard: a column ID in the view's columnOrder has no
        // matching ColumnDefinition. This previously caused columns to be
        // silently dropped from the export.
        console.warn(
          `[export] Column ID "${id}" in columnOrder has no matching ColumnDefinition — skipping.`,
        );
        return false;
      }
      return !col.hidden;
    });
  } else {
    orderedIds = input.columns
      .filter((c) => !c.hidden)
      .sort((a, b) => a.order - b.order)
      .map((c) => c.id);
  }

  // The primary / record-title column is always present in the export and
  // appears as the very first column — mirroring the sticky title column in
  // the board's table view. It is keyed by RECORD_TITLE_COLUMN_ID so that
  // wherever the user places it in the column order, the data is resolved
  // by that key.
  const titleColumn = createExportTitleColumn(primaryLabel);

  const exportColumns: ColumnDefinition[] = [
    titleColumn,
    ...(orderedIds
      .map((id) => columnsById.get(id))
      .filter(Boolean) as ColumnDefinition[]),
  ];

  const headers = [...exportColumns.map((c) => c.label), "Group"];
  const groupNameById = new Map<string, string>();
  for (const g of input.groups) groupNameById.set(g.id, g.name);

  const aoa: unknown[][] = [headers];
  for (const { record, cellValues } of input.records) {
    if (input.visibleRecordIds !== undefined && !input.visibleRecordIds.has(record.id)) {
      continue;
    }
    const row: unknown[] = [];
    for (const col of exportColumns) {
      let cell: ColumnValue;
      if (col.id === RECORD_TITLE_COLUMN_ID) {
        cell = record.title;
      } else {
        cell = cellValues[col.id] ?? col.defaultValue;
      }
      row.push(getExportValue(col, cell));
    }
    row.push(record.groupId ? (groupNameById.get(record.groupId) ?? "") : "");
    aoa.push(row);
  }
  const sheet = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, input.boardName.slice(0, 31) || "Board");
  return workbook;
}

export function buildExportFilename(boardName: string, now: Date = new Date()): string {
  const safe =
    boardName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 40) || "board";
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${safe}_export_${yyyy}-${mm}-${dd}.xlsx`;
}

export function workbookToArrayBuffer(workbook: XLSX.WorkBook): ArrayBuffer {
  const out = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  return out as ArrayBuffer;
}
