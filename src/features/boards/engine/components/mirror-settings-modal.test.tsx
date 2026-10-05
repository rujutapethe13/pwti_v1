import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "@/tests/test-utils";

const columnData = new Map<string, Array<{ id: string; label: string; type: string; hidden: boolean; sort_order: number }>>();
const boardNames = new Map<string, string>();

function supabaseMock() {
  return {
    from: (table: string) => {
      if (table === "columns") {
        return {
          select: () => ({
            eq: (_col: string, boardId: string) => ({
              order: () => Promise.resolve({ data: columnData.get(boardId) ?? [], error: null }),
            }),
          }),
        };
      }
      if (table === "boards") {
        return {
          select: () => ({
            in: (_col: string, ids: string[]) =>
              Promise.resolve({
                data: ids.map((id) => ({ id, name: boardNames.get(id) ?? id })),
                error: null,
              }),
          }),
        };
      }
      return { select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }) };
    },
  };
}

vi.mock("@/lib/supabase/client", () => ({
  supabase: supabaseMock(),
}));

vi.mock("@/lib/workspace-context", () => ({
  useWorkspace: () => ({
    activeWorkspace: {
      content: [
        { id: "board-1", type: "board", name: "Production" },
        { id: "board-2", type: "board", name: "CGI" },
      ],
    },
  }),
}));

import { MirrorSettingsModal } from "@/features/boards/engine/components/mirror-settings-modal";
import type { ColumnDefinition } from "@/features/boards/engine/types";

function col(id: string, type: string, settings: Record<string, unknown> = {}): ColumnDefinition {
  return {
    id,
    boardId: "current",
    key: id,
    label: id,
    type: type as ColumnDefinition["type"],
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
  };
}

describe("MirrorSettingsModal", () => {
  beforeEach(() => {
    columnData.clear();
    boardNames.clear();
  });

  it("allows selecting multiple columns from connected boards (multi-select)", async () => {
    columnData.set("board-1", [
      { id: "c-status-1", label: "Status", type: "status", hidden: false, sort_order: 0 },
      { id: "c-number-1", label: "Budget", type: "number", hidden: false, sort_order: 1 },
    ]);
    columnData.set("board-2", [
      { id: "c-status-2", label: "Status", type: "status", hidden: false, sort_order: 0 },
      { id: "c-date-2", label: "Due", type: "date", hidden: false, sort_order: 1 },
    ]);
    boardNames.set("board-1", "Production");
    boardNames.set("board-2", "CGI");

    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const columns = [
      col("source", "connected_board", { connected_board_ids: ["board-1", "board-2"] }),
    ];

    render(
      <MirrorSettingsModal
        open
        onOpenChange={() => {}}
        boardId="current"
        columns={columns}
        sourceConnectColumnId="source"
        onConfirm={onConfirm}
      />,
    );

    const statusButtons = await screen.findAllByRole("button", { name: /Status/ }, { timeout: 3000 });
    await user.click(statusButtons[0]);

    await user.click(screen.getByRole("button", { name: /Add mirror column/i }));

    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        source_connect_column_id: "source",
        mirrored_columns: expect.arrayContaining([
          expect.objectContaining({ column_id: "c-status-1" }),
        ]),
      }),
    );
  });

  it("pre-fills the source Connect Boards column (prompted flow)", async () => {
    columnData.set("board-1", [
      { id: "c-status-1", label: "Status", type: "status", hidden: false, sort_order: 0 },
    ]);
    boardNames.set("board-1", "Production");

    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const columns = [
      col("source", "connected_board", { connected_board_ids: ["board-1"] }),
    ];

    render(
      <MirrorSettingsModal
        open
        onOpenChange={() => {}}
        boardId="current"
        columns={columns}
        sourceConnectColumnId="source"
        onConfirm={onConfirm}
      />,
    );

    const statusButtons = await screen.findAllByRole("button", { name: /Status/ }, { timeout: 3000 });
    await user.click(statusButtons[0]);

    await user.click(screen.getByRole("button", { name: /Add mirror column/i }));

    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        source_connect_column_id: "source",
        mirrored_columns: expect.arrayContaining([
          expect.objectContaining({ column_id: "c-status-1" }),
        ]),
      }),
    );
  });
});
