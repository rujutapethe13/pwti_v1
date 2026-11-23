import { describe, it, expect } from "vitest";

import {
  GRID_MATRIX_MIME,
  matrixSize,
  matrixToHtml,
  matrixToTSV,
  padMatrix,
  parseHtmlTable,
  parseMatrix,
  parseTSV,
  resolveClipboardMatrix,
  serializeMatrix,
  tsvQuote,
  type ColumnMeta,
  type GridClipboardPayload,
} from "@/features/boards/engine/lib/grid-clipboard";

function clipboardOf(data: Record<string, string>) {
  return { getData: (format: string) => data[format] ?? "" };
}

function makePayload(rows: string[][], columns: ColumnMeta[] = []): GridClipboardPayload {
  return { version: 2, sourceBoardId: "test", columns, rows };
}

describe("grid clipboard serialization", () => {
  it("quotes only cells that contain a delimiter, quote or newline", () => {
    expect(tsvQuote("plain")).toBe("plain");
    expect(tsvQuote("a\tb")).toBe('"a\tb"');
    expect(tsvQuote('say "hi"')).toBe('"say ""hi"""');
    expect(tsvQuote("line1\nline2")).toBe('"line1\nline2"');
  });

  it("round-trips a matrix through the exact clipboard format", () => {
    const rows = [
      ["a", "b", "c"],
      ["d", "e", "f"],
    ];
    const columns: ColumnMeta[] = [
      { id: "col1", title: "A", type: "text", isPrimary: false },
      { id: "col2", title: "B", type: "text", isPrimary: false },
      { id: "col3", title: "C", type: "text", isPrimary: false },
    ];
    const payload = makePayload(rows, columns);
    const parsed = parseMatrix(serializeMatrix(payload));
    expect(parsed).not.toBeNull();
    expect(parsed!.rows).toEqual(rows);
    expect(parsed!.columns).toEqual(columns);
    expect(parseMatrix("not json")).toBeNull();
    expect(parseMatrix(JSON.stringify({ version: 99, columns, rows }))).toBeNull();
    expect(parseMatrix(JSON.stringify({ version: 2, columns: "nope", rows }))).toBeNull();
  });

  it("keeps every row and column of a block, including empty cells", () => {
    const rows = [
      ["a", "", "c"],
      ["", "", ""],
      ["g", "h", "i"],
    ];
    const parsed = parseTSV(matrixToTSV(rows));
    expect(matrixSize(parsed)).toEqual({ rows: 3, cols: 3 });
    expect(parsed).toEqual(rows);
  });

  it("preserves a trailing empty row instead of dropping it", () => {
    // 2 rows x 1 col where the second row is empty.
    expect(parseTSV("a\n")).toEqual([["a"], [""]]);
    // One row, no trailing newline.
    expect(parseTSV("a")).toEqual([["a"]]);
    // Two empty rows.
    expect(parseTSV("\n")).toEqual([[""], [""]]);
  });

  it("accepts CRLF and quoted cells from external spreadsheets", () => {
    expect(parseTSV("a\tb\r\nc\td")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
    expect(parseTSV('"a\tb"\tc')).toEqual([["a\tb", "c"]]);
  });

  it("pads ragged rows into a rectangle", () => {
    expect(padMatrix([["a"], ["b", "c", "d"]])).toEqual([
      ["a", "", ""],
      ["b", "c", "d"],
    ]);
    expect(matrixSize(padMatrix([["a"], ["b", "c", "d"]]))).toEqual({ rows: 2, cols: 3 });
  });

  it("round-trips an HTML table", () => {
    const rows = [
      ["a", "b"],
      ["c", "d"],
    ];
    expect(parseHtmlTable(matrixToHtml(rows))).toEqual(rows);
    expect(parseHtmlTable("<p>no table</p>")).toBeNull();
    expect(parseHtmlTable("<table><tr><td>a&b</td></tr></table>")).toEqual([["a&b"]]);
  });

  it("prefers the exact matrix over the text representation", () => {
    const rows = [["a", "b"], ["c", "d"]];
    const columns: ColumnMeta[] = [
      { id: "col1", title: "A", type: "text", isPrimary: false },
      { id: "col2", title: "B", type: "text", isPrimary: false },
    ];
    const payload = makePayload(rows, columns);
    const clipboard = clipboardOf({
      [GRID_MATRIX_MIME]: serializeMatrix(payload),
      "text/plain": "only-one-cell",
    });
    const resolved = resolveClipboardMatrix(clipboard);
    expect(resolved).not.toBeNull();
    expect(resolved!.rows).toEqual(rows);
    expect(resolved!.columns).toEqual(columns);
    expect(resolved!.exact).toBe(true);
  });

  it("falls back to the internal copy when the browser strips custom MIME types", () => {
    const rows = [["a"], [""], ["c"]];
    const columns: ColumnMeta[] = [{ id: "col1", title: "A", type: "text", isPrimary: false }];
    const payload = makePayload(rows, columns);
    const tsv = matrixToTSV(rows);
    const resolved = resolveClipboardMatrix(clipboardOf({ "text/plain": tsv }), tsv, payload);
    expect(resolved).not.toBeNull();
    expect(resolved!.rows).toEqual(rows);
    expect(resolved!.columns).toEqual(columns);
    expect(resolved!.exact).toBe(true);
  });

  it("parses external TSV when there is no internal copy", () => {
    const resolved = resolveClipboardMatrix(clipboardOf({ "text/plain": "a\tb\nc\td" }));
    expect(resolved).toEqual({
      rows: [
        ["a", "b"],
        ["c", "d"],
      ],
      columns: [],
      exact: false,
    });
  });

  it("uses text/html when text/plain is unavailable", () => {
    const resolved = resolveClipboardMatrix(
      clipboardOf({ "text/html": "<table><tr><td>a</td><td>b</td></tr></table>" }),
    );
    expect(resolved).toEqual({ rows: [["a", "b"]], columns: [], exact: false });
  });

  it("returns null for an empty clipboard", () => {
    expect(resolveClipboardMatrix(clipboardOf({}))).toBeNull();
    expect(resolveClipboardMatrix(null)).toBeNull();
  });
});