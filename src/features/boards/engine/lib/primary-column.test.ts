import { describe, expect, it } from "vitest";
import { getPrimaryColumn, setPrimaryColumn } from "./primary-column";
import type { ColumnDefinition } from "../types";

const column = (id: string, type: ColumnDefinition["type"], order: number, isPrimary = false): ColumnDefinition => ({
  id, boardId: "board", key: id, label: id, type, required: false, hidden: false,
  frozen: false, isPrimary, pinned: false, defaultValue: null, settings: {},
  permissions: { view: [], edit: [], configure: [] }, validation: [], version: 1,
  order, createdAt: "", updatedAt: "",
});

describe("primary column", () => {
  it("resolves identity independently of order", () => {
    const columns = [column("status", "status", 0), column("name", "text", 1, true)];
    expect(getPrimaryColumn(columns)?.id).toBe("name");
  });

  it("promotes a text-compatible column and demotes the previous primary", () => {
    const next = setPrimaryColumn([
      column("name", "text", 0, true),
      column("company", "text", 1),
    ], "company");
    expect(next.find((item) => item.id === "name")?.isPrimary).toBe(false);
    expect(next.find((item) => item.id === "company")?.isPrimary).toBe(true);
  });
});
