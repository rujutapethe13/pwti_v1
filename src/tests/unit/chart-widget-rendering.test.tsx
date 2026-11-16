/**
 * Rendering tests for the dashboard Status breakdown chart.
 *
 * Regression suite for the "blank chart with only a 100% label" bug. Each
 * scenario renders the shared <ChartCard /> + <ChartWidgetContent /> and
 * asserts that a visible chart (or an explicit empty state) appears — never a
 * 0-height blank widget.
 *
 * The SVG ring is rendered as plain <circle>/<rect> elements, so these tests
 * can assert on real DOM output without a canvas.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChartCard } from "@/features/boards/engine/view-engine/views/dashboard/chart-card";
import { ChartWidgetContent } from "@/features/boards/engine/view-engine/views/dashboard/chart-widget";
import type { ColumnDefinition, ColumnValue } from "@/features/boards/engine/types";
import type { DashboardFilterCondition, BoardGroup, FilterableRecord } from "@/features/boards/engine/view-engine/views/dashboard/dashboard-types";

function makeColumn(
  options: Array<{ id: string; label: string; color?: string }>,
  type: ColumnDefinition["type"] = "status",
): ColumnDefinition {
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

function makeRecord(id: string, status: string | null): FilterableRecord & { title: string } {
  return {
    id,
    title: `Job ${id}`,
    groupId: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    status: status ?? "",
  } as FilterableRecord & { title: string };
}

function renderStatusChart(records: Array<{ id: string; status: string | null }>, col?: ColumnDefinition) {
  const cellValues = new Map<string, ColumnValue>();
  const statusCol = col ?? makeColumn([
    { id: "opt-done", label: "Done", color: "#67C37D" },
    { id: "opt-working", label: "Working on it", color: "#EDAE52" },
    { id: "opt-stuck", label: "Stuck", color: "#C5414E" },
    { id: "opt-not-started", label: "Not Started", color: "#C4C4C4" },
  ]);
  for (const r of records) {
    if (r.status) cellValues.set(`${r.id}:${statusCol.id}`, r.status);
  }
  const props = {
    config: {
      chartType: "donut" as const,
      xAxisColumnId: statusCol.id,
      yAxisMode: "count" as const,
    },
    columns: [statusCol],
    groups: [] as BoardGroup[],
    records: records.map((r) => makeRecord(r.id, r.status)),
    cellValues,
    filters: [] as DashboardFilterCondition[],
  };
  return render(
    <ChartCard title="Status breakdown">
      <ChartWidgetContent {...props} />
    </ChartCard>,
  );
}

describe("ChartCard — shared dashboard wrapper", () => {
  it("renders a real chart when data is present", () => {
    const { container } = renderStatusChart([
      { id: "r1", status: "Done" },
      { id: "r2", status: "Working on it" },
      { id: "r3", status: "Stuck" },
    ]);
    // The donut ring is drawn with <path> elements.
    const shapes = container.querySelectorAll("path");
    expect(shapes.length).toBeGreaterThan(0);
  });

  it("still draws the full ring when every item shares one status", () => {
    const { container } = renderStatusChart([
      { id: "r1", status: "Done" },
      { id: "r2", status: "Done" },
      { id: "r3", status: "Done" },
    ]);
    const shapes = container.querySelectorAll("path");
    expect(shapes.length).toBeGreaterThan(0);
    // The single slice must be visible — a filled path is rendered.
    const filled = Array.from(container.querySelectorAll("path")).filter(
      (p) => (p.getAttribute("fill") ?? "").length > 0,
    );
    expect(filled.length).toBeGreaterThan(0);
  });

  it("shows an empty state when there is no data at all", () => {
    renderStatusChart([]);
    expect(screen.getByText("No data")).toBeTruthy();
  });

  it("renders unknown statuses with a fallback colour instead of going blank", () => {
    const col = makeColumn([{ id: "opt-done", label: "Done", color: "#67C37D" }]);
    const { container } = renderStatusChart(
      [
        { id: "r1", status: "Done" },
        { id: "r2", status: "Mystery State" },
      ],
      col,
    );
    const shapes = container.querySelectorAll("path");
    expect(shapes.length).toBeGreaterThan(0);
  });

  it("draws the full ring for a single slice with a null/empty status label", () => {
    const col = makeColumn([{ id: "opt-done", label: "Done", color: "#67C37D" }]);
    const { container } = renderStatusChart(
      [{ id: "r1", status: null }, { id: "r2", status: null }],
      col,
    );
    const shapes = container.querySelectorAll("path");
    expect(shapes.length).toBeGreaterThan(0);
    expect(container.textContent).toContain("No value");
  });

  it("renders a spinner while loading", () => {
    render(
      <ChartCard title="Status breakdown" loading={true}>
        <div>chart</div>
      </ChartCard>,
    );
    // Loader2 renders as an SVG with the animate-spin class.
    const spin = document.querySelector(".animate-spin");
    expect(spin).toBeTruthy();
  });

  it("shows an error state instead of a blank widget", () => {
    render(
      <ChartCard title="Status breakdown" error={new Error("boom")}>
        <div>chart</div>
      </ChartCard>,
    );
    expect(screen.getByText("Couldn't load chart")).toBeTruthy();
  });
});