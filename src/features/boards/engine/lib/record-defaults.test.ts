import { describe, expect, it } from "vitest";
import { buildInitialCellValues } from "./record-defaults";
import type { ColumnDefinition } from "../types";

function column(id: string, type: ColumnDefinition["type"], defaultValue: ColumnDefinition["defaultValue"]): ColumnDefinition {
  return {
    id,
    boardId: "board-1",
    key: id,
    label: id,
    type,
    required: false,
    hidden: false,
    frozen: false,
    defaultValue,
    settings: {},
    permissions: { view: [], edit: [], configure: [] },
    validation: [],
    version: 1,
    order: 0,
    createdAt: "",
    updatedAt: "",
  };
}

describe("buildInitialCellValues", () => {
  it("uses valid empty values and excludes derived columns", () => {
    expect(buildInitialCellValues([
      column("connect", "connected_board", null),
      column("mirror", "mirror", null),
      column("status", "status", "null"),
      column("date", "date", undefined as never),
    ])).toEqual({
      connect: { linked_item_ids: [] },
      status: "",
      date: null,
    });
  });
});
