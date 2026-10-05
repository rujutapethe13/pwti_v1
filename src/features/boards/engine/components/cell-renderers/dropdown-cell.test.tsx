import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ColumnDefinition } from "@/features/boards/engine/types";

vi.mock("@/features/boards/engine/actions", () => ({
  updateColumnOptions: vi.fn().mockResolvedValue({ data: {}, error: null }),
}));

import { DropdownCell } from "@/features/boards/engine/components/cell-renderers/dropdown-cell";

/**
 * Regression tests for the "Job Type" column on the Photofactory August board
 * showing raw option ids ("opt-1790843037295-0") instead of labels.
 *
 * The cell stores the option ID; the column's settings.options array is the
 * source of truth for the label. A raw "opt-..." string must never reach the
 * user.
 */

// Exact options read from the live board (col-1790842747289-blns9gj).
const PRODUCTION_OPTIONS = [
  { id: "opt-1790843037295-0", label: "Apperals" },
  { id: "opt-1790843037295-2", label: "Laptop Bag Selling Bag" },
  { id: "opt-1790843037295-22", label: "Product" },
  { id: "opt-1790843037295-36", label: "Jwellery" },
];

function makeColumn(options: unknown[]): ColumnDefinition {
  return {
    id: "col-job-type",
    boardId: "b-1",
    key: "job_type",
    label: "Job Type",
    type: "dropdown",
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

function renderCell(column: ColumnDefinition, value: unknown) {
  return render(
    <DropdownCell
      value={value as never}
      column={column}
      recordId="r-1"
      boardId="b-1"
      organizationId="o-1"
      workspaceId="w-1"
    />,
  );
}

describe("DropdownCell — label lookup for stored option ids", () => {
  it("displays the option label, not the raw id, for a stored option id", () => {
    renderCell(makeColumn(PRODUCTION_OPTIONS), "opt-1790843037295-0");
    expect(screen.getByText("Apperals")).toBeTruthy();
    expect(screen.queryByText(/opt-1790843037295/)).toBeNull();
  });

  it("displays a label for every id in the options list", () => {
    for (const opt of PRODUCTION_OPTIONS) {
      const { unmount } = renderCell(makeColumn(PRODUCTION_OPTIONS), opt.id);
      expect(screen.getByText(opt.label)).toBeTruthy();
      unmount();
    }
  });

  it("shows 'Unknown option' instead of the raw id when the id is orphaned", () => {
    renderCell(makeColumn(PRODUCTION_OPTIONS), "opt-9999999999-77");
    const text = document.body.textContent ?? "";
    expect(text).toContain("Unknown option");
    expect(text).not.toContain("opt-9999999999-77");
  });

  it("shows 'Unknown option' when the column has no options at all", () => {
    renderCell(makeColumn([]), "opt-1790843037295-0");
    const text = document.body.textContent ?? "";
    expect(text).toContain("Unknown option");
    expect(text).not.toContain("opt-1790843037295-0");
  });

  it("still renders a plain label string that is not an option id", () => {
    renderCell(makeColumn(PRODUCTION_OPTIONS), "Retouching");
    expect(screen.getByText("Retouching")).toBeTruthy();
  });

  it("never renders an opt-... string for any orphan-looking value", () => {
    const orphans = ["opt-1", "opt-abc-1", "opt-123-0", "opt-1790843037295-999"];
    for (const value of orphans) {
      const { unmount } = renderCell(makeColumn(PRODUCTION_OPTIONS), value);
      expect(document.body.textContent ?? "").not.toContain(value);
      unmount();
    }
  });
});
