import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ColumnDefinition } from "@/features/boards/engine/types";

vi.mock("@/features/boards/engine/actions", () => ({
  updateColumnOptions: vi.fn().mockResolvedValue({ data: {}, error: null }),
  updateColumnLabels: vi.fn().mockResolvedValue({ data: {}, error: null }),
}));

import { StatusCell } from "@/features/boards/engine/components/cell-renderers/status-cell";

/**
 * A Status cell stores the LABEL ID; the label text and colour live on the
 * live column (`settings.labels`). The cell must read them from there — not
 * from a copy taken at mount — and must never leak an id or the string
 * "Unknown option".
 */

const LABELS = [
  { id: "opt-done", label: "Done", color: "#67C37D" },
  { id: "opt-stuck", label: "Stuck", color: "#C5414E" },
];

function makeColumn(settings: Record<string, unknown>): ColumnDefinition {
  return {
    id: "col-status",
    boardId: "b-1",
    key: "status",
    label: "Status",
    type: "status",
    required: false,
    hidden: false,
    frozen: false,
    defaultValue: null,
    settings,
    permissions: { view: [], edit: [], configure: [] },
    validation: [],
    version: 1,
    order: 0,
    createdAt: "",
    updatedAt: "",
  } as ColumnDefinition;
}

function renderCell(
  column: ColumnDefinition,
  value: unknown,
  onUpdateColumnLabels?: (columnId: string, labels: unknown[]) => Promise<boolean>,
) {
  return render(
    <StatusCell
      value={value as never}
      column={column}
      recordId="r-1"
      boardId="b-1"
      organizationId="o-1"
      workspaceId="w-1"
      onUpdateColumnLabels={onUpdateColumnLabels as never}
    />,
  );
}

describe("StatusCell — reads the live labels of the column", () => {
  it("shows the label of a stored label id", () => {
    renderCell(makeColumn({ labels: LABELS }), "opt-stuck");
    expect(screen.getByText("Stuck")).toBeTruthy();
  });

  it("shows the label of a stored label name", () => {
    renderCell(makeColumn({ labels: LABELS }), "Done");
    expect(screen.getByText("Done")).toBeTruthy();
  });

  it("renders an empty cell for a null value", () => {
    const { container } = renderCell(makeColumn({ labels: LABELS }), null);
    expect(container.textContent).toBe("");
    expect(screen.queryByText("Unknown option")).toBeNull();
  });

  it("renders an empty cell and warns for a value that is not a label", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { container } = renderCell(makeColumn({ labels: LABELS }), "opt-orphan");
    expect(container.textContent).toBe("");
    expect(screen.queryByText("Unknown option")).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("col-status"));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("opt-orphan"));
    warn.mockRestore();
  });

  it("falls back to the legacy options array when the column has no labels", () => {
    renderCell(makeColumn({ options: LABELS }), "opt-stuck");
    expect(screen.getByText("Stuck")).toBeTruthy();
  });

  it("opens the picker with the live labels", () => {
    renderCell(makeColumn({ labels: LABELS }), "opt-done");
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("Stuck")).toBeTruthy();
    expect(screen.getByText("Edit Labels")).toBeTruthy();
  });

  it("writes the whole label list through the board update function on Apply", async () => {
    const onUpdateColumnLabels = vi.fn().mockResolvedValue(true);
    renderCell(makeColumn({ labels: LABELS }), "opt-done", onUpdateColumnLabels);

    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByText("Edit Labels"));
    fireEvent.click(screen.getByText("+ New label"));

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Blocked" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.click(screen.getByText("Apply"));

    await waitFor(() => expect(onUpdateColumnLabels).toHaveBeenCalledTimes(1));
    const [columnId, labels] = onUpdateColumnLabels.mock.calls[0] as [string, Array<{ id: string; label: string }>];
    expect(columnId).toBe("col-status");
    expect(labels.map((l) => l.label)).toEqual(["Done", "Stuck", "Blocked"]);
  });

  it("keeps the panel open and reports the error when the write fails", async () => {
    const onUpdateColumnLabels = vi.fn().mockResolvedValue(false);
    renderCell(makeColumn({ labels: LABELS }), "opt-done", onUpdateColumnLabels);

    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByText("Edit Labels"));
    fireEvent.click(screen.getByText("Apply"));

    await waitFor(() => expect(onUpdateColumnLabels).toHaveBeenCalledTimes(1));
    // The panel is still open — the user can retry or cancel.
    expect(screen.getByText("Apply")).toBeTruthy();
  });

  it("discards the draft on Cancel", async () => {
    const onUpdateColumnLabels = vi.fn().mockResolvedValue(true);
    renderCell(makeColumn({ labels: LABELS }), "opt-done", onUpdateColumnLabels);

    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByText("Edit Labels"));
    fireEvent.click(screen.getByText("+ New label"));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Blocked" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.click(screen.getByText("Cancel"));

    expect(onUpdateColumnLabels).not.toHaveBeenCalled();
    expect(screen.queryByText("Apply")).toBeNull();
  });
});
