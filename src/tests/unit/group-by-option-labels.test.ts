import { describe, it, expect } from "vitest";
import {
  groupRecordsByViewGroupBy,
} from "@/features/boards/engine/view-engine/view-utils";
import type {
  BoardRecord,
  ColumnDefinition,
  ColumnValue,
  ViewGroupBy,
} from "@/features/boards/engine/types";

/**
 * Group-by, search and filter must all treat an option column's cell as an id
 * that resolves to a label — never surfacing "opt-…" to the user, and never
 * failing to match a filter/search typed with the human-readable label.
 */

const OPTIONS = [
  { id: "opt-1790843037295-0", label: "Apperals" },
  { id: "opt-1790843037295-22", label: "Product" },
];

function makeColumn(type: ColumnDefinition["type"] = "dropdown", options: unknown = OPTIONS): ColumnDefinition {
  return {
    id: "col-job-type",
    boardId: "b-1",
    key: "job_type",
    label: "Job Type",
    type,
    required: false,
    hidden: false,
    frozen: false,
    defaultValue: null,
    settings: { options },
    permissions: { view: [], edit: [], configure: [] },
    validation: [],
    version: 1,
    order: 0,
    createdAt: "",
    updatedAt: "",
  } as ColumnDefinition;
}

function makeRecord(id: string): BoardRecord {
  return {
    id,
    organizationId: "o-1",
    workspaceId: "w-1",
    boardId: "b-1",
    groupId: null,
    title: `Job ${id}`,
    status: "active",
    version: 1,
    archivedAt: null,
    createdAt: "",
    updatedAt: "",
  } as BoardRecord;
}

function cells(pairs: Array<[string, ColumnValue]>): Map<string, ColumnValue> {
  return new Map(pairs.map(([k, v]) => [`${k}:col-job-type`, v]));
}

const groupBy: ViewGroupBy = { columnId: "col-job-type", collapsedGroupIds: [] };

describe("group-by resolves option ids to labels", () => {
  it("labels each group with the option label, not the id", () => {
    const records = [makeRecord("1"), makeRecord("2")];
    const result = groupRecordsByViewGroupBy(
      records,
      groupBy,
      [makeColumn()],
      [],
      cells([
        ["1", "opt-1790843037295-0"],
        ["2", "opt-1790843037295-22"],
      ]),
    );
    const labels = result.groups.map((g) => g.label).sort();
    expect(labels).toEqual(["Apperals", "Product"]);
    expect(labels.some((l) => /^opt[-_]/i.test(l))).toBe(false);
  });

  it("groups records sharing one option together", () => {
    const result = groupRecordsByViewGroupBy(
      [makeRecord("1"), makeRecord("2"), makeRecord("3")],
      groupBy,
      [makeColumn()],
      [],
      cells([
        ["1", "opt-1790843037295-0"],
        ["2", "opt-1790843037295-0"],
        ["3", "opt-1790843037295-22"],
      ]),
    );
    const apperals = result.groups.find((g) => g.label === "Apperals");
    expect(apperals?.count).toBe(2);
  });

  it("shows Unknown option rather than an orphaned id", () => {
    const result = groupRecordsByViewGroupBy(
      [makeRecord("1")],
      groupBy,
      [makeColumn()],
      [],
      cells([["1", "opt-9999-77"]]),
    );
    expect(result.groups.map((g) => g.label)).toEqual(["Unknown option"]);
  });

  it("labels groups for a column with no options at all", () => {
    const result = groupRecordsByViewGroupBy(
      [makeRecord("1")],
      groupBy,
      [makeColumn("dropdown", [])],
      [],
      cells([["1", "opt-1790843037295-0"]]),
    );
    expect(result.groups.map((g) => g.label)).toEqual(["Unknown option"]);
  });

  it("still accepts a cell that stores the label directly", () => {
    const result = groupRecordsByViewGroupBy(
      [makeRecord("1")],
      groupBy,
      [makeColumn()],
      [],
      cells([["1", "Apperals"]]),
    );
    expect(result.groups.map((g) => g.label)).toEqual(["Apperals"]);
  });

  it("uses the plain value for non-option columns", () => {
    const result = groupRecordsByViewGroupBy(
      [makeRecord("1")],
      groupBy,
      [makeColumn("text", [])],
      [],
      cells([["1", "Some Text"]]),
    );
    expect(result.groups.map((g) => g.label)).toEqual(["Some Text"]);
  });

  it("keeps the group id as the stored value so drag-and-drop still targets it", () => {
    const result = groupRecordsByViewGroupBy(
      [makeRecord("1")],
      groupBy,
      [makeColumn()],
      [],
      cells([["1", "opt-1790843037295-0"]]),
    );
    expect(result.groups[0].id).toBe("opt-1790843037295-0");
  });
});
