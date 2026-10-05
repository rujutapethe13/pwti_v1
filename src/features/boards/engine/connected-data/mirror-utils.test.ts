import { describe, expect, it } from "vitest";
import {
  computeMirrorableColumns,
  getConnectBoardColumns,
  getConnectedBoardIds,
  isMirrorableSourceColumn,
  BLOCKED_MIRROR_SOURCE_TYPES,
  type ConnectedBoardColumns,
  type MirrorableColumn,
} from "@/features/boards/engine/connected-data/mirror-utils";
import type { ColumnDefinition } from "@/features/boards/engine/types";

function col(id: string, type: string, label = id): ColumnDefinition {
  return {
    id,
    boardId: "b",
    key: id,
    label,
    type: type as ColumnDefinition["type"],
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
  };
}

function mirrorable(id: string, type: string, label = id, key?: string): MirrorableColumn {
  return { id, label, type, key };
}

describe("mirror-utils: getConnectBoardColumns", () => {
  it("returns only connected_board columns", () => {
    const columns = [col("a", "text"), col("b", "connected_board"), col("c", "mirror")];
    const result = getConnectBoardColumns(columns);
    expect(result.map((c) => c.id)).toEqual(["b"]);
  });

  it("returns empty when there are no connected_board columns", () => {
    expect(getConnectBoardColumns([col("a", "text")])).toEqual([]);
  });
});

describe("mirror-utils: getConnectedBoardIds", () => {
  it("reads connected_board_ids from settings", () => {
    const c = col("a", "connected_board");
    c.settings = { connected_board_ids: ["board-1", "board-2"] };
    expect(getConnectedBoardIds(c)).toEqual(["board-1", "board-2"]);
  });

  it("returns empty array when source is undefined", () => {
    expect(getConnectedBoardIds(undefined)).toEqual([]);
  });

  it("returns empty array when settings lack connected_board_ids", () => {
    expect(getConnectedBoardIds(col("a", "connected_board"))).toEqual([]);
  });
});

describe("mirror-utils: computeMirrorableColumns (cross-board filter)", () => {
  it("returns one option per type common to ALL connected boards", () => {
    const boards: ConnectedBoardColumns[] = [
      {
        boardId: "board-1",
        columns: [
          mirrorable("c1", "status", "Status"),
          mirrorable("c2", "number", "Budget"),
          mirrorable("c3", "text", "Notes"),
        ],
      },
      {
        boardId: "board-2",
        columns: [
          mirrorable("c4", "status", "Status"),
          mirrorable("c5", "number", "Budget"),
        ],
      },
    ];
    const result = computeMirrorableColumns(boards);
    // "text" only exists on board-1, so it must be filtered out.
    expect(result.map((c) => c.type).sort()).toEqual(["number", "status"]);
  });

  it("filters out a type that exists on only some boards", () => {
    const boards: ConnectedBoardColumns[] = [
      {
        boardId: "board-1",
        columns: [mirrorable("c1", "status", "Status"), mirrorable("c2", "date", "Due")],
      },
      {
        boardId: "board-2",
        columns: [mirrorable("c3", "status", "Status")],
      },
    ];
    const result = computeMirrorableColumns(boards);
    expect(result.map((c) => c.type)).toEqual(["status"]);
  });

  it("returns empty when there are no connected boards", () => {
    expect(computeMirrorableColumns([])).toEqual([]);
  });

  it("returns empty when no type is shared across all boards", () => {
    const boards: ConnectedBoardColumns[] = [
      { boardId: "b1", columns: [mirrorable("c1", "status", "Status")] },
      { boardId: "b2", columns: [mirrorable("c2", "number", "Budget")] },
    ];
    expect(computeMirrorableColumns(boards)).toEqual([]);
  });

  it("dedupes multiple columns of the same type on a single board", () => {
    const boards: ConnectedBoardColumns[] = [
      {
        boardId: "b1",
        columns: [
          mirrorable("c1", "status", "Status"),
          mirrorable("c1b", "status", "Status 2"),
        ],
      },
      {
        boardId: "b2",
        columns: [mirrorable("c2", "status", "Status")],
      },
    ];
    const result = computeMirrorableColumns(boards);
    // Only one representative option per common type.
    expect(result).toHaveLength(1);
    expect(result[0].type).toEqual("status");
  });

  it("handles a single connected board (all its columns are mirrorable)", () => {
    const boards: ConnectedBoardColumns[] = [
      {
        boardId: "b1",
        columns: [
          mirrorable("c1", "status", "Status"),
          mirrorable("c2", "number", "Budget"),
        ],
      },
    ];
    expect(computeMirrorableColumns(boards).map((c) => c.type).sort()).toEqual([
      "number",
      "status",
    ]);
  });
});

