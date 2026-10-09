import { describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";

import type {
  ColumnDefinition,
  ColumnValue,
  DropdownOption,
  Group,
} from "@/features/boards/engine/types";
import {
  applyOptionMappingsToColumns,
  buildExportFilename,
  buildExportWorkbook,
  buildInitialMappings,
  buildNewColumnsFromMappings,
  buildRecordFromRow,
  findBestTitleColumn,
  findUnmatchedOptions,
  getExportValue,
  getColumnIdsToDelete,
  getMappedExistingColumnIds,
  getMappableMappings,
  isRowEmpty,
  normalizeOptions,
  parseBuffer,
  reconcileDropdownColumnOptions,
  resolveOptionIdForColumn,
  suggestColumnMapping,
  validateImportFile,
  validateMappings,
  workbookToArrayBuffer,
} from "@/features/boards/engine/lib/import-export";
import type { ColumnMapping } from "@/features/boards/engine/lib/import-export";

const NOW = "2026-09-01T00:00:00.000Z";

function makeColumn(
  id: string,
  label: string,
  type: ColumnDefinition["type"],
  order: number,
  settings: Record<string, unknown> = {},
): ColumnDefinition {
  return {
    id,
    boardId: "board-1",
    key: label.toLowerCase().replace(/\s+/g, "_"),
    label,
    type,
    required: false,
    hidden: false,
    frozen: false,
    defaultValue: null,
    settings,
    permissions: {
      view: ["owner", "editor", "commenter", "viewer"],
      edit: ["owner", "editor"],
      configure: ["owner"],
    },
    validation: [],
    version: 1,
    order,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

const STATUS_OPTIONS = [
  { id: "opt-not-started", label: "Not Started" },
  { id: "opt-working", label: "Working on it" },
  { id: "opt-done", label: "Done" },
];

const COLUMNS: ColumnDefinition[] = [
  makeColumn("col-client", "Client Name", "text", 0),
  makeColumn("col-status", "Status", "status", 1, { options: STATUS_OPTIONS }),
  makeColumn("col-date", "Date", "date", 2),
  makeColumn("col-assigned", "Assigned To", "person", 3),
];

const GROUPS: Group[] = [
  {
    id: "group-todo",
    organizationId: "org",
    workspaceId: "ws",
    boardId: "board-1",
    name: "To-Do",
    color: "#94a3b8",
    collapsed: false,
    order: 0,
    status: "active",
  },
  {
    id: "group-done",
    organizationId: "org",
    workspaceId: "ws",
    boardId: "board-1",
    name: "Done",
    color: "#22c55e",
    collapsed: false,
    order: 1,
    status: "active",
  },
];

function makeXlsxBuffer(aoa: unknown[][]): ArrayBuffer {
  const sheet = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
  return XLSX.write(workbook, { type: "array", bookType: "xlsx" });
}

describe("validateImportFile", () => {
  function file(name: string, size: number, type = "application/octet-stream"): File {
    return new File([new Uint8Array(size)], name, { type });
  }
  it("accepts xlsx files under the size limit", () => {
    expect(validateImportFile(file("data.xlsx", 1024))).toBeNull();
  });
  it("accepts xls and csv files", () => {
    expect(validateImportFile(file("data.xls", 1024))).toBeNull();
    expect(validateImportFile(file("data.csv", 1024))).toBeNull();
  });
  it("rejects unsupported file types", () => {
    const err = validateImportFile(file("data.txt", 1024));
    expect(err?.code).toBe("unsupported_type");
  });
  it("rejects files over the size limit", () => {
    const err = validateImportFile(file("data.xlsx", 11 * 1024 * 1024));
    expect(err?.code).toBe("too_large");
  });
  it("rejects empty files", () => {
    const err = validateImportFile(file("data.xlsx", 0));
    expect(err?.code).toBe("empty");
  });
});

describe("parseBuffer", () => {
  it("parses a simple workbook with headers and data rows", () => {
    const buffer = makeXlsxBuffer([
      ["Client", "Status", "Date"],
      ["Acme", "Working on it", "2026-09-01"],
      ["Beta", "Done", "2026-08-30"],
    ]);
    const parsed = parseBuffer(buffer);
    expect(parsed.headers).toEqual(["Client", "Status", "Date"]);
    expect(parsed.totalRowCount).toBe(2);
    expect(parsed.rows[0]).toEqual({
      Client: "Acme",
      Status: "Working on it",
      Date: "2026-09-01",
    });
  });
  it("fills missing headers with positional names", () => {
    const buffer = makeXlsxBuffer([
      ["", null, "C"],
      ["a", "b", "c"],
    ]);
    const parsed = parseBuffer(buffer);
    expect(parsed.headers).toEqual(["Column 1", "Column 2", "C"]);
    expect(parsed.rows[0]).toEqual({ "Column 1": "a", "Column 2": "b", C: "c" });
  });
  it("returns zero rows when only the header is present", () => {
    const buffer = makeXlsxBuffer([["A", "B"]]);
    const parsed = parseBuffer(buffer);
    expect(parsed.headers).toEqual(["A", "B"]);
    expect(parsed.totalRowCount).toBe(0);
  });
});

describe("suggestColumnMapping", () => {
  it("matches Client → Client Name by token overlap", () => {
    const suggestion = suggestColumnMapping("Client", COLUMNS);
    expect(suggestion?.columnId).toBe("col-client");
  });
  it("matches Status exactly", () => {
    const suggestion = suggestColumnMapping("Status", COLUMNS);
    expect(suggestion?.columnId).toBe("col-status");
  });
  it("ignores clearly unrelated headers", () => {
    const suggestion = suggestColumnMapping("RandomGibberish", COLUMNS);
    expect(suggestion).toBeNull();
  });
  it("is case-insensitive and ignores punctuation", () => {
    const suggestion = suggestColumnMapping("CLIENT_NAME", COLUMNS);
    expect(suggestion?.columnId).toBe("col-client");
  });
});

describe("buildInitialMappings", () => {
  it("auto-suggests mappings for matching headers and skips the rest", () => {
    const mappings = buildInitialMappings(["Client", "Status", "Random"], COLUMNS);
    expect(mappings[0]).toEqual({
      id: "mapping-0",
      fileColumn: "Client",
      action: { kind: "existing", columnId: "col-client" },
    });
    expect(mappings[1].action).toEqual({
      kind: "existing",
      columnId: "col-status",
    });
    expect(mappings[2].action).toEqual({ kind: "skip" });
  });
});

describe("validateMappings", () => {
  it("rejects when no columns are mapped", () => {
    const result = validateMappings(
      [{ id: "test-id", fileColumn: "A", action: { kind: "skip" } }],
      COLUMNS,
      [],
    );
    expect(result.valid).toBe(false);
  });
  it("accepts when at least one column is mapped to an existing column", () => {
    const result = validateMappings(
      [
        { id: "test-id", fileColumn: "Client", action: { kind: "existing", columnId: "col-client" } },
        { id: "test-id", fileColumn: "Foo", action: { kind: "skip" } },
      ],
      COLUMNS,
      [],
    );
    expect(result.valid).toBe(true);
    expect(result.mappedCount).toBe(1);
  });
  it("rejects when a create-mapping has an empty label", () => {
    const result = validateMappings(
      [
        {
          id: "test-id", fileColumn: "Foo",
          action: { kind: "create", type: "text", label: "   " },
        },
      ],
      COLUMNS,
      [],
    );
    expect(result.valid).toBe(false);
  });
  it("rejects when a new column label collides with an existing one", () => {
    const result = validateMappings(
      [
        {
          id: "test-id", fileColumn: "Foo",
          action: { kind: "create", type: "text", label: "Status" },
        },
      ],
      COLUMNS,
      [],
    );
    expect(result.valid).toBe(false);
  });
});

describe("mapping cleanup helpers", () => {
  it("derives regular mappings while preserving skipped title mappings in state", () => {
    const mappings: ColumnMapping[] = [
      { id: "test-id", fileColumn: "Client", action: { kind: "skip" } },
      { id: "test-id", fileColumn: "Status", action: { kind: "existing", columnId: "col-status" } },
    ];
    expect(getMappableMappings(mappings, "Client")).toEqual([
      { id: "test-id", fileColumn: "Status", action: { kind: "existing", columnId: "col-status" } },
    ]);
    expect(getMappableMappings(mappings, null)).toEqual(mappings);
  });

  it("deletes unmapped existing columns but protects Status and Assigned To", () => {
    const mappedIds = getMappedExistingColumnIds([
      { id: "test-id", fileColumn: "Client", action: { kind: "existing", columnId: "col-client" } },
    ]);
    expect(getColumnIdsToDelete(COLUMNS, mappedIds)).toEqual([
      "col-date",
    ]);
  });
});

describe("buildNewColumnsFromMappings", () => {
  it("creates a new column for each create-mapping with default settings", () => {
    const mappings: ColumnMapping[] = [
      {
        id: "test-id", fileColumn: "Foo",
        action: { kind: "create", type: "status", label: "Approval" },
      },
    ];
    const newCols = buildNewColumnsFromMappings("board-1", mappings, 5);
    expect(newCols).toHaveLength(1);
    expect(newCols[0].label).toBe("Approval");
    expect(newCols[0].type).toBe("status");
    expect(newCols[0].order).toBe(5);
    const opts = newCols[0].settings.options as Array<{ label: string }>;
    expect(Array.isArray(opts)).toBe(true);
    expect(opts.map((o) => o.label)).toEqual([
      "Not Started",
      "Working on it",
      "Done",
      "Stuck",
    ]);
  });

  it("does not create duplicate columns when a label matches an existing column (normalized)", () => {
    const mappings: ColumnMapping[] = [
      {
        id: "test-id", fileColumn: "Status",
        action: { kind: "create", type: "status", label: "Status" },
      },
      {
        id: "test-id", fileColumn: "Client",
        action: { kind: "create", type: "text", label: "client" },
      },
    ];
    // "Status" (create) should be skipped because COLUMNS already has a "Status" column.
    // "client" (create) should be skipped because "Client Name" normalizes to "client name",
    // which is NOT in the existing set, so it should be created.
    const newCols = buildNewColumnsFromMappings("board-1", mappings, 5, COLUMNS);
    expect(newCols).toHaveLength(1);
    expect(newCols[0].label).toBe("client");
  });

  it("does not create duplicate columns from two create-mappings with the same label (case-insensitive)", () => {
    const mappings: ColumnMapping[] = [
      {
        id: "test-id", fileColumn: "A",
        action: { kind: "create", type: "text", label: "Tags" },
      },
      {
        id: "test-id", fileColumn: "B",
        action: { kind: "create", type: "text", label: "TAGS" },
      },
    ];
    const newCols = buildNewColumnsFromMappings("board-1", mappings, 5);
    expect(newCols).toHaveLength(1);
    expect(newCols[0].label).toBe("Tags");
  });

  it("keeps import IDs unique when labels slugify to the same key", () => {
    const mappings: ColumnMapping[] = [
      {
        id: "test-id", fileColumn: "A",
        action: { kind: "create", type: "text", label: "Client Name" },
      },
      {
        id: "test-id", fileColumn: "B",
        action: { kind: "create", type: "text", label: "Client-Name" },
      },
    ];
    const newCols = buildNewColumnsFromMappings("board-1", mappings, 5);
    expect(newCols.map((column) => column.id)).toEqual([
      "col-import-client_name",
      "col-import-client_name_2",
    ]);
    expect(newCols.map((column) => column.key)).toEqual([
      "client_name",
      "client_name_2",
    ]);
  });
});

describe("buildRecordFromRow", () => {
  it("builds the record title independently from mapped cell columns", () => {
    const row = { Client: "Acme", Status: "Done", Date: "2026-09-01" };
    const mappings: ColumnMapping[] = [
      { id: "test-id", fileColumn: "Client", action: { kind: "existing", columnId: "col-client" } },
      { id: "test-id", fileColumn: "Status", action: { kind: "existing", columnId: "col-status" } },
    ];
    const built = buildRecordFromRow(row, 0, mappings, COLUMNS, "Client", {});
    expect(built.recordTitle).toBe("Acme");
    expect(built.cellValues).not.toHaveProperty("col-client");
    expect(built.cellValues["col-status"]).toBe("opt-done");
  });
  it("uses a skipped header as the title without mapping it as a cell", () => {
    const mappings: ColumnMapping[] = [
      { id: "test-id", fileColumn: "Client", action: { kind: "skip" } },
      { id: "test-id", fileColumn: "Status", action: { kind: "existing", columnId: "col-status" } },
    ];
    const built = buildRecordFromRow(
      { Client: "Acme", Status: "Done" },
      0,
      mappings,
      COLUMNS,
      "Client",
      {},
    );
    expect(built.recordTitle).toBe("Acme");
    expect(built.cellValues).toEqual({ "col-status": "opt-done" });
  });
  it("falls back to a generated title when no title column is mapped", () => {
    const built = buildRecordFromRow(
      { Client: "Acme" },
      4,
      [{ id: "test-id", fileColumn: "Client", action: { kind: "existing", columnId: "col-client" } }],
      COLUMNS,
      null,
      {},
    );
    expect(built.recordTitle).toBe("Imported row 5");
  });
  it("coerces checkbox values from common string forms", () => {
    const col = makeColumn("col-check", "Done", "checkbox", 0);
    const built = buildRecordFromRow(
      { Done: "yes" },
      0,
      [{ id: "test-id", fileColumn: "Done", action: { kind: "existing", columnId: "col-check" } }],
      [col],
      null,
      {},
    );
    expect(built.cellValues["col-check"]).toBe(true);
  });
  it("coerces number values stripping currency symbols", () => {
    const col = makeColumn("col-amt", "Amount", "currency", 0);
    const built = buildRecordFromRow(
      { Amount: "$1,234.50" },
      0,
      [{ id: "test-id", fileColumn: "Amount", action: { kind: "existing", columnId: "col-amt" } }],
      [col],
      null,
      {},
    );
    expect(built.cellValues["col-amt"]).toBe(1234.5);
  });
  it("coerces date values to YYYY-MM-DD", () => {
    const built = buildRecordFromRow(
      { Date: "2026-09-01" },
      0,
      [{ id: "test-id", fileColumn: "Date", action: { kind: "existing", columnId: "col-date" } }],
      COLUMNS,
      null,
      {},
    );
    expect(built.cellValues["col-date"]).toBe("2026-09-01");
  });

  it("parses day-first date strings (dd-mm-yyyy and dd/mm/yyyy)", () => {
    const cases = ["01-09-2026", "01/09/2026", "1-9-2026", "1/9/2026", "25.12.2026"];
    for (const input of cases) {
      const built = buildRecordFromRow(
        { Date: input },
        0,
        [{ id: "test-id", fileColumn: "Date", action: { kind: "existing", columnId: "col-date" } }],
        COLUMNS,
        null,
        {},
      );
      const expectedYear = input.includes("2026") ? "2026" : null;
      if (!expectedYear) continue;
      expect(built.cellValues["col-date"]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(
      buildRecordFromRow(
        { Date: "01-09-2026" },
        0,
        [{ id: "test-id", fileColumn: "Date", action: { kind: "existing", columnId: "col-date" } }],
        COLUMNS,
        null,
        {},
      ).cellValues["col-date"],
    ).toBe("2026-09-01");
    expect(
      buildRecordFromRow(
        { Date: "25/12/2026" },
        0,
        [{ id: "test-id", fileColumn: "Date", action: { kind: "existing", columnId: "col-date" } }],
        COLUMNS,
        null,
        {},
      ).cellValues["col-date"],
    ).toBe("2026-12-25");
  });

  it("writes the chosen existing-option label for status values (mapped to existing)", () => {
    const built = buildRecordFromRow(
      { Status: "Working on it" },
      0,
      [{ id: "test-id", fileColumn: "Status", action: { kind: "existing", columnId: "col-status" } }],
      COLUMNS,
      null,
      {
        Status: {
          "Working on it": {
            rawValue: "Working on it",
            targetLabel: "Working on it",
            createNew: false,
          },
        },
      },
    );
    expect(built.cellValues["col-status"]).toBe("opt-working");
  });

  it("writes the chosen existing-option label when the file value differs from the label", () => {
    const built = buildRecordFromRow(
      { Status: "WIP" },
      0,
      [{ id: "test-id", fileColumn: "Status", action: { kind: "existing", columnId: "col-status" } }],
      COLUMNS,
      null,
      {
        Status: {
          WIP: {
            rawValue: "WIP",
            targetLabel: "Working on it",
            createNew: false,
          },
        },
      },
    );
    expect(built.cellValues["col-status"]).toBe("opt-working");
  });

  it("writes the option ID for a newly created status option", () => {
    const rows = [{ Status: "Backpacks(Product)" }];
    const mappings: ColumnMapping[] = [
      { id: "test-id", fileColumn: "Status", action: { kind: "existing", columnId: "col-status" } },
    ];
    const optionMappings = {
      Status: {
        "Backpacks(Product)": {
          rawValue: "Backpacks(Product)",
          targetLabel: "Backpacks(Product)",
          createNew: true,
        },
      },
    };
    const updatedColumns = applyOptionMappingsToColumns(
      COLUMNS,
      mappings,
      optionMappings,
      rows,
    );
    const built = buildRecordFromRow(
      rows[0],
      0,
      mappings,
      updatedColumns,
      null,
      optionMappings,
    );
    const value = built.cellValues["col-status"];
    const options = normalizeOptions(
      updatedColumns.find((column) => column.id === "col-status")?.settings?.options,
    );

    expect(value).not.toBe("Backpacks(Product)");
    expect(
      options.some(
        (option) => option.id === value && option.label === "Backpacks(Product)",
      ),
    ).toBe(true);
  });

  it("maps every regular column except the selected title from a wide row", () => {
    const headers = [
      "SR. No.",
      "Title",
      "Client / Company Name",
      "Project",
      "Due Date",
      "Status",
      "Priority",
      "Assignee",
      "No. of images",
      "Job location",
      "Budget",
      "Tags",
      "Notes",
      "Rating",
      "Column 15",
    ];
    const cols: ColumnDefinition[] = headers.map((h, i) =>
      makeColumn(`col-${i}`, h, "text", i),
    );
    const mappings: ColumnMapping[] = headers.map((h) => ({
      id: "test-id", fileColumn: h,
      action: { kind: "existing", columnId: `col-${headers.indexOf(h)}` },
    }));
    const row: Record<string, ColumnValue> = {};
    headers.forEach((h, i) => {
      row[h] = `value-${i}`;
    });

    const built = buildRecordFromRow(row, 0, mappings, cols, "Title", {});

    expect(built.recordTitle).toBe("value-1");
    headers.forEach((h, i) => {
      if (h === "Title") return;
      expect(built.cellValues[`col-${i}`]).toBe(`value-${i}`);
    });
  });
});

describe("findUnmatchedOptions", () => {
  it("finds status values that are not in the existing options", () => {
    const rows = [
      { Status: "Working on it" },
      { Status: "Not Started" },
      { Status: "Brand New State" },
      { Status: "Brand New State" },
    ];
    const unmatched = findUnmatchedOptions(
      rows,
      [{ id: "test-id", fileColumn: "Status", action: { kind: "existing", columnId: "col-status" } }],
      COLUMNS,
    );
    expect(unmatched["Status"]).toEqual(["Brand New State"]);
  });
  it("returns no warnings for fully-matching values", () => {
    const rows = [{ Status: "Done" }, { Status: "Working on it" }];
    const unmatched = findUnmatchedOptions(
      rows,
      [{ id: "test-id", fileColumn: "Status", action: { kind: "existing", columnId: "col-status" } }],
      COLUMNS,
    );
    expect(unmatched["Status"]).toBeUndefined();
  });
});

describe("applyOptionMappingsToColumns", () => {
  it("appends new status options to the column's options array", () => {
    const result = applyOptionMappingsToColumns(
      COLUMNS,
      [
        {
          id: "test-id", fileColumn: "Status",
          action: { kind: "existing", columnId: "col-status" },
        },
      ],
      {
        Status: {
          "Brand New State": {
            rawValue: "Brand New State",
            targetLabel: "Brand New State",
            createNew: true,
          },
        },
      },
    );
    const statusCol = result.find((c) => c.id === "col-status");
    const labels = (statusCol!.settings.options as Array<{ label: string }>).map(
      (o) => o.label,
    );
    expect(labels).toContain("Brand New State");
    expect(labels).toContain("Done");
  });
  it("does not duplicate an option label that already exists", () => {
    const result = applyOptionMappingsToColumns(
      COLUMNS,
      [
        {
          id: "test-id", fileColumn: "Status",
          action: { kind: "existing", columnId: "col-status" },
        },
      ],
      {
        Status: {
          Done: {
            rawValue: "Done",
            targetLabel: "Done",
            createNew: true,
          },
        },
      },
    );
    const statusCol = result.find((c) => c.id === "col-status");
    const labels = (statusCol!.settings.options as Array<{ label: string }>).map(
      (o) => o.label,
    );
    expect(labels.filter((l) => l === "Done")).toHaveLength(1);
  });

  it("creates options for every unique row value even when optionMappings is empty", () => {
    const rows: Array<Record<string, ColumnValue>> = [
      { Status: "Backpacks(Product)" },
      { Status: "Trolley bags((Product)" },
      { Status: "CGI" },
      { Status: "Backpacks(Product)" }, // duplicate across rows
    ];
    const result = applyOptionMappingsToColumns(
      COLUMNS,
      [{ id: "test-id", fileColumn: "Status", action: { kind: "existing", columnId: "col-status" } }],
      {}, // user never touched the unmatched-values review UI
      rows,
    );
    const statusCol = result.find((c) => c.id === "col-status");
    const options = normalizeOptions(statusCol!.settings.options) as DropdownOption[];
    const labels = options.map((o) => o.label);

    // Every unique value is now a real option, alongside the existing ones.
    expect(labels).toEqual(
      expect.arrayContaining([
        "Backpacks(Product)",
        "Trolley bags((Product)",
        "CGI",
        "Done",
      ]),
    );
    // No duplicate options were created for the repeated value.
    expect(labels.filter((l) => l === "Backpacks(Product)")).toHaveLength(1);
    // Every option is a first-class object with a stable id.
    expect(options.every((o) => o.id && o.label)).toBe(true);
  });

  it("does not duplicate labels already present as options", () => {
    const rows: Array<Record<string, ColumnValue>> = [
      { Status: "Done" }, // already an option
      { Status: "Stuck" }, // not an option -> will be created
    ];
    const result = applyOptionMappingsToColumns(
      COLUMNS,
      [{ id: "test-id", fileColumn: "Status", action: { kind: "existing", columnId: "col-status" } }],
      {},
      rows,
    );
    const statusCol = result.find((c) => c.id === "col-status");
    const labels = normalizeOptions(statusCol!.settings.options).map((o) => o.label);

    expect(labels.filter((l) => l === "Done")).toHaveLength(1);
    expect(labels).toContain("Stuck");
  });

  it("honors an explicit user mapping to an existing option (no new option)", () => {
    const rows: Array<Record<string, ColumnValue>> = [{ Status: "WIP" }];
    const result = applyOptionMappingsToColumns(
      COLUMNS,
      [{ id: "test-id", fileColumn: "Status", action: { kind: "existing", columnId: "col-status" } }],
      {
        Status: {
          WIP: { rawValue: "WIP", targetLabel: "Working on it", createNew: false },
        },
      },
      rows,
    );
    const statusCol = result.find((c) => c.id === "col-status");
    const labels = normalizeOptions(statusCol!.settings.options).map((o) => o.label);

    // "WIP" was not auto-created; it maps to the existing "Working on it".
    expect(labels).not.toContain("WIP");
    expect(labels).toContain("Working on it");
    expect(labels).toContain("Done");
  });
});

describe("normalizeOptions", () => {
  it("passes through object options and derives ids from labels when missing", () => {
    const out = normalizeOptions([
      { label: "A" },
      { id: "x", label: "B", color: "#fff" },
    ]);
    expect(out[0]).toEqual({ id: "A", label: "A" });
    expect(out[1]).toEqual({ id: "x", label: "B", color: "#fff" });
  });

  it("normalizes string options into {id,label} objects", () => {
    const out = normalizeOptions(["Design", "Development"]);
    expect(out).toEqual([
      { id: "Design", label: "Design" },
      { id: "Development", label: "Development" },
    ]);
  });

  it("tolerates mixed string/object arrays and non-array input", () => {
    const out = normalizeOptions(["Design", { id: "o1", label: "Development" }]);
    expect(out).toEqual([
      { id: "Design", label: "Design" },
      { id: "o1", label: "Development" },
    ]);
    expect(normalizeOptions(undefined)).toEqual([]);
    expect(normalizeOptions({})).toEqual([]);
  });
});

describe("resolveOptionIdForColumn", () => {
  const col = makeColumn("col", "Type of Job", "dropdown", 0, {
    options: [
      { id: "opt-a", label: "Design" },
      { id: "opt-b", label: "Development" },
    ],
  });
  it("resolves a label to its option id", () => {
    expect(resolveOptionIdForColumn(col, "Design")).toBe("opt-a");
    expect(resolveOptionIdForColumn(col, "development")).toBe("opt-b");
  });
  it("passes through a value that is already an option id", () => {
    expect(resolveOptionIdForColumn(col, "opt-b")).toBe("opt-b");
  });
  it("leaves unknown values untouched", () => {
    expect(resolveOptionIdForColumn(col, "CGI")).toBe("CGI");
  });
  it("passes through non-string values", () => {
    expect(resolveOptionIdForColumn(col, null)).toBeNull();
    expect(resolveOptionIdForColumn(col, "")).toBe("");
  });
});

describe("reconcileDropdownColumnOptions (retroactive repair)", () => {
  const baseColumn = makeColumn("col-jobtype", "Type of Job", "dropdown", 0, {
    options: [{ id: "opt-cgi", label: "CGI" }, "PRODUCTS"],
  });

  it("creates an option and relinks cells for raw label values not yet in the list", () => {
    const cells = [
      { recordId: "r1", value: "Backpacks(Product)" as ColumnValue },
      { recordId: "r2", value: "Backpacks(Product)" as ColumnValue },
      { recordId: "r3", value: "Trolley bags((Product)" as ColumnValue },
    ];
    const { updatedColumn, relinks, createdOptionLabels } =
      reconcileDropdownColumnOptions(baseColumn, cells);

    const labels = normalizeOptions(updatedColumn.settings.options).map((o) => o.label);
    expect(labels).toEqual(
      expect.arrayContaining([
        "CGI",
        "PRODUCTS",
        "Backpacks(Product)",
        "Trolley bags((Product)",
      ]),
    );
    expect(createdOptionLabels).toEqual(["Backpacks(Product)", "Trolley bags((Product)"]);

    // Every cell now references a real option id.
    const ids = new Set(
      normalizeOptions(updatedColumn.settings.options).map((o) => o.id),
    );
    expect(relinks.map((r) => r.value)).toEqual([
      relinks[0].value,
      relinks[0].value,
      relinks[2].value,
    ]);
    expect(ids.has(relinks[0].value)).toBe(true);
    expect(ids.has(relinks[2].value)).toBe(true);
    expect(relinks[0].value).not.toBe("Backpacks(Product)");
  });

  it("relinks a label-only cell to an existing option id by label", () => {
    // Object options where the cell holds the label, not the id.
    const col = makeColumn("col-jobtype", "Type of Job", "dropdown", 0, {
      options: [
        { id: "opt-cgi", label: "CGI" },
        { id: "opt-products", label: "PRODUCTS" },
      ],
    });
    const cells = [{ recordId: "r1", value: "PRODUCTS" as ColumnValue }];
    const { relinks, createdOptionLabels } = reconcileDropdownColumnOptions(col, cells);
    expect(createdOptionLabels).toEqual([]);
    expect(relinks).toHaveLength(1);
    expect(relinks[0].value).toBe("opt-products");
  });

  it("leaves cells that already reference a valid option id untouched", () => {
    const cells = [
      { recordId: "r1", value: "opt-cgi" as ColumnValue }, // already an id
      { recordId: "r2", value: "Backpacks(Product)" as ColumnValue }, // needs repair
    ];
    const { relinks, createdOptionLabels, updatedColumn } =
      reconcileDropdownColumnOptions(baseColumn, cells);

    expect(createdOptionLabels).toEqual(["Backpacks(Product)"]);
    expect(relinks).toHaveLength(1);
    expect(relinks[0].recordId).toBe("r2");
    // The untouched cell's id is still a valid option.
    const ids = normalizeOptions(updatedColumn.settings.options).map((o) => o.id);
    expect(ids).toContain("opt-cgi");
  });

  it("is idempotent: a repair pass over already-repaired data is a no-op", () => {
    // Simulate already-repaired state: cells hold option ids, options exist.
    const repairedColumn = makeColumn("col-jobtype", "Type of Job", "dropdown", 0, {
      options: [
        { id: "opt-cgi", label: "CGI" },
        { id: "opt-repaired", label: "Backpacks(Product)" },
      ],
    });
    const cells = [
      { recordId: "r1", value: "opt-cgi" as ColumnValue },
      { recordId: "r2", value: "opt-repaired" as ColumnValue },
    ];
    const { relinks, createdOptionLabels, updatedColumn } =
      reconcileDropdownColumnOptions(repairedColumn, cells);

    expect(createdOptionLabels).toEqual([]);
    expect(relinks).toEqual([]);
    // Options array unchanged (no additions).
    expect(normalizeOptions(updatedColumn.settings.options)).toEqual([
      { id: "opt-cgi", label: "CGI" },
      { id: "opt-repaired", label: "Backpacks(Product)" },
    ]);
  });
});

describe("findBestTitleColumn", () => {
  it("prefers literal title-like headers", () => {
    expect(findBestTitleColumn(["Date", "Company Name"], COLUMNS)).toBe("Company Name");
    expect(findBestTitleColumn(["Date", "Client"], COLUMNS)).toBe("Client");
    expect(findBestTitleColumn(["Date", "Name"], COLUMNS)).toBe("Name");
  });
  it("falls back to a suggested text column", () => {
    const accountOwner = makeColumn("col-account-owner", "Account Owner", "text", 4);
    expect(findBestTitleColumn(["Owner", "Date"], [...COLUMNS, accountOwner])).toBe("Owner");
  });
  it("returns null when no title-like or text mapping is available", () => {
    expect(findBestTitleColumn(["Foo", "Bar"], COLUMNS)).toBeNull();
  });
});

describe("buildExportWorkbook round-trip", () => {
  it("exports a workbook that re-imports back to the same data", () => {
    const records = [
      {
        record: { id: "r1", title: "Acme launch", groupId: "group-todo" },
        cellValues: {
          "col-client": "Acme",
          "col-status": "Working on it",
          "col-date": "2026-09-01",
          "col-assigned": "Jane",
        },
      },
      {
        record: { id: "r2", title: "Beta wrap", groupId: "group-done" },
        cellValues: {
          "col-client": "Beta",
          "col-status": "Done",
          "col-date": "2026-08-15",
          "col-assigned": "Sam",
        },
      },
    ];
    const workbook = buildExportWorkbook({
      boardName: "ProjectBoard",
      columns: COLUMNS,
      records,
      groups: GROUPS,
    });
    const buffer = workbookToArrayBuffer(workbook);
    const parsed = parseBuffer(buffer);
    expect(parsed.headers).toEqual([
      "Name",
      "Client Name",
      "Status",
      "Date",
      "Assigned To",
      "Group",
    ]);
    expect(parsed.totalRowCount).toBe(2);
    expect(parsed.rows[0]).toMatchObject({
      Name: "Acme launch",
      "Client Name": "Acme",
      Status: "Working on it",
      "Assigned To": "Jane",
      Group: "To-Do",
    });
    // Date round-trip: SheetJS may store as ISO string or a localized
    // date string depending on the workbook's cell format. Accept either.
    const dateValue = parsed.rows[0]["Date"];
    const dateMatches =
      dateValue === "2026-09-01" ||
      (typeof dateValue === "string" && /\b9\/1\/26\b/.test(dateValue));
    expect(dateMatches).toBe(true);
    expect(parsed.rows[1]["Group"]).toBe("Done");
    expect(parsed.rows[1]["Client Name"]).toBe("Beta");
  });

  it("respects the visibleRecordIds filter when exporting", () => {
    const workbook = buildExportWorkbook({
      boardName: "ProjectBoard",
      columns: COLUMNS,
      records: [
        {
          record: { id: "r1", title: "Acme", groupId: "group-todo" },
          cellValues: { "col-client": "Acme", "col-status": "Done" },
        },
        {
          record: { id: "r2", title: "Beta", groupId: "group-done" },
          cellValues: { "col-client": "Beta", "col-status": "Done" },
        },
      ],
      groups: GROUPS,
      visibleRecordIds: new Set(["r1"]),
    });
    const parsed = parseBuffer(workbookToArrayBuffer(workbook));
    expect(parsed.totalRowCount).toBe(1);
    expect(parsed.rows[0]["Name"]).toBe("Acme");
    expect(parsed.rows[0]["Client Name"]).toBe("Acme");
  });

  it("excludes hidden columns from the export", () => {
    const hiddenCol = { ...COLUMNS[3], hidden: true };
    const cols = [COLUMNS[0], COLUMNS[1], COLUMNS[2], hiddenCol];
    const workbook = buildExportWorkbook({
      boardName: "ProjectBoard",
      columns: cols,
      records: [
        {
          record: { id: "r1", title: "Acme", groupId: "group-todo" },
          cellValues: {
            "col-client": "Acme",
            "col-status": "Done",
            "col-date": "2026-09-01",
            "col-assigned": "Jane",
          },
        },
      ],
      groups: GROUPS,
    });
    const parsed = parseBuffer(workbookToArrayBuffer(workbook));
    expect(parsed.headers).toEqual(["Name", "Client Name", "Status", "Date", "Group"]);
  });
});

describe("buildExportFilename", () => {
  it("builds a descriptive filename with the date", () => {
    const name = buildExportFilename("Project Board!", new Date("2026-09-01T10:00:00Z"));
    expect(name).toBe("projectboard_export_2026-09-01.xlsx");
  });
});

describe("import value mapping (Bug 14)", () => {
  it("writes regular cell values without duplicating the selected title column", () => {
    const row = { Client: "Acme Corp", Status: "Done", Date: "2026-09-01" };
    const mappings: ColumnMapping[] = [
      { id: "test-id", fileColumn: "Client", action: { kind: "existing", columnId: "col-client" } },
      { id: "test-id", fileColumn: "Status", action: { kind: "existing", columnId: "col-status" } },
      { id: "test-id", fileColumn: "Date", action: { kind: "existing", columnId: "col-date" } },
    ];
    const built = buildRecordFromRow(row, 0, mappings, COLUMNS, "Client", {});

    expect(built.recordTitle).toBe("Acme Corp");
    expect(built.cellValues).not.toHaveProperty("col-client");
    expect(built.cellValues["col-status"]).toBe("opt-done");
    expect(built.cellValues["col-date"]).toBe("2026-09-01");
  });

  it("creates a new regular column without duplicating the selected title", () => {
    const row = { Client: "Acme", Notes: "Urgent follow-up" };
    const mappings: ColumnMapping[] = [
      { id: "test-id", fileColumn: "Client", action: { kind: "existing", columnId: "col-client" } },
      {
        id: "test-id", fileColumn: "Notes",
        action: { kind: "create", type: "long_text", label: "Notes" },
      },
    ];
    const newCols = buildNewColumnsFromMappings("board-1", mappings, 5, COLUMNS);
    expect(newCols).toHaveLength(1);
    expect(newCols[0].id).toBe("col-import-notes");

    const effectiveColumns = [...COLUMNS, ...newCols];
    const built = buildRecordFromRow(row, 0, mappings, effectiveColumns, "Client", {});

    expect(built.cellValues).not.toHaveProperty("col-client");
    expect(built.cellValues["col-import-notes"]).toBe("Urgent follow-up");
  });

  it("creates options for a new status column and writes their IDs", () => {
    const row = { Client: "Acme", Approval: "Ready for review" };
    const mappings: ColumnMapping[] = [
      { id: "test-id", fileColumn: "Client", action: { kind: "existing", columnId: "col-client" } },
      {
        id: "test-id", fileColumn: "Approval",
        action: { kind: "create", type: "status", label: "Approval" },
      },
    ];
    const newCols = buildNewColumnsFromMappings("board-1", mappings, 5, COLUMNS);
    const updatedNew = applyOptionMappingsToColumns(
      newCols,
      mappings,
      {},
      [row],
    );
    const built = buildRecordFromRow(
      row,
      0,
      mappings,
      [...COLUMNS, ...updatedNew],
      "Client",
      {},
    );
    const value = built.cellValues[newCols[0].id];
    const options = normalizeOptions(updatedNew[0].settings.options);

    expect(value).not.toBe("Ready for review");
    expect(
      options.some(
        (option) => option.id === value && option.label === "Ready for review",
      ),
    ).toBe(true);
  });

  it("skips creating a new column when its label matches an existing column (normalized)", () => {
    const row = { Status: "Done", Notes2: "Extra" };
    const mappings: ColumnMapping[] = [
      {
        id: "test-id", fileColumn: "Status",
        action: { kind: "create", type: "status", label: "status" },
      },
      {
        id: "test-id", fileColumn: "Notes2",
        action: { kind: "create", type: "long_text", label: "Notes2" },
      },
    ];
    const newCols = buildNewColumnsFromMappings("board-1", mappings, 5, COLUMNS);

    // "status" normalizes to "status" which already exists as "Status" → skipped.
    expect(newCols.find((c) => c.label.toLowerCase() === "status")).toBeUndefined();
    // "Notes2" is new → created.
    expect(newCols.find((c) => c.label.toLowerCase() === "notes2")).toBeDefined();
    expect(newCols).toHaveLength(1);
  });
});

describe("getExportValue — option columns resolve IDs to labels (Bug 1)", () => {
  const statusCol = makeColumn("col-status", "Status", "status", 0, {
    options: [
      { id: "opt-not-started", label: "Not Started" },
      { id: "opt-working", label: "Working on it" },
      { id: "opt-done", label: "Done" },
    ],
  });
  const dropdownCol = makeColumn("col-job", "Job Type", "dropdown", 0, {
    options: [
      { id: "opt-retouching", label: "Retouching" },
      { id: "opt-compositing", label: "Compositing" },
    ],
  });
  const priorityCol = makeColumn("col-priority", "Priority", "priority", 0, {
    options: [
      { id: "opt-low", label: "Low" },
      { id: "opt-high", label: "High" },
    ],
  });

  it("resolves a status option ID to its label", () => {
    expect(getExportValue(statusCol, "opt-done")).toBe("Done");
  });

  it("resolves a dropdown option ID to its label", () => {
    expect(getExportValue(dropdownCol, "opt-retouching")).toBe("Retouching");
  });

  it("resolves a priority option ID to its label", () => {
    expect(getExportValue(priorityCol, "opt-high")).toBe("High");
  });

  it("keeps a value that is already a matching label", () => {
    expect(getExportValue(statusCol, "Done")).toBe("Done");
  });

  it("extracts label from an object value { label, color }", () => {
    expect(getExportValue(statusCol, { label: "Working on it", color: "#3b82f6" })).toBe(
      "Working on it",
    );
  });

  it("falls back to the raw value when no option matches", () => {
    expect(getExportValue(statusCol, "Custom Status")).toBe("Custom Status");
  });

  it("returns empty string for null values", () => {
    expect(getExportValue(statusCol, null)).toBe("");
  });
});

describe("getExportValue — other column types", () => {
  it("formats date strings as Date objects", () => {
    const dateCol = makeColumn("col-date", "Date", "date", 0);
    const result = getExportValue(dateCol, "2026-09-01");
    expect(result).toBeInstanceOf(Date);
    expect((result as Date).toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("formats checkbox booleans as Yes/No", () => {
    const cbCol = makeColumn("col-cb", "Done?", "checkbox", 0);
    expect(getExportValue(cbCol, true)).toBe("Yes");
    expect(getExportValue(cbCol, false)).toBe("No");
  });

  it("returns raw numbers for numeric columns", () => {
    const numCol = makeColumn("col-num", "Count", "number", 0);
    expect(getExportValue(numCol, 42)).toBe(42);
    expect(getExportValue(numCol, "42")).toBe(42);
  });

  it("joins array values (tags) with comma", () => {
    const tagsCol = makeColumn("col-tags", "Tags", "tags", 0);
    expect(getExportValue(tagsCol, ["alpha", "beta"])).toBe("alpha, beta");
  });

  it("extracts label from object array items (tags with objects)", () => {
    const tagsCol = makeColumn("col-tags", "Tags", "tags", 0);
    expect(getExportValue(tagsCol, [{ label: "alpha" }, { label: "beta" }])).toBe(
      "alpha, beta",
    );
  });

  it("extracts label from person object values", () => {
    const personCol = makeColumn("col-person", "Owner", "person", 0);
    expect(getExportValue(personCol, { label: "Jane Doe", color: "#3b82f6" })).toBe(
      "Jane Doe",
    );
  });
});

describe("buildExportWorkbook — primary column & ordering (Bug 2)", () => {
  it("includes the record title (primary column) as the first column", () => {
    const workbook = buildExportWorkbook({
      boardName: "ProjectBoard",
      columns: COLUMNS,
      records: [
        {
          record: { id: "r1", title: "Acme Corp", groupId: null },
          cellValues: {
            "col-client": "Acme",
            "col-status": "Done",
            "col-date": "2026-09-01",
            "col-assigned": "Jane",
          },
        },
      ],
      groups: GROUPS,
    });
    const parsed = parseBuffer(workbookToArrayBuffer(workbook));
    expect(parsed.headers[0]).toBe("Name");
    expect(parsed.rows[0]["Name"]).toBe("Acme Corp");
  });

  it("uses primaryColumnLabel when provided", () => {
    const workbook = buildExportWorkbook({
      boardName: "ProjectBoard",
      columns: COLUMNS,
      primaryColumnLabel: "Item Name",
      records: [
        {
          record: { id: "r1", title: "Acme Corp", groupId: null },
          cellValues: {
            "col-status": "Done",
            "col-assigned": "Jane",
          },
        },
      ],
      groups: GROUPS,
    });
    const parsed = parseBuffer(workbookToArrayBuffer(workbook));
    expect(parsed.headers[0]).toBe("Item Name");
    expect(parsed.rows[0]["Item Name"]).toBe("Acme Corp");
  });

  it("reflects a reordered columnOrder instead of the .order field", () => {
    // COLUMNS are ordered: client(0), status(1), date(2), assigned(3)
    // Simulate the user dragging "Assigned To" before "Status".
    // The .order field still says 3 for assigned, 1 for status — but
    // columnOrder reflects the new visual order.
    const reorderedColumnOrder = [
      "col-client",
      "col-assigned", // moved before status
      "col-status",
      "col-date",
    ];
    const workbook = buildExportWorkbook({
      boardName: "ProjectBoard",
      columns: COLUMNS,
      columnOrder: reorderedColumnOrder,
      records: [
        {
          record: { id: "r1", title: "Acme Corp", groupId: "group-todo" },
          cellValues: {
            "col-client": "Acme",
            "col-status": "Done",
            "col-date": "2026-09-01",
            "col-assigned": "Jane",
          },
        },
      ],
      groups: GROUPS,
    });
    const parsed = parseBuffer(workbookToArrayBuffer(workbook));
    // The title column ("Name") is always first, followed by the
    // user-reordered columns.
    expect(parsed.headers).toEqual([
      "Name",
      "Client Name",
      "Assigned To",
      "Status",
      "Date",
      "Group",
    ]);
  });

  it("excludes hidden columns even when present in columnOrder", () => {
    const hiddenCol = { ...COLUMNS[3], hidden: true };
    const cols = [COLUMNS[0], COLUMNS[1], COLUMNS[2], hiddenCol];
    const workbook = buildExportWorkbook({
      boardName: "ProjectBoard",
      columns: cols,
      columnOrder: cols.map((c) => c.id),
      records: [
        {
          record: { id: "r1", title: "Acme", groupId: "group-todo" },
          cellValues: {
            "col-client": "Acme",
            "col-status": "Done",
            "col-date": "2026-09-01",
            "col-assigned": "Jane",
          },
        },
      ],
      groups: GROUPS,
    });
    const parsed = parseBuffer(workbookToArrayBuffer(workbook));
    // "Assigned To" (col-assigned) is hidden and should NOT appear.
    expect(parsed.headers).toEqual(["Name", "Client Name", "Status", "Date", "Group"]);
  });

  it("warns and skips column IDs in columnOrder with no matching definition", () => {
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const workbook = buildExportWorkbook({
      boardName: "ProjectBoard",
      columns: COLUMNS,
      columnOrder: ["col-status", "ghost-id", "col-date"],
      records: [
        {
          record: { id: "r1", title: "Acme", groupId: "group-todo" },
          cellValues: {
            "col-status": "Done",
            "col-date": "2026-09-01",
          },
        },
      ],
      groups: GROUPS,
    });
    const parsed = parseBuffer(workbookToArrayBuffer(workbook));
    expect(parsed.headers).toEqual(["Name", "Status", "Date", "Group"]);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Column ID "ghost-id"'),
    );
    consoleWarnSpy.mockRestore();
  });
});

describe("isRowEmpty", () => {
  it("treats a fully null/empty row as empty", () => {
    expect(isRowEmpty([null, null, null])).toBe(true);
    expect(isRowEmpty(["", "", ""])).toBe(true);
    expect(isRowEmpty(["   ", "\t", " "])).toBe(true);
  });

  it("treats a row with data in one column as non-empty", () => {
    expect(isRowEmpty(["Acme", null, ""])).toBe(false);
    expect(isRowEmpty([null, "Working", ""])).toBe(false);
  });

  it("treats zero and false as real values, not blank", () => {
    expect(isRowEmpty([0, false, ""])).toBe(false);
    expect(isRowEmpty([0, false, null])).toBe(false);
  });

  it("treats an empty array and null as empty", () => {
    expect(isRowEmpty([])).toBe(true);
    expect(isRowEmpty(null)).toBe(true);
    expect(isRowEmpty(undefined)).toBe(true);
  });

  it("treats an empty object row as empty and a populated one as non-empty", () => {
    expect(isRowEmpty({})).toBe(true);
    expect(isRowEmpty({ a: null, b: "" })).toBe(true);
    expect(isRowEmpty({ a: "x", b: null })).toBe(false);
  });
});

describe("parseBuffer blank-row filtering", () => {
  it("skips trailing blank rows so only real data is counted", () => {
    const buffer = makeXlsxBuffer([
      ["Client", "Status"],
      ["Acme", "Done"],
      ["Beta", "Working"],
      ["", ""],
      ["", ""],
      ["", ""],
    ]);
    const parsed = parseBuffer(buffer);
    expect(parsed.headers).toEqual(["Client", "Status"]);
    expect(parsed.totalRowCount).toBe(2);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]).toEqual({ Client: "Acme", Status: "Done" });
    expect(parsed.rows[1]).toEqual({ Client: "Beta", Status: "Working" });
  });

  it("skips blank rows in the middle of the data without stopping the import", () => {
    const buffer = makeXlsxBuffer([
      ["Client", "Status"],
      ["Acme", "Done"],
      ["", ""],
      ["Beta", "Working"],
      ["Gamma", "Done"],
    ]);
    const parsed = parseBuffer(buffer);
    expect(parsed.totalRowCount).toBe(3);
    expect(parsed.rows.map((r) => r.Client)).toEqual(["Acme", "Beta", "Gamma"]);
  });

  it("keeps a row that has data in only one column", () => {
    const buffer = makeXlsxBuffer([
      ["Client", "Status"],
      ["Acme", ""],
      ["", "Done"],
    ]);
    const parsed = parseBuffer(buffer);
    expect(parsed.totalRowCount).toBe(2);
    expect(parsed.rows[0]).toEqual({ Client: "Acme", Status: null });
    expect(parsed.rows[1]).toEqual({ Client: null, Status: "Done" });
  });

  it("returns zero rows when every data row is blank", () => {
    const buffer = makeXlsxBuffer([
      ["Client", "Status"],
      ["", ""],
      ["", ""],
    ]);
    const parsed = parseBuffer(buffer);
    expect(parsed.totalRowCount).toBe(0);
    expect(parsed.rows).toHaveLength(0);
  });

  it("still enforces the max-row limit after filtering blanks", () => {
    const aoa: unknown[][] = [["Client"], ["r1"]];
    for (let i = 0; i < 10_001; i++) aoa.push(["r" + i]);
    const buffer = makeXlsxBuffer(aoa);
    expect(() => parseBuffer(buffer)).toThrow(/too many rows/i);
  });

  it("does not count blank rows toward the max-row limit", () => {
    // 10_000 real rows + trailing blanks must pass (blanks are filtered first).
    const aoa: unknown[][] = [["Client"]];
    for (let i = 0; i < 10_000; i++) aoa.push(["r" + i]);
    aoa.push([""], [""], [""]);
    const buffer = makeXlsxBuffer(aoa);
    const parsed = parseBuffer(buffer);
    expect(parsed.totalRowCount).toBe(10_000);
  });
});
