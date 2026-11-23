/**
 * Grid clipboard serialization.
 *
 * The grid copies a rectangular block of cells and must paste it back with the
 * exact same number of rows and columns. TSV alone cannot express that: a
 * trailing empty row is indistinguishable from the newline that terminates the
 * last row, so a plain `rows.join("\n")` round-trip silently drops rows.
 *
 * Copy therefore writes three representations:
 *   - `text/plain`  TSV, for pasting into Excel / Sheets / other apps.
 *   - `text/html`   a <table>, for rich paste targets.
 *   - `application/x-board-cells`  the exact matrix with column metadata, for in-app paste.
 *
 * Paste prefers the exact matrix when it is present (or when the incoming TSV
 * is byte-identical to the matrix we copied), and otherwise falls back to TSV
 * and then HTML, which is what an external clipboard provides.
 */

export type CellMatrix = string[][];

export interface ColumnMeta {
  id: string;
  title: string;
  type: string;
  isPrimary: boolean;
}

export interface GridClipboardPayload {
  version: number;
  sourceBoardId: string;
  columns: ColumnMeta[];
  rows: CellMatrix;
}

/** In-app matrix payload. Namespaced so it never collides with text formats. */
export const GRID_MATRIX_MIME = "application/x-board-cells";
const MATRIX_VERSION = 2;

/** Minimal clipboard surface, so this module is testable without a DOM. */
export interface ClipboardLike {
  getData(format: string): string;
}

/** Quote a value only when it contains a delimiter, quote, or newline. */
export function tsvQuote(value: string): string {
  const s = String(value ?? "");
  return /[\t\n"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Serialize a matrix to TSV. Rows are newline separated, cells tab separated. */
export function matrixToTSV(rows: CellMatrix): string {
  return rows.map((row) => row.map(tsvQuote).join("\t")).join("\n");
}

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Serialize a matrix to an HTML table (spreadsheet apps read this). */
export function matrixToHtml(rows: CellMatrix): string {
  const body = rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
    .join("");
  return `<table>${body}</table>`;
}

/**
 * Parse TSV.
 *
 * A trailing newline terminates the row before it, but spreadsheets treat it as
 * an extra empty row, so `a\n` is two rows: `["a"]` and `[""]`. Dropping it is
 * what made a copied range lose its last row.
 */
export function parseTSV(text: string): CellMatrix {
  const s = String(text ?? "").replace(/\r\n?/g, "\n");
  const rows: CellMatrix = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === "\t") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += ch;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  } else if (s.endsWith("\n")) {
    // The text ended on a row boundary: that row exists and is empty.
    rows.push([""]);
  }
  return rows;
}

/** Serialize a matrix with column metadata for the in-app clipboard format. */
export function serializeMatrix(payload: GridClipboardPayload): string {
  return JSON.stringify(payload);
}

/** Parse the in-app matrix format. Returns null for anything else. */
export function parseMatrix(raw: string | null | undefined): GridClipboardPayload | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const candidate = parsed as { version?: unknown; columns?: unknown; rows?: unknown };
  if (candidate.version !== MATRIX_VERSION || !Array.isArray(candidate.columns) || !Array.isArray(candidate.rows)) return null;
  const columns: ColumnMeta[] = [];
  for (const col of candidate.columns) {
    if (!col || typeof col !== "object") return null;
    const c = col as { id?: unknown; title?: unknown; type?: unknown; isPrimary?: unknown };
    if (typeof c.id !== "string" || typeof c.title !== "string" || typeof c.type !== "string") return null;
    columns.push({ id: c.id, title: c.title, type: c.type, isPrimary: Boolean(c.isPrimary) });
  }
  const rows: CellMatrix = [];
  for (const row of candidate.rows) {
    if (!Array.isArray(row)) return null;
    rows.push(row.map((cell) => (cell == null ? "" : String(cell))));
  }
  return { version: MATRIX_VERSION, sourceBoardId: "", columns, rows };
}

/** Parse an HTML table into a matrix. Used when only `text/html` is available. */
export function parseHtmlTable(html: string): CellMatrix | null {
  if (!html || !/<table[\s>]/i.test(html)) return null;
  const rows: CellMatrix = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRe.exec(html))) {
    const cells: string[] = [];
    let cellMatch: RegExpExecArray | null;
    cellRe.lastIndex = 0;
    while ((cellMatch = cellRe.exec(rowMatch[1]))) {
      cells.push(
        cellMatch[1]
          .replace(/<br\s*\/?>/gi, "\n")
          .replace(/<[^>]+>/g, "")
          .replace(/&nbsp;/g, " ")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&amp;/g, "&"),
      );
    }
    if (cells.length) rows.push(cells);
  }
  return rows.length ? rows : null;
}

