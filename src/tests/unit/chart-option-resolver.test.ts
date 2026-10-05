import { describe, it, expect } from "vitest";
import type { ColumnDefinition } from "@/features/boards/engine/types";
import { resolveOptionValue } from "@/features/boards/engine/view-engine/views/dashboard/dashboard-types";
import { getLabel } from "@/features/boards/engine/view-engine/views/dashboard/chart-widget";

/**
 * Regression tests for Bug 4 — chart widget must resolve status cell
 * values by both id and label, and must use the per-option color from
 * column settings (with DEFAULT_COLORS as a semantic fallback) before
 * the generic palette.
 */

function makeColumn(options: Array<{ id: string; label: string; color?: string }>, type: ColumnDefinition["type"] = "status"): ColumnDefinition {
  return {
    id: "col-status",
    boardId: "b-1",
    key: type,
    label: "Status",
    type,
    required: false,
    hidden: false,
    frozen: false,
    defaultValue: null,
    settings: {
      options: options.map((o) => ({ id: o.id, label: o.label, color: o.color })),
    },
    permissions: { view: [], edit: [], configure: [] },
    validation: [],
    version: 1,
    order: 0,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  } as ColumnDefinition;
}

describe("resolveOptionValue (Bug 4 helper)", () => {
  it("matches a value stored as option id", () => {
    const col = makeColumn([
      { id: "done", label: "Done" },
      { id: "working", label: "Working on it" },
    ]);
    const m = resolveOptionValue(col, "working");
    expect(m?.id).toBe("working");
    expect(m?.label).toBe("Working on it");
  });

  it("matches a value stored as option label (the Kanban-drag case)", () => {
    const col = makeColumn([
      { id: "done", label: "Done" },
      { id: "working", label: "Working on it" },
    ]);
    const m = resolveOptionValue(col, "Done");
    expect(m?.id).toBe("done");
    expect(m?.label).toBe("Done");
  });

  it("returns null for null/undefined/empty values", () => {
    const col = makeColumn([{ id: "done", label: "Done" }]);
    expect(resolveOptionValue(col, null)).toBeNull();
    expect(resolveOptionValue(col, undefined)).toBeNull();
    expect(resolveOptionValue(col, "")).toBeNull();
  });

  it("returns null when the value doesn't match any option", () => {
    const col = makeColumn([{ id: "done", label: "Done" }]);
    expect(resolveOptionValue(col, "Not Set")).toBeNull();
  });
});

describe("getLabel (chart-widget dashboard pie/donut legend)", () => {
  const cellValues = new Map<string, unknown>();

  it("resolves an option id stored in a dropdown cell to its label", () => {
    const col = makeColumn([
      { id: "opt-import-123", label: "SAFARI" },
      { id: "opt-import-456", label: "House of Ki" },
    ], "dropdown");
    cellValues.set("rec-1:col-status", "opt-import-123");
    expect(getLabel({ id: "rec-1", title: "Job 1" }, col, cellValues)).toBe("SAFARI");
  });

  it("resolves a label stored in a status cell to its label", () => {
    const col = makeColumn([
      { id: "s1", label: "Not Started" },
      { id: "s2", label: "In Progress" },
    ]);
    cellValues.set("rec-2:col-status", "In Progress");
    expect(getLabel({ id: "rec-2", title: "Job 2" }, col, cellValues)).toBe("In Progress");
  });

  it("hides unresolved opt-import-... ids from the legend", () => {
    const col = makeColumn([{ id: "opt-import-999", label: "Missing" }], "dropdown");
    cellValues.set("rec-3:col-status", "opt-import-000");
    expect(getLabel({ id: "rec-3", title: "Job 3" }, col, cellValues)).toBe("");
  });

  it("falls back to raw string for non-option columns", () => {
    const col: ColumnDefinition = {
      ...makeColumn([]),
      type: "text",
      settings: {},
    };
    cellValues.set("rec-4:col-status", "Foo Bar");
    expect(getLabel({ id: "rec-4", title: "Job 4" }, col, cellValues)).toBe("Foo Bar");
  });

  it("returns the record title when there is no label column", () => {
    expect(getLabel({ id: "rec-5", title: "Untitled" }, undefined, cellValues)).toBe("Untitled");
  });

  it("returns (no title) when both cell and title are missing", () => {
    expect(getLabel({ id: "rec-6", title: "" }, undefined, cellValues)).toBe("(no title)");
  });

  it("returns empty string when an option id is stored but the option has an empty label", () => {
    const col = makeColumn([
      { id: "opt-import-123", label: "" },
      { id: "opt-import-456", label: "House of Ki" },
    ], "dropdown");
    cellValues.set("rec-7:col-status", "opt-import-123");
    expect(getLabel({ id: "rec-7", title: "Job 7" }, col, cellValues)).toBe("");
  });

  it("returns empty string when an option id is stored but the option has no label property", () => {
    const col = {
      id: "col-status",
      boardId: "b-1",
      key: "dropdown",
      label: "Status",
      type: "dropdown" as ColumnDefinition["type"],
      required: false,
      hidden: false,
      frozen: false,
      defaultValue: null,
      settings: {
        options: [
          { id: "opt-import-123" },
          { id: "opt-import-456", label: "House of Ki" },
        ],
      },
      permissions: { view: [], edit: [], configure: [] },
      validation: [],
      version: 1,
      order: 0,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };
    cellValues.set("rec-8:col-status", "opt-import-123");
    expect(getLabel({ id: "rec-8", title: "Job 8" }, col, cellValues)).toBe("");
  });

  it("hides internal import-batch ids even when they appear as option labels", () => {
    const col = makeColumn([
      { id: "opt-import-123", label: "opt-import-123" },
    ], "dropdown");
    cellValues.set("rec-10:col-status", "opt-import-123");
    expect(getLabel({ id: "rec-10", title: "Job 10" }, col, cellValues)).toBe("");
  });

  it("never displays an opt-... string even when it is the option's own label", () => {
    // An option whose label is still its internal id was never given a real
    // name, so there is no user-facing text. The legend must not leak the id.
    const col = makeColumn([
      { id: "opt-1725238400000-abc1234", label: "opt-1725238400000-abc1234" },
    ], "dropdown");
    cellValues.set("rec-11:col-status", "opt-1725238400000-abc1234");
    expect(getLabel({ id: "rec-11", title: "Job 11" }, col, cellValues)).toBe("");
  });

  it("handles mixed string/object option arrays (legacy shape)", () => {
    const col = {
      id: "col-status",
      boardId: "b-1",
      key: "dropdown",
      label: "Status",
      type: "dropdown" as ColumnDefinition["type"],
      required: false,
      hidden: false,
      frozen: false,
      defaultValue: null,
      settings: {
        options: ["SAFARI", { id: "opt-import-456", label: "House of Ki" }],
      },
      permissions: { view: [], edit: [], configure: [] },
      validation: [],
      version: 1,
      order: 0,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };
    cellValues.set("rec-12:col-status", "SAFARI");
    expect(getLabel({ id: "rec-12", title: "Job 12" }, col, cellValues)).toBe("SAFARI");
    cellValues.set("rec-13:col-status", "opt-import-456");
    expect(getLabel({ id: "rec-13", title: "Job 13" }, col, cellValues)).toBe("House of Ki");
  });
});
