import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => {
    throw new Error("service client should not be used when a client is passed");
  },
}));

import { ColumnRepository } from "@/features/boards/engine/repository/column-repository";

type Row = Record<string, unknown>;

function makeClient(rows: Row[]) {
  const buildChain = () => {
    const filters: Array<{ col: string; op: "eq" | "is"; val: unknown }> = [];

    const apply = (): Row[] =>
      rows.filter((r) =>
        filters.every((f) =>
          f.op === "eq" ? r[f.col] === f.val : r[f.col] == null,
        ),
      );

    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (col: string, val: unknown) => {
        filters.push({ col, op: "eq", val });
        return chain;
      },
      is: (col: string, val: unknown) => {
        filters.push({ col, op: "is", val });
        return chain;
      },
      order: () => chain,
      then: (resolve: (v: unknown) => void) =>
        resolve({ data: apply(), error: null }),
    };

    return chain;
  };

  return {
    client: { from: () => buildChain() } as never,
  };
}

const BASE_ROWS: Row[] = [
  {
    id: "col-shared",
    board_id: "board-1",
    group_id: null,
    key: "name",
    label: "Name",
    type: "text",
    sort_order: 0,
    deleted_at: null,
  },
  {
    id: "col-custom-a",
    board_id: "board-1",
    group_id: "group-1",
    key: "name",
    label: "Name",
    type: "text",
    sort_order: 0,
    deleted_at: null,
  },
  {
    id: "col-custom-b",
    board_id: "board-1",
    group_id: "group-2",
    key: "name",
    label: "Name",
    type: "text",
    sort_order: 0,
    deleted_at: null,
  },
];

describe("ColumnRepository scope", () => {
  it("defaults to the shared scope and excludes custom-group columns", async () => {
    const { client } = makeClient(BASE_ROWS);
    const repo = new ColumnRepository();

    const result = await repo.findByBoard("board-1", { client });

    expect(result.error).toBeNull();
    expect(result.data?.map((c) => c.id)).toEqual(["col-shared"]);
  });

  it("returns only the requested group's columns", async () => {
    const { client } = makeClient(BASE_ROWS);
    const repo = new ColumnRepository();

    const result = await repo.listGroupColumns("board-1", "group-1", { client });

    expect(result.data?.map((c) => c.id)).toEqual(["col-custom-a"]);
  });

  it("allows the same label in a shared column and a custom-group column", async () => {
    const { client } = makeClient(BASE_ROWS);
    const repo = new ColumnRepository();

    const shared = await repo.findByBoard("board-1", { client });
    const custom = await repo.listGroupColumns("board-1", "group-1", { client });

    expect(shared.data?.[0]?.label).toBe("Name");
    expect(custom.data?.[0]?.label).toBe("Name");
    expect(shared.data?.[0]?.id).not.toBe(custom.data?.[0]?.id);
  });
});