describe("mirror-utils: isMirrorableSourceColumn (anti-circular guardrails)", () => {
  it("allows normal data columns", () => {
    expect(isMirrorableSourceColumn(mirrorable("c1", "status", "Status"))).toBe(true);
    expect(isMirrorableSourceColumn(mirrorable("c2", "number", "Budget"))).toBe(true);
    expect(isMirrorableSourceColumn(mirrorable("c3", "text", "Notes"))).toBe(true);
    expect(isMirrorableSourceColumn(mirrorable("c4", "date", "Due"))).toBe(true);
  });

  it("blocks the item Name column (structural, key = 'name')", () => {
    expect(isMirrorableSourceColumn(mirrorable("c-name", "text", "Name", "name"))).toBe(false);
  });

  it("blocks the item title column (key = 'title')", () => {
    expect(isMirrorableSourceColumn(mirrorable("c-title", "text", "Title", "title"))).toBe(false);
  });

  it("blocks other Mirror columns", () => {
    expect(isMirrorableSourceColumn(mirrorable("c-mirror", "mirror", "Other Mirror"))).toBe(false);
  });

  it("blocks Formula columns", () => {
    expect(isMirrorableSourceColumn(mirrorable("c-formula", "formula", "Total"))).toBe(false);
  });

  it("blocks Updates / activity columns", () => {
    expect(isMirrorableSourceColumn(mirrorable("c-updates", "updates", "Updates"))).toBe(false);
    expect(isMirrorableSourceColumn(mirrorable("c-activity", "activity", "Activity"))).toBe(false);
  });

  it("excludes every blocked type", () => {
    for (const type of BLOCKED_MIRROR_SOURCE_TYPES) {
      expect(isMirrorableSourceColumn(mirrorable(`c-${type}`, type, type))).toBe(false);
    }
  });
});

describe("mirror-utils: computeMirrorableColumns excludes blocked columns", () => {
  it("never returns the Name column even when it exists on every board", () => {
    const boards: ConnectedBoardColumns[] = [
      {
        boardId: "b1",
        columns: [
          mirrorable("c-name", "text", "Name", "name"),
          mirrorable("c-status", "status", "Status"),
        ],
      },
      {
        boardId: "b2",
        columns: [
          mirrorable("c-name-2", "text", "Name", "name"),
          mirrorable("c-status-2", "status", "Status"),
        ],
      },
    ];
    const result = computeMirrorableColumns(boards);
    // Name is blocked; only Status remains.
    expect(result.map((c) => c.type)).toEqual(["status"]);
  });

  it("never returns Mirror, Formula, or Updates columns", () => {
    const boards: ConnectedBoardColumns[] = [
      {
        boardId: "b1",
        columns: [
          mirrorable("c-status", "status", "Status"),
          mirrorable("c-mirror", "mirror", "Other Mirror"),
          mirrorable("c-formula", "formula", "Total"),
          mirrorable("c-updates", "updates", "Updates"),
        ],
      },
      {
        boardId: "b2",
        columns: [
          mirrorable("c-status-2", "status", "Status"),
          mirrorable("c-mirror-2", "mirror", "Other Mirror"),
          mirrorable("c-formula-2", "formula", "Total"),
          mirrorable("c-updates-2", "updates", "Updates"),
        ],
      },
    ];
    const result = computeMirrorableColumns(boards);
    expect(result.map((c) => c.type)).toEqual(["status"]);
  });

  it("returns empty when every shared column type is blocked", () => {
    const boards: ConnectedBoardColumns[] = [
      {
        boardId: "b1",
        columns: [
          mirrorable("c-name", "text", "Name", "name"),
          mirrorable("c-mirror", "mirror", "Mirror"),
        ],
      },
      {
        boardId: "b2",
        columns: [
          mirrorable("c-name-2", "text", "Name", "name"),
          mirrorable("c-mirror-2", "mirror", "Mirror"),
        ],
      },
    ];
    expect(computeMirrorableColumns(boards)).toEqual([]);
  });

  it("works across a single connected board (blocked columns still removed)", () => {
    const boards: ConnectedBoardColumns[] = [
      {
        boardId: "b1",
        columns: [
          mirrorable("c-name", "text", "Name", "name"),
          mirrorable("c-status", "status", "Status"),
          mirrorable("c-formula", "formula", "Total"),
        ],
      },
    ];
    expect(computeMirrorableColumns(boards).map((c) => c.type)).toEqual(["status"]);
  });
});
