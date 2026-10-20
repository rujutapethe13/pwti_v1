import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("next/headers", () => ({
  cookies: () => ({
    getAll: () => [],
    setAll: () => {},
  }),
}));

type Row = Record<string, unknown>;

interface Filter {
  col: string;
  op: "eq" | "is" | "neq" | "in";
  val: unknown;
}

const {
  mockServiceClient,
  currentData,
  recordedFilters,
} = vi.hoisted(() => {
  const data: Record<string, Row[]> = {
    boards: [],
    workspaces: [],
    columns: [],
    records: [],
    cell_values: [],
    groups: [],
  };

  const filters: Array<{ table: string; filters: Array<{ col: string; op: string; val: unknown }> }> = [];

  function buildChain(table: string) {
    const local: Filter[] = [];

    const apply = (): Row[] => {
      let rows = data[table] ?? [];
      for (const f of local) {
        if (f.op === "eq") rows = rows.filter((r) => r[f.col] === f.val);
        else if (f.op === "is") rows = rows.filter((r) => r[f.col] == null);
        else if (f.op === "neq") rows = rows.filter((r) => r[f.col] !== f.val);
        else if (f.op === "in") {
          const arr = Array.isArray(f.val) ? f.val : [f.val];
          rows = rows.filter((r) => arr.includes(r[f.col]));
        }
      }
      return rows;
    };

    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (col: string, val: unknown) => {
        local.push({ col, op: "eq", val });
        return chain;
      },
      is: (col: string, val: unknown) => {
        local.push({ col, op: "is", val });
        return chain;
      },
      neq: (col: string, val: unknown) => {
        local.push({ col, op: "neq", val });
        return chain;
      },
      in: (col: string, val: unknown) => {
        local.push({ col, op: "in", val });
        return chain;
      },
      order: () => chain,
      limit: () => chain,
      range: () => chain,
      maybeSingle: () => Promise.resolve({ data: apply()[0] ?? null, error: null }),
      single: () => Promise.resolve({ data: apply()[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => void) => {
        filters.push({
          table,
          filters: local.map((f) => ({ col: f.col, op: f.op, val: f.val })),
        });
        resolve({ data: apply(), error: null });
      },
    };

    return chain;
  }

  const serviceClient = {
    from: vi.fn((table: string) => buildChain(table)),
    auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
    rpc: vi.fn(async () => ({ data: true, error: null })),
  };

  return { mockServiceClient: serviceClient, currentData: data, recordedFilters: filters };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => mockServiceClient,
  createServiceClient: () => mockServiceClient,
}));

const { loadColumnsByBoard } = await import("@/features/boards/engine/repository");
const { buildUnifiedDataset } = await import(
  "@/features/analytics/aggregation/aggregation-service"
);
const { searchClient360 } = await import("@/features/client-360/search-service");

const SHARED_COLUMN: Row = {
  id: "col-shared",
  board_id: "board-1",
  group_id: null,
  key: "client",
  label: "Client",
  type: "text",
  settings: {},
  sort_order: 0,
  deleted_at: null,
};

const CUSTOM_COLUMN: Row = {
  id: "col-custom",
  board_id: "board-1",
  group_id: "group-1",
  key: "client",
  label: "Client",
  type: "text",
  settings: {},
  sort_order: 0,
  deleted_at: null,
};

describe("Shared-scope column readers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordedFilters.length = 0;
    currentData.columns = [SHARED_COLUMN, CUSTOM_COLUMN];
    currentData.boards = [
      {
        id: "board-1",
        name: "Board",
        slug: "board",
        workspace_id: "ws-1",
        status: "active",
      },
    ];
    currentData.workspaces = [{ id: "ws-1", name: "Workspace" }];
    currentData.records = [
      {
        id: "rec-1",
        board_id: "board-1",
        title: "Job #1",
        status: "active",
        group_id: null,
        created_at: "2026-09-01T00:00:00Z",
        updated_at: "2026-09-01T00:00:00Z",
      },
    ];
    currentData.cell_values = [
      {
        record_id: "rec-1",
        column_id: "col-shared",
        board_id: "board-1",
        value: "Acme Corp",
        value_text: "Acme Corp",
      },
    ];
    currentData.groups = [];
  });

  it("repository.loadColumnsByBoard returns only shared columns", async () => {
    const columns = await loadColumnsByBoard("board-1");
    expect(columns.map((c) => c.id)).toEqual(["col-shared"]);
  });

  it("analytics aggregation only sees shared columns", async () => {
    const dataset = await buildUnifiedDataset("ws-1");
    const taxonomy = dataset.boards[0]?.taxonomy;
    const usedColumnIds = Object.values(taxonomy ?? {}).filter(
      (v) => typeof v === "string",
    ) as string[];
    expect(usedColumnIds).not.toContain("col-custom");
  });

  it("client-360 search only matches on shared columns", async () => {
    const result = await searchClient360("Acme", { page: 1, pageSize: 10 });
    expect(result.matches.length).toBeGreaterThan(0);
    const columnIds = recordedFilters
      .filter((f) => f.table === "columns")
      .flatMap((f) => f.filters.map((x) => `${x.col}:${x.op}`));
    expect(columnIds).toContain("group_id:is");
  });
});
