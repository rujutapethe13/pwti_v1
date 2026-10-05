import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("next/headers", () => ({
  cookies: () => ({
    getAll: () => [],
    setAll: () => {},
  }),
}));

type AnyRow = Record<string, unknown>;

interface Chainable {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  neq: ReturnType<typeof vi.fn>;
  gte: ReturnType<typeof vi.fn>;
  lte: ReturnType<typeof vi.fn>;
  ilike: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  then: (resolve: (value: unknown) => void, reject?: (reason: unknown) => void) => void;
}

function makeChain(baseRows: AnyRow[]): Chainable {
  const recorded: { col: string; op: string; val: unknown }[] = [];

  const applyFilters = (rows: AnyRow[]): AnyRow[] => {
    let data = rows;
    for (const f of recorded) {
      if (f.op === "eq") {
        if (data.length === 0 || data[0].hasOwnProperty(f.col)) {
          data = data.filter((r) => r[f.col] === f.val);
        }
      } else if (f.op === "neq") {
        data = data.filter((r) => r[f.col] !== f.val);
      } else if (f.op === "gte") {
        data = data.filter((r) => r[f.col] != null && String(r[f.col]) >= String(f.val));
      } else if (f.op === "lte") {
        data = data.filter((r) => r[f.col] != null && String(r[f.col]) <= String(f.val));
      } else if (f.op === "ilike") {
        const needle = String(f.val).replace(/%/g, "").toLowerCase();
        data = data.filter((r) => String(r[f.col] ?? "").toLowerCase().includes(needle));
      } else if (f.op === "in") {
        const arr = Array.isArray(f.val) ? f.val : [f.val];
        data = data.filter((r) => arr.includes(r[f.col]));
      }
    }
    return data;
  };

  const resolve = () => applyFilters(baseRows);

  const chain: AnyRow & Chainable = {
    select: vi.fn(() => chain),
    eq: vi.fn((col: string, val: unknown) => {
      recorded.push({ col, op: "eq", val });
      return chain;
    }),
    neq: vi.fn((col: string, val: unknown) => {
      recorded.push({ col, op: "neq", val });
      return chain;
    }),
    gte: vi.fn((col: string, val: unknown) => {
      recorded.push({ col, op: "gte", val });
      return chain;
    }),
    lte: vi.fn((col: string, val: unknown) => {
      recorded.push({ col, op: "lte", val });
      return chain;
    }),
    ilike: vi.fn((col: string, val: unknown) => {
      recorded.push({ col, op: "ilike", val });
      return chain;
    }),
    in: vi.fn((col: string, val: unknown) => {
      recorded.push({ col, op: "in", val });
      return chain;
    }),
    order: vi.fn(() => chain),
    maybeSingle: vi.fn(() => Promise.resolve({ data: resolve()[0] ?? null, error: null })),
    then: (resolveFn: (value: unknown) => void, rejectFn?: (reason: unknown) => void) => {
      try {
        resolveFn({ data: resolve(), error: null });
      } catch (e) {
        if (rejectFn) rejectFn(e);
      }
    },
  };

  return chain;
}

const {
  mockServiceClient,
  currentData,
} = vi.hoisted(() => {
  const data: Record<string, AnyRow[]> = {
    boards: [],
    workspaces: [],
    columns: [],
    records: [],
    cell_values: [],
    groups: [],
  };

  const serviceClient = {
    from: vi.fn((table: string) => makeChain(data[table] ?? [])),
    auth: { getUser: vi.fn() },
  };

  return {
    mockServiceClient: serviceClient,
    currentData: data,
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => mockServiceClient,
  createServiceClient: () => mockServiceClient,
}));

vi.mock("@/lib/organization", () => ({
  getUserOrganizationId: vi.fn(),
}));

const { searchClient360 } = await import("@/features/client-360/search-service");

describe("Client 360 search — dropdown option ID resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentData.boards = [
      { id: "board-august", name: "August", slug: "august", workspace_id: "ws-1", status: "active" },
    ];
    currentData.workspaces = [
      { id: "ws-1", name: "Content" },
    ];
    currentData.columns = [
      {
        id: "col-client",
        board_id: "board-august",
        label: "Client",
        type: "dropdown",
        settings: { options: [{ id: "opt-welspun", label: "Welspun" }] },
        sort_order: 0,
      },
      {
        id: "col-client-text",
        board_id: "board-august",
        label: "Client Name",
        type: "text",
        settings: {},
        sort_order: 1,
      },
    ];
    currentData.records = [
      {
        id: "rec-1",
        board_id: "board-august",
        title: "Job #123",
        status: "active",
        group_id: null,
        created_at: "2026-09-01T00:00:00Z",
        updated_at: "2026-09-01T00:00:00Z",
      },
      {
        id: "rec-2",
        board_id: "board-august",
        title: "Job #456",
        status: "active",
        group_id: null,
        created_at: "2026-09-01T00:00:00Z",
        updated_at: "2026-09-01T00:00:00Z",
      },
    ];
    currentData.cell_values = [
      {
        record_id: "rec-1",
        column_id: "col-client",
        board_id: "board-august",
        value: "opt-welspun",
        value_text: "opt-welspun",
      },
      {
        record_id: "rec-2",
        column_id: "col-client-text",
        board_id: "board-august",
        value: "Acme Corp",
        value_text: "Acme Corp",
      },
    ];
    currentData.groups = [];
  });

  it("finds a client whose name is stored as a dropdown option ID", async () => {
    const result = await searchClient360("Welspun", { page: 1, pageSize: 10 });

    expect(result.matches.length).toBeGreaterThan(0);
    const match = result.matches[0];
    expect(match.clientName).toBe("Welspun");
    expect(match.recordId).toBe("rec-1");
    expect(match.boardName).toBe("August");
  });

  it("finds a client whose name is stored as a text column value (regression)", async () => {
    const result = await searchClient360("acme", { page: 1, pageSize: 10 });

    expect(result.matches.length).toBeGreaterThan(0);
    const match = result.matches.find((m) => m.clientName === "Acme Corp");
    expect(match).toBeDefined();
    expect(match?.recordId).toBe("rec-2");
  });

  it("is case-insensitive for dropdown option labels", async () => {
    const result = await searchClient360("WeLsPuN", { page: 1, pageSize: 10 });

    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.matches[0].clientName).toBe("Welspun");
  });
});
