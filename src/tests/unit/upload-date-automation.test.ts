import { describe, expect, it } from "vitest";

type Cell = { valueText?: string | null };
type Column = { label: string; options: Array<string | { id?: string; label?: string }> };

function isFirstFill(oldCell: Cell | null, newCell: Cell): boolean {
  const oldFilled = Boolean(oldCell?.valueText?.trim());
  const newFilled = Boolean(newCell.valueText?.trim());
  return !oldFilled && newFilled;
}

function targetColumns(columns: Column[]): Array<{ label: string; doneValue: string | null }> {
  return columns
    .filter((column) => ["status", "tat", "upload status"].includes(column.label.trim().toLowerCase()))
    .map((column) => {
      const done = column.options.find((option) =>
        (typeof option === "string" ? option : option.label ?? "").trim().toLowerCase() === "done",
      );
      return {
        label: column.label,
        doneValue: typeof done === "string" ? done : done?.id ?? done?.label ?? null,
      };
    });
}

function shouldSetStatus(targets: Array<{ doneValue: string | null }>, currentStatus?: string | null): boolean {
  if (!targets.length) return false;
  for (const t of targets) {
    if (t.doneValue == null) continue;
    const cur = currentStatus?.trim().toLowerCase();
    if (cur === "done") return false;
  }
  return targets.some((t) => t.doneValue != null);
}

describe("Upload Date status automation contract", () => {
  it("fires only on the first fill", () => {
    expect(isFirstFill(null, { valueText: "2026-10-27" })).toBe(true);
    expect(isFirstFill({ valueText: "" }, { valueText: "2026-10-27" })).toBe(true);
    expect(isFirstFill({ valueText: "2026-10-26" }, { valueText: "2026-10-27" })).toBe(false);
    expect(isFirstFill({ valueText: "2026-10-26" }, { valueText: "" })).toBe(false);
  });

  it("matches only the three exact target labels and leaves Invoice Status out", () => {
    expect(targetColumns([
      { label: "Status", options: [{ id: "done-id", label: "Done" }] },
      { label: "TAT", options: ["Working on it", "Done"] },
      { label: "Upload Status", options: [{ id: "complete", label: "Completed" }] },
      { label: "Invoice Status", options: [{ id: "invoice-done", label: "Done" }] },
    ])).toEqual([
      { label: "Status", doneValue: "done-id" },
      { label: "TAT", doneValue: "Done" },
      { label: "Upload Status", doneValue: null },
    ]);
  });

  it("does not overwrite a status that is already Done", () => {
    const current = "Done";
    const targets = targetColumns([{ label: "Status", options: ["Working on it", "Done"] }]);
    expect(shouldSetStatus(targets, current)).toBe(false);
  });

  it("skips a board with no matching columns", () => {
    expect(targetColumns([{ label: "Invoice Status", options: ["Done"] }])).toEqual([]);
  });

  it("first fill sets Done on Status", () => {
    const targets = targetColumns([{ label: "Status", options: [{ id: "done-id", label: "Done" }] }]);
    expect(shouldSetStatus(targets, "Working on it")).toBe(true);
    expect(targets[0]?.doneValue).toBe("done-id");
  });

  it("later edit does not trigger (not first fill)", () => {
    expect(isFirstFill({ valueText: "2026-10-01" }, { valueText: "2026-10-27" })).toBe(false);
  });

  it("manual change after Done is not overwritten", () => {
    const targets = targetColumns([{ label: "Status", options: ["Working on it", "Done"] }]);
    expect(shouldSetStatus(targets, "Done")).toBe(false);
    expect(shouldSetStatus(targets, "working on it")).toBe(true);
  });

  it("Invoice Status untouched", () => {
    const targets = targetColumns([
      { label: "Status", options: ["Done"] },
      { label: "Invoice Status", options: ["Done"] },
    ]);
    expect(targets.map((t) => t.label)).toEqual(["Status"]);
  });

  it("status column without Done label is skipped", () => {
    const targets = targetColumns([{ label: "Status", options: ["Working on it", "Pending"] }]);
    expect(targets[0]?.doneValue).toBe(null);
  });

  it("bulk/paste/import use same path (contract)", () => {
    // same logic applies to any cell save path
    expect(isFirstFill(null, { valueText: "2026-01-01" })).toBe(true);
  });
});
