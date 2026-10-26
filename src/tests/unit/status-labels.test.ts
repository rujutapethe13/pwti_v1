import { describe, it, expect } from "vitest";
import {
  applyColumnUpdates,
  buildColumnSettings,
  buildStatusLabels,
  getColumnOptions,
  mergeColumnLabels,
  mergeColumns,
  mergeLabels,
  sanitizeLabels,
} from "@/features/boards/engine/lib/option-lookup";
import { DEFAULT_STATUS_LABELS } from "@/features/boards/engine/column-registry";
import type { ColumnDefinition } from "@/features/boards/engine/types";

/**
 * A Status column keeps its labels in `column.settings.labels`; every other
 * option column keeps them in `column.settings.options`. These tests pin that
 * contract, the sanitising of a label list and the merge rules that protect
 * local labels from a stale server response.
 */

function column(overrides: Partial<ColumnDefinition> = {}): ColumnDefinition {
  return {
    id: "col-1",
    boardId: "board-1",
    key: "status",
    label: "Status",
    type: "status",
    required: false,
    hidden: false,
    frozen: false,
    defaultValue: null,
    settings: {},
    permissions: { view: [], edit: [], configure: [] },
    validation: [],
    version: 1,
    order: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  } as ColumnDefinition;
}

describe("getColumnOptions — the single label source", () => {
  it("reads a status column's labels from settings.labels", () => {
    const col = column({
      settings: {
        labels: [{ id: "opt-done", label: "Done", color: "#67C37D" }],
        options: [{ id: "opt-legacy", label: "Legacy" }],
      },
    });
    expect(getColumnOptions(col)).toEqual([{ id: "opt-done", label: "Done", color: "#67C37D" }]);
  });

  it("falls back to the legacy options array for a status column without labels", () => {
    const col = column({ settings: { options: [{ id: "opt-legacy", label: "Legacy" }] } });
    expect(getColumnOptions(col)).toEqual([{ id: "opt-legacy", label: "Legacy" }]);
  });

  it("reads a non-status option column from settings.options", () => {
    const col = column({
      type: "dropdown",
      settings: {
        labels: [{ id: "opt-done", label: "Done" }],
        options: [{ id: "opt-legacy", label: "Legacy" }],
      },
    });
    expect(getColumnOptions(col)).toEqual([{ id: "opt-legacy", label: "Legacy" }]);
  });

  it("returns an empty list for a column without any labels", () => {
    expect(getColumnOptions(column())).toEqual([]);
    expect(getColumnOptions(undefined)).toEqual([]);
  });
});

describe("sanitizeLabels", () => {
  it("drops labels without a name", () => {
    expect(sanitizeLabels([{ id: "a", label: "Alpha" }, { id: "b", label: "  " }])).toEqual([
      { id: "a", label: "Alpha" },
    ]);
  });

  it("trims the name", () => {
    expect(sanitizeLabels([{ id: "a", label: "  Alpha  " }])).toEqual([{ id: "a", label: "Alpha" }]);
  });

  it("makes ids unique", () => {
    const result = sanitizeLabels([
      { id: "dup", label: "Alpha" },
      { id: "dup", label: "Beta" },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("dup");
    expect(result[1].id).not.toBe("dup");
  });

  it("generates an id when none is given", () => {
    const result = sanitizeLabels([{ label: "Alpha" }]);
    expect(result[0].id).toBeTruthy();
    expect(result[0].label).toBe("Alpha");
  });

  it("keeps the colour and the variant", () => {
    expect(sanitizeLabels([{ id: "a", label: "Alpha", color: "#fff", variant: "light" }])).toEqual([
      { id: "a", label: "Alpha", color: "#fff", variant: "light" },
    ]);
  });
});

describe("buildStatusLabels", () => {
  it("inserts the four standard labels for an empty column", () => {
    const labels = buildStatusLabels([]);
    expect(labels.map((l) => l.label)).toEqual([
      "Done",
      "Working on it",
      "Stuck",
      "Not Started",
    ]);
    expect(labels.map((l) => l.color)).toEqual(["#67C37D", "#EDAE52", "#C5414E", "#C4C4C4"]);
  });

  it("keeps the id of an existing label so its cells stay valid", () => {
    const labels = buildStatusLabels([{ id: "opt-1792566997259-1jtazse", label: "Done", color: "#3D7F4C" }]);
    const done = labels.find((l) => l.label === "Done");
    expect(done?.id).toBe("opt-1792566997259-1jtazse");
    expect(done?.color).toBe("#67C37D");
    expect(labels).toHaveLength(4);
  });

  it("does not duplicate a label that already exists", () => {
    const labels = buildStatusLabels([
      { id: "opt-done", label: "Done", color: "#67C37D" },
      ...DEFAULT_STATUS_LABELS.slice(1),
    ]);
    expect(labels).toHaveLength(4);
    expect(labels.filter((l) => l.label === "Done")).toHaveLength(1);
  });
});

describe("buildColumnSettings", () => {
  it("seeds a new status column with the four standard labels", () => {
    const settings = buildColumnSettings("status");
    expect(settings.labels).toHaveLength(4);
    expect(settings.options).toHaveLength(4);
  });

  it("keeps the labels a caller supplied", () => {
    const settings = buildColumnSettings("status", {
      labels: [{ id: "x", label: "Only" }],
    });
    expect(settings.labels).toEqual([{ id: "x", label: "Only" }]);
    expect(settings.options).toEqual([{ id: "x", label: "Only" }]);
  });

  it("leaves a text column alone", () => {
    expect(buildColumnSettings("text")).toEqual({});
  });
});

describe("merge rules — a stale response never overwrites local labels", () => {
  const local = column({
    settings: { labels: [{ id: "opt-done", label: "Done" }] },
    updatedAt: "2026-02-02T00:00:00.000Z",
  });

  it("keeps the local labels when the response carries none", () => {
    const incoming = column({ settings: {}, updatedAt: "2026-02-03T00:00:00.000Z" });
    expect(mergeColumnLabels(local, incoming)).toEqual([{ id: "opt-done", label: "Done" }]);
  });

  it("keeps the local labels when the response is older", () => {
    const incoming = column({
      settings: { labels: [{ id: "opt-old", label: "Old" }] },
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(mergeColumnLabels(local, incoming)).toEqual([{ id: "opt-done", label: "Done" }]);
  });

  it("merges a newer response by id", () => {
    const incoming = column({
      settings: { labels: [{ id: "opt-done", label: "Completed" }, { id: "opt-new", label: "Blocked" }] },
      updatedAt: "2026-02-03T00:00:00.000Z",
    });
    const merged = mergeColumnLabels(local, incoming);
    expect(merged).toEqual([
      { id: "opt-done", label: "Completed" },
      { id: "opt-new", label: "Blocked" },
    ]);
  });

  it("mergeLabels keeps the local entry for a shared id", () => {
    expect(
      mergeLabels(
        [{ id: "a", label: "Local" }],
        [{ id: "a", label: "Incoming" }],
      ),
    ).toEqual([{ id: "a", label: "Incoming" }]);
  });

  it("mergeColumns never replaces the local labels with an empty response", () => {
    const incoming = [column({ settings: {} })];
    const merged = mergeColumns([local], incoming);
    expect(merged[0].settings.labels).toEqual([{ id: "opt-done", label: "Done" }]);
  });

  it("applyColumnUpdates only touches the columns it carries", () => {
    const other = column({ id: "col-2", settings: { labels: [{ id: "z", label: "Zed" }] } });
    const updated = applyColumnUpdates(
      [local, other],
      [
        column({
          settings: { labels: [{ id: "opt-done", label: "Completed" }] },
          updatedAt: "2026-02-03T00:00:00.000Z",
        }),
      ],
    );
    expect(updated[0].settings.labels).toEqual([{ id: "opt-done", label: "Completed" }]);
    expect(updated[1].settings.labels).toEqual([{ id: "z", label: "Zed" }]);
  });
});
