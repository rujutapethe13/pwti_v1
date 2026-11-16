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
 *   - `application/x-board-cells`  the exact matrix, for in-app paste.
 *
 * Paste prefers the exact matrix when it is present (or when the incoming TSV
 * is byte-identical to the matrix we copied), and otherwise falls back to TSV
 * and then HTML, which is what an external clipboard provides.
 */

export type CellMatrix = string[][];

/** In-app matrix payload. Namespaced so it never collides with text formats. */
export const GRID_MATRIX_MIME = "application/x-board-cells";
const MATRIX_VERSION = 1;

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

/** Serialize a matrix for the in-app clipboard format. */
export function serializeMatrix(rows: CellMatrix): string {
  return JSON.stringify({ version: MATRIX_VERSION, rows });
}

/** Parse the in-app matrix format. Returns null for anything else. */
export function parseMatrix(raw: string | null | undefined): CellMatrix | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const candidate = parsed as { version?: unknown; rows?: unknown };
  if (candidate.version !== MATRIX_VERSION || !Array.isArray(candidate.rows)) return null;
  const rows: CellMatrix = [];
  for (const row of candidate.rows) {
    if (!Array.isArray(row)) return null;
    rows.push(row.map((cell) => (cell == null ? "" : String(cell))));
  }
  return rows;
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
  /** True when the row/column counts come from our own copy, not a text guess. */
  exact: boolean;
}

/**
 * Resolve the clipboard into a matrix.
 *
 * Order matters: our own matrix wins, then TSV, then HTML. `fallbackTsv` is the
 * text the caller already read; when it matches our serialized TSV we can trust
 * the stored matrix even if the custom MIME type was stripped by the browser.
 */
export function resolveClipboardMatrix(
  clipboard: ClipboardLike | null | undefined,
  fallbackTsv?: string | null,
  internalRows?: CellMatrix | null,
): ParsedClipboard | null {
  if (clipboard) {
    const exact = parseMatrix(readFormat(clipboard, GRID_MATRIX_MIME));
    if (exact && exact.length) return { rows: exact, exact: true };
  }

  const text = fallbackTsv != null ? fallbackTsv : readFormat(clipboard, "text/plain");
  if (internalRows && internalRows.length && text != null && matrixToTSV(internalRows) === text) {
    return { rows: internalRows.map((row) => [...row]), exact: true };
  }

  if (text != null) {
    const rows = parseTSV(text);
    if (rows.length) return { rows, exact: false };
  }

  const html = readFormat(clipboard, "text/html");
  if (html) {
    const rows = parseHtmlTable(html);
    if (rows && rows.length) return { rows, exact: false };
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