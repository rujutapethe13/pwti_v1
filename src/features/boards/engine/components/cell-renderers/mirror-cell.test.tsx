import { describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: null, error: new Error("not found") }),
        }),
      }),
    }),
  },
}));

import { MirrorCellRenderer } from "@/features/boards/engine/components/cell-renderers/mirror-cell";
import { MirrorDataProvider } from "@/features/boards/engine/connected-data/mirror-data-context";
import { MirrorStore } from "@/features/boards/engine/connected-data/mirror-store";
import type { CellRendererComponentProps } from "@/features/boards/engine/components/cell-renderers/cell-renderer-registry";
import type { ColumnDefinition, ColumnValue } from "@/features/boards/engine/types";
import { normalizeRecordId, parseConnectedBoardLinks } from "@/features/boards/engine/connected-data/mirror-utils";

describe("parseConnectedBoardLinks", () => {
  it.each([
    ["whitespace", "  item-1 ", "item-1"],
    ["numeric id", 42, "42"],
    ["record prefix", "rec_item-1", "item-1"],
  ])("normalizes %s ids", (_name, value, expected) => {
    expect(normalizeRecordId(value)).toBe(expected);
  });

  it.each([
    ["object shape", { linked_item_ids: [{ board_id: "b", item_id: "i" }] }],
    ["id array", ["i"]],
    ["object array", [{ board_id: "b", id: "i" }]],
    ["single id", "i"],
  ])("normalizes %s", (_name, value) => {
    expect(parseConnectedBoardLinks(value as ColumnValue, "b")).toEqual([{ board_id: "b", item_id: "i" }]);
  });

  it("preserves the display snapshot while using the normalized id", () => {
    expect(parseConnectedBoardLinks({
      linked_item_ids: [{ board_id: "b", item_id: "rec_i", item_name: "LEVI'S" }],
    } as ColumnValue)).toEqual([
      { board_id: "b", item_id: "i", item_name: "LEVI'S", workspace_id: undefined },
    ]);
  });
});

function col(overrides: Partial<ColumnDefinition> & { id: string; type: ColumnDefinition["type"] }): ColumnDefinition {
  return {
    boardId: "board-a",
    key: overrides.id,
    label: overrides.label ?? overrides.id,
    required: false,
    hidden: false,
    frozen: false,
    defaultValue: null,
    settings: {},
    permissions: { view: [], edit: [], configure: [] },
    validation: [],
    version: 1,
    order: 0,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

function renderMirrorCell(
  props: Partial<CellRendererComponentProps>,
  setup: (store: MirrorStore) => void = () => {},
) {
  const store = new MirrorStore();
  setup(store);

  const cellValues = new Map<string, ColumnValue>();
  for (const rec of store.getRecords("board-a")) {
    for (const c of store.getColumns("board-a")) {
      const v = store.getCellValue("board-a", rec.id, c.id);
      cellValues.set(`${rec.id}:${c.id}`, v);
    }
  }

  const fullProps: CellRendererComponentProps = {
    value: null,
    column: col({ id: "mirror-1", type: "mirror" }),
    recordId: "record-1",
    boardId: "board-a",
    organizationId: "org-main",
    workspaceId: "ws-main",
    readOnly: false,
    ...props,
  };

  const onChange = vi.fn();
  fullProps.onChange = onChange;

  const utils = render(
    <MirrorDataProvider boardId="board-a" cellValues={cellValues} store={store}>
      <MirrorCellRenderer {...fullProps} onChange={onChange} />
    </MirrorDataProvider>,
  );

  return { store, onChange, ...utils };
}

describe("MirrorCellRenderer — Part 3: read path", () => {
  it("opens mirror configuration from the unconfigured placeholder", async () => {
    const user = userEvent.setup();
    const onConfigureMirror = vi.fn();
    renderMirrorCell({
      column: col({ id: "mirror-1", type: "mirror" }),
      onConfigureMirror,
    });

    await user.click(screen.getByRole("button", { name: "Choose column to mirror" }));
    expect(onConfigureMirror).toHaveBeenCalledWith(expect.objectContaining({ id: "mirror-1" }));
  });

  it("shows a placeholder when there are zero linked items", () => {
    renderMirrorCell(
      {
        column: col({
          id: "mirror-1",
          type: "mirror",
          settings: {
            source_connect_column_id: "connect-1",
            mirrored_column_id: "src-status",
            display_config: { aggregation: null },
          },
        }),
      },
      (store) => {
        store.setCellValue("board-a", "record-1", "connect-1", { linked_item_ids: [] });
      },
    );
    expect(screen.getByText("—")).toBeTruthy();
  });

  it("shows a placeholder when the source cell is missing entirely", () => {
    renderMirrorCell({
      column: col({
        id: "mirror-1",
        type: "mirror",
        settings: {
          source_connect_column_id: "connect-1",
          mirrored_column_id: "src-status",
          display_config: { aggregation: null },
        },
      }),
    });
    expect(screen.getByText("—")).toBeTruthy();
  });

  it("renders a single linked STATUS value as a colored pill", () => {
    renderMirrorCell(
      {
        column: col({
          id: "mirror-1",
          type: "mirror",
          settings: {
            source_connect_column_id: "connect-1",
            mirrored_column_id: "production-status",
            display_config: { aggregation: null, display_mode: "inline" },
          },
        }),
      },
      (store) => {
        store.setCellValue("board-a", "record-1", "connect-1", {
          linked_item_ids: [{ board_id: "production", item_id: "record-2" }],
        });
      },
    );
    const text = screen.getByText("Review");
    expect(text).toBeTruthy();
    expect(text.className).toContain("rounded-full");
  });

  it("renders a single linked NUMBER value formatted", () => {
    renderMirrorCell(
      {
        column: col({
          id: "mirror-1",
          type: "mirror",
          settings: {
            source_connect_column_id: "connect-1",
            mirrored_column_id: "analytics-value",
            display_config: { aggregation: null },
          },
        }),
      },
      (store) => {
        store.setCellValue("board-a", "record-1", "connect-1", {
          linked_item_ids: [{ board_id: "analytics", item_id: "analytics-1" }],
        });
      },
    );
    expect(screen.getByText("92")).toBeTruthy();
  });

  it("renders a single linked DATE value", () => {
    renderMirrorCell(
      {
        column: col({
          id: "mirror-1",
          type: "mirror",
          settings: {
            source_connect_column_id: "connect-1",
            mirrored_column_id: "production-due-date",
            display_config: { aggregation: null },
          },
        }),
      },
      (store) => {
        store.setCellValue("board-a", "record-1", "connect-1", {
          linked_item_ids: [{ board_id: "production", item_id: "record-1" }],
        });
      },
    );
    expect(screen.getByText("2026-08-11")).toBeTruthy();
  });

  it("aggregates multiple NUMBER values with sum in stacked mode", () => {
    renderMirrorCell(
      {
        column: col({
          id: "mirror-1",
          type: "mirror",
          settings: {
            source_connect_column_id: "connect-1",
            mirrored_column_id: "analytics-value",
            display_config: { aggregation: "sum" },
          },
        }),
      },
      (store) => {
        store.setCellValue("board-a", "record-1", "connect-1", {
          linked_item_ids: [
            { board_id: "analytics", item_id: "analytics-1" },
            { board_id: "analytics", item_id: "analytics-2" },
            { board_id: "analytics", item_id: "analytics-3" },
          ],
        });
      },
    );
    expect(screen.getByText("134")).toBeTruthy();
    expect(screen.getByText("Value:")).toBeTruthy();
  });

  it("aggregates multiple STATUS values as a list of unique labels", () => {
    renderMirrorCell(
      {
        column: col({
          id: "mirror-1",
          type: "mirror",
          settings: {
            source_connect_column_id: "connect-1",
            mirrored_column_id: "production-status",
            display_config: { aggregation: "list" },
          },
        }),
      },
      (store) => {
        store.setCellValue("board-a", "record-1", "connect-1", {
          linked_item_ids: [
            { board_id: "production", item_id: "record-1" },
            { board_id: "production", item_id: "record-2" },
            { board_id: "production", item_id: "record-3" },
          ],
        });
      },
    );
    expect(screen.getByText("Done, Review, In Progress")).toBeTruthy();
  });

  it("filters STATUS values to a count matching a target in stacked mode", () => {
    renderMirrorCell(
      {
        column: col({
          id: "mirror-1",
          type: "mirror",
          settings: {
            source_connect_column_id: "connect-1",
            mirrored_column_id: "production-status",
             display_config: { aggregation: "filter", filter_value: "Done" },
          },
        }),
      },
      (store) => {
        store.setCellValue("board-a", "record-1", "connect-1", {
          linked_item_ids: [
            { board_id: "production", item_id: "record-1" },
            { board_id: "production", item_id: "record-2" },
            { board_id: "production", item_id: "record-3" },
          ],
        });
      },
    );
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText("Status:")).toBeTruthy();
  });

  it("aggregates multiple DATE values as a range", () => {
    renderMirrorCell(
      {
        column: col({
          id: "mirror-1",
          type: "mirror",
          settings: {
            source_connect_column_id: "connect-1",
            mirrored_column_id: "production-due-date",
            display_config: { aggregation: "range" },
          },
        }),
      },
      (store) => {
        store.setCellValue("board-a", "record-1", "connect-1", {
          linked_item_ids: [
            { board_id: "production", item_id: "record-1" },
            { board_id: "production", item_id: "record-2" },
            { board_id: "production", item_id: "record-3" },
          ],
        });
      },
    );
    expect(screen.getByText("2026-08-11 – 2026-08-25")).toBeTruthy();
  });
});

describe("MirrorCellRenderer — Part 4: editability & write-through", () => {
  it("shows a formatted value by default for a single linked item (read-first)", () => {
    renderMirrorCell(
      {
        column: col({
          id: "mirror-1",
          type: "mirror",
          settings: {
            source_connect_column_id: "connect-1",
            mirrored_column_id: "analytics-value",
            display_config: { aggregation: null, display_mode: "inline" },
          },
        }),
      },
      (store) => {
        store.setCellValue("board-a", "record-1", "connect-1", {
          linked_item_ids: [{ board_id: "analytics", item_id: "analytics-1" }],
        });
      },
    );
    expect(screen.getByText("92")).toBeTruthy();
    expect(screen.queryByRole("spinbutton")).toBeNull();
  });

  it("remains read-only when a single-link mirror is clicked", () => {
    renderMirrorCell(
      {
        column: col({
          id: "mirror-1",
          type: "mirror",
          settings: {
            source_connect_column_id: "connect-1",
            mirrored_column_id: "analytics-value",
            display_config: { aggregation: null, display_mode: "inline" },
          },
        }),
      },
      (store) => {
        store.setCellValue("board-a", "record-1", "connect-1", {
          linked_item_ids: [{ board_id: "analytics", item_id: "analytics-1" }],
        });
      },
    );
    expect(screen.queryByRole("spinbutton")).toBeNull();
  });

  it("is strictly read-only (no input) when aggregating multiple items", () => {
    renderMirrorCell(
      {
        column: col({
          id: "mirror-1",
          type: "mirror",
          settings: {
            source_connect_column_id: "connect-1",
            mirrored_column_id: "analytics-value",
            display_config: { aggregation: "sum" },
          },
        }),
      },
      (store) => {
        store.setCellValue("board-a", "record-1", "connect-1", {
          linked_item_ids: [
            { board_id: "analytics", item_id: "analytics-1" },
            { board_id: "analytics", item_id: "analytics-2" },
          ],
        });
      },
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Value:")).toBeTruthy();
  });

  it("does not write through to the source cell", () => {
    const { store } = renderMirrorCell(
      {
        column: col({
          id: "mirror-1",
          type: "mirror",
          settings: {
            source_connect_column_id: "connect-1",
            mirrored_column_id: "analytics-value",
            display_config: { aggregation: null, display_mode: "inline" },
          },
        }),
      },
      (store) => {
        store.setCellValue("board-a", "record-1", "connect-1", {
          linked_item_ids: [{ board_id: "analytics", item_id: "analytics-1" }],
        });
      },
    );

    expect(store.getCellValue("analytics", "analytics-1", "analytics-value")).toBe(92);
    expect(screen.queryByRole("spinbutton")).toBeNull();
  });

  it("propagates updates live to another mirror watching the same source", () => {
    const store = new MirrorStore();
    store.setCellValue("board-a", "record-1", "connect-1", {
      linked_item_ids: [{ board_id: "analytics", item_id: "analytics-1" }],
    });
    store.setCellValue("board-a", "record-2", "connect-1", {
      linked_item_ids: [{ board_id: "analytics", item_id: "analytics-1" }],
    });

    const cellValues = new Map<string, ColumnValue>();
    for (const rec of store.getRecords("board-a")) {
      for (const c of store.getColumns("board-a")) {
        cellValues.set(`${rec.id}:${c.id}`, store.getCellValue("board-a", rec.id, c.id));
      }
    }

    const makeColumn = (id: string) =>
      col({
        id,
        type: "mirror",
        settings: {
          source_connect_column_id: "connect-1",
          mirrored_column_id: "analytics-value",
          display_config: { aggregation: null, display_mode: "inline" },
        },
      });

    const { rerender } = render(
      <MirrorDataProvider boardId="board-a" cellValues={cellValues} store={store}>
        <div>
          <MirrorCellRenderer
            value={null}
            column={makeColumn("mirror-1")}
            recordId="record-1"
            boardId="board-a"
            organizationId="org-main"
            workspaceId="ws-main"
            readOnly={false}
          />
          <MirrorCellRenderer
            value={null}
            column={makeColumn("mirror-2")}
            recordId="record-2"
            boardId="board-a"
            organizationId="org-main"
            workspaceId="ws-main"
            readOnly={false}
          />
        </div>
      </MirrorDataProvider>,
    );

    expect(screen.getAllByText("92")).toHaveLength(2);

    store.setCellValue("analytics", "analytics-1", "analytics-value", 200);
    rerender(
      <MirrorDataProvider boardId="board-a" cellValues={cellValues} store={store}>
        <div>
          <MirrorCellRenderer value={null} column={makeColumn("mirror-1")} recordId="record-1" boardId="board-a" organizationId="org-main" workspaceId="ws-main" readOnly={false} />
          <MirrorCellRenderer value={null} column={makeColumn("mirror-2")} recordId="record-2" boardId="board-a" organizationId="org-main" workspaceId="ws-main" readOnly={false} />
        </div>
      </MirrorDataProvider>,
    );
    expect(screen.getAllByText("200")).toHaveLength(2);
  });

  it("greys/italicises mirror cells to signal read-through", () => {
    renderMirrorCell(
      {
        column: col({
          id: "mirror-1",
          type: "mirror",
          settings: {
            source_connect_column_id: "connect-1",
            mirrored_column_id: "analytics-value",
            display_config: { aggregation: null },
          },
        }),
      },
      (store) => {
        store.setCellValue("board-a", "record-1", "connect-1", {
          linked_item_ids: [{ board_id: "analytics", item_id: "analytics-1" }],
        });
      },
    );
    const display = screen.getByText("92")?.closest("div");
    expect(display).toBeTruthy();
    expect(display!.className).toContain("opacity-80");
    expect(display!.className).toContain("italic");
  });
});

describe("MirrorCellRenderer — Part 6: multiple mirrors per Connect column", () => {
  it("two mirrors off one Connect column render independently", () => {
    const store = new MirrorStore();
    store.setCellValue("board-a", "record-1", "connect-1", {
      linked_item_ids: [{ board_id: "analytics", item_id: "analytics-1" }],
    });
    store.setCellValue("board-a", "record-2", "connect-1", {
      linked_item_ids: [{ board_id: "analytics", item_id: "analytics-2" }],
    });

    const cellValues = new Map<string, ColumnValue>();
    for (const rec of store.getRecords("board-a")) {
      for (const c of store.getColumns("board-a")) {
        cellValues.set(`${rec.id}:${c.id}`, store.getCellValue("board-a", rec.id, c.id));
      }
    }

    const mirrorValue = col({
      id: "mirror-value",
      type: "mirror",
      settings: {
        source_connect_column_id: "connect-1",
        mirrored_column_id: "analytics-value",
        display_config: { aggregation: null, display_mode: "inline" },
      },
    });
    const mirrorMetric = col({
      id: "mirror-metric",
      type: "mirror",
      settings: {
        source_connect_column_id: "connect-1",
        mirrored_column_id: "analytics-metric",
        display_config: { aggregation: null, display_mode: "inline" },
      },
    });

    render(
      <MirrorDataProvider boardId="board-a" cellValues={cellValues} store={store}>
        <div>
          <MirrorCellRenderer
            value={null}
            column={mirrorValue}
            recordId="record-1"
            boardId="board-a"
            organizationId="org-main"
            workspaceId="ws-main"
            readOnly={false}
          />
          <MirrorCellRenderer
            value={null}
            column={mirrorMetric}
            recordId="record-1"
            boardId="board-a"
            organizationId="org-main"
            workspaceId="ws-main"
            readOnly={false}
          />
          <MirrorCellRenderer
            value={null}
            column={mirrorValue}
            recordId="record-2"
            boardId="board-a"
            organizationId="org-main"
            workspaceId="ws-main"
            readOnly={false}
          />
        </div>
      </MirrorDataProvider>,
    );

    expect(screen.getByText("92")).toBeTruthy();
    expect(screen.getByText("Delivery Health")).toBeTruthy();
    expect(screen.getByText("18")).toBeTruthy();

    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(store.getCellValue("analytics", "analytics-1", "analytics-metric")).toBe(
      "Delivery Health",
    );
    expect(store.getCellValue("analytics", "analytics-2", "analytics-value")).toBe(18);
  });

  it("reflects a direct change to the source cell (edit on Board B → updates on Board A)", () => {
    const store = new MirrorStore();
    store.setCellValue("board-a", "record-1", "connect-1", {
      linked_item_ids: [{ board_id: "analytics", item_id: "analytics-1" }],
    });

    const cellValues = new Map<string, ColumnValue>();
    for (const rec of store.getRecords("board-a")) {
      for (const c of store.getColumns("board-a")) {
        cellValues.set(`${rec.id}:${c.id}`, store.getCellValue("board-a", rec.id, c.id));
      }
    }

    const mirrorValue = col({
      id: "mirror-value",
      type: "mirror",
      settings: {
        source_connect_column_id: "connect-1",
        mirrored_column_id: "analytics-value",
        display_config: { aggregation: null, display_mode: "inline" },
      },
    });

    const { rerender } = render(
      <MirrorDataProvider boardId="board-a" cellValues={cellValues} store={store}>
        <MirrorCellRenderer
          value={null}
          column={mirrorValue}
          recordId="record-1"
          boardId="board-a"
          organizationId="org-main"
          workspaceId="ws-main"
          readOnly={false}
        />
      </MirrorDataProvider>,
    );

    expect(screen.getByText("92")).toBeTruthy();

    store.setCellValue("analytics", "analytics-1", "analytics-value", 300);

    rerender(
      <MirrorDataProvider boardId="board-a" cellValues={cellValues} store={store}>
        <MirrorCellRenderer
          value={null}
          column={mirrorValue}
          recordId="record-1"
          boardId="board-a"
          organizationId="org-main"
          workspaceId="ws-main"
          readOnly={false}
        />
      </MirrorDataProvider>,
    );

    expect(screen.getByText("300")).toBeTruthy();
  });
});

cleanup;