export interface ParsedClipboard {
  rows: CellMatrix;
  columns: ColumnMeta[];
  /** True when the row/column counts come from our own copy, not a text guess. */
  exact: boolean;
}

/**
 * Resolve the clipboard into a matrix with column metadata.
 *
 * Order matters: our own matrix wins, then TSV, then HTML. `fallbackTsv` is the
 * text the caller already read; when it matches our serialized TSV we can trust
 * the stored matrix even if the custom MIME type was stripped by the browser.
 */
export function resolveClipboardMatrix(
  clipboard: ClipboardLike | null | undefined,
  fallbackTsv?: string | null,
  internalPayload?: GridClipboardPayload | null,
): ParsedClipboard | null {
  if (clipboard) {
    const exact = parseMatrix(readFormat(clipboard, GRID_MATRIX_MIME));
    if (exact && exact.rows.length) return { rows: exact.rows, columns: exact.columns, exact: true };
  }

  const text = fallbackTsv != null ? fallbackTsv : readFormat(clipboard, "text/plain");
  if (internalPayload && internalPayload.rows.length && text != null && matrixToTSV(internalPayload.rows) === text) {
    return { rows: internalPayload.rows.map((row) => [...row]), columns: internalPayload.columns, exact: true };
  }

  if (text != null) {
    const rows = parseTSV(text);
    if (rows.length) return { rows, columns: [], exact: false };
  }

  const html = readFormat(clipboard, "text/html");
  if (html) {
    const rows = parseHtmlTable(html);
    if (rows && rows.length) return { rows, columns: [], exact: false };
  }

  return null;
}

function readFormat(clipboard: ClipboardLike | null | undefined, format: string): string {
  if (!clipboard) return "";
  try {
    return clipboard.getData(format) ?? "";
  } catch {
    return "";
  }
}

/** Pad every row to the same width so the block is a true rectangle. */
export function padMatrix(rows: CellMatrix): CellMatrix {
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  return rows.map((row) => {
    const next = [...row];
    while (next.length < width) next.push("");
    return next;
  });
}

export function matrixSize(rows: CellMatrix): { rows: number; cols: number } {
  return {
    rows: rows.length,
    cols: rows.reduce((max, row) => Math.max(max, row.length), 0),
  };
}

export interface ColumnDefinitionMinimal {
  id: string;
  label: string;
  type: string;
  isPrimary?: boolean;
  hidden?: boolean;
  settings?: Record<string, unknown>;
}

export interface ColumnMapping {
  sourceIndex: number;
  targetIndex: number | null;
  matchType: "id" | "title" | "position" | "none";
}

/**
 * Map source columns to target columns.
 * - If source has column metadata (id/title), map by ID (same board) or title (cross-board).
 * - If source has no metadata (external paste), map by position starting at targetStartIndex.
 *   In this case, sourceCount must be provided (the number of columns in the source matrix).
 */
export function mapSourceColumnsToTarget(
  sourceColumns: ColumnMeta[],
  targetColumns: ColumnDefinitionMinimal[],
  targetStartIndex: number = 0,
  sourceCount?: number,
): ColumnMapping[] {
  const targetColMap = new Map(targetColumns.map((c, idx) => [c.id, idx]));
  const targetColByTitle = new Map(targetColumns.map((c) => [c.label.toLowerCase().trim(), c]));

  const hasSourceMetadata = sourceColumns.length > 0 && sourceColumns.some((c) => c.id || c.title);
  const count = hasSourceMetadata ? sourceColumns.length : (sourceCount ?? 0);
  const mappings: ColumnMapping[] = [];

  if (hasSourceMetadata) {
    // In-app copy: map by column ID (same board) or column title (cross-board)
    for (let j = 0; j < sourceColumns.length; j++) {
      const srcCol = sourceColumns[j];
      let targetIndex: number | null = null;
      let matchType: "id" | "title" | "position" | "none" = "none";
      if (srcCol.id && targetColMap.has(srcCol.id)) {
        targetIndex = targetColMap.get(srcCol.id)!;
        matchType = "id";
      } else if (srcCol.title) {
        const titleKey = srcCol.title.toLowerCase().trim();
        // Find target index by title
        for (let idx = 0; idx < targetColumns.length; idx++) {
          if (targetColumns[idx].label.toLowerCase().trim() === titleKey) {
            targetIndex = idx;
            break;
          }
        }
        if (targetIndex !== null) matchType = "title";
      }
      mappings.push({ sourceIndex: j, targetIndex, matchType });
    }
  } else {
    // External paste (plain TSV/HTML): map by position starting at targetStartIndex
    for (let j = 0; j < count; j++) {
      const targetIdx = targetStartIndex + j;
      const targetIndex = targetIdx < targetColumns.length ? targetIdx : null;
      mappings.push({ sourceIndex: j, targetIndex, matchType: targetIndex !== null ? "position" : "none" });
    }
  }

  return mappings;
}