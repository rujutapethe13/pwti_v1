import { describe, expect, it } from "vitest";
import type { ColumnDefinition, ColumnValue } from "@/features/boards/engine/types";
import {
  applyFilters,
  evaluateFilter,
  findColumn,
  getCellValue,
} from "@/features/boards/engine/view-engine/views/dashboard/dashboard-types";

function column(id: string, label: string, type: ColumnDefinition["type"]): ColumnDefinition {
  return {
    id,
    boardId: "b1",
    key: id,
    label,
    type,
    required: false,
    hidden: false,
    frozen: false,
    defaultValue: "",
    settings: { labels: [{ id: "opt-stuck", label: "Stuck" }, { id: "opt-done", label: "Done" }] },
    permissions: { view: [], edit: [], configure: [] },
    validation: [],
    version: 1,
    order: 0,
    createdAt: "",
    updatedAt: "",
  } as ColumnDefinition;
}

function cells(entries: Array<[string, string, ColumnValue]>): Map<string, ColumnValue> {
  return new Map(entries.map(([recordId, columnId, value]) => [`${recordId}:${columnId}`, value]));
}

describe("dashboard widget filter: status is_one_of", () => {
  const statusCol = column("s", "Status", "status");
  const columns = [statusCol];
  const cellValues = cells([
    ["r1", "s", "opt-stuck"],
    ["r2", "s", "opt-done"],
    ["r3", "s", "opt-stuck"],
  ]);
  const records = [{ id: "r1" }, { id: "r2" }, { id: "r3" }];

  it("evaluateFilter matches stored option id for is_one_of", () => {
    const col = findColumn(columns, "s");
    const filter = { operator: "is_one_of", value: ["opt-stuck"] as ColumnValue };
    expect(evaluateFilter(col, records[0], getCellValue("r1", "s", cellValues), filter)).toBe(true);
    expect(evaluateFilter(col, records[1], getCellValue("r2", "s", cellValues), filter)).toBe(false);
    expect(evaluateFilter(col, records[2], getCellValue("r3", "s", cellValues), filter)).toBe(true);
  });

  it("applyFilters returns only stuck records", () => {
    const filters = [{ id: "f1", columnId: "s", operator: "is_one_of", value: ["opt-stuck"] }];
    const out = applyFilters(records, columns, cellValues, filters);
    expect(out.map((r) => r.id)).toEqual(["r1", "r3"]);
  });

  it("count matches real stuck status across all records", () => {
    const filters = [{ id: "f1", columnId: "s", operator: "is_one_of", value: ["opt-stuck"] }];
    expect(applyFilters(records, columns, cellValues, filters).length).toBe(2);
  });
});
