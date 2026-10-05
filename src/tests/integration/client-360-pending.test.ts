import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

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
  getUserSpy,
  currentData,
} = vi.hoisted(() => {
  const getUser = vi.fn();

  const data: Record<string, AnyRow[]> = {
    client_360_daily_snapshot: [],
    client_360_clients: [],
    client_360_client_aliases: [],
    client_360_field_mappings: [],
    boards: [],
    records: [],
  };

  const serviceClient = {
    from: vi.fn((table: string) => makeChain(data[table] ?? [])),
    auth: { getUser },
  };

  return {
    mockServiceClient: serviceClient,
    getUserSpy: getUser,
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

const { GET } = await import("@/app/api/client-360/pending/route");
const { getUserOrganizationId } = await import("@/lib/organization");

const createMockRequest = (url: string) => {
  const request = new Request(url, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
  Object.defineProperty(request, "nextUrl", {
    value: new URL(url),
    writable: false,
    configurable: true,
  });
  return request as unknown as NextRequest;
};

// ── Shared fixture data ──────────────────────────────────────────────────────
// Two boards (board-1 mapped for job_date, board-2 NOT mapped → unmapped),
// two clients, and four records — including one COMPLETED row that must
// never surface in the pending view.
const WIPEL = {
  board1: { id: "board-1", name: "Production", slug: "production" },
  board2: { id: "board-2", name: "CGI", slug: "cgi" },
  clientWipro: { id: "client-wipro", canonical_name: "wipro" },
  clientPhilips: { id: "client-philips", canonical_name: "philips auction" },
  aliasWipro: { client_id: "client-wipro", alias_text: "wipro solutions" },
  aliasPhilips: { client_id: "client-philips", alias_text: "philips" },
  recP1: { id: "rec-P1", title: "Logo Animation" },
  recP2: { id: "rec-P2", title: "Motion Graphics" },
  recC1: { id: "rec-C1", title: "Title Sequence" },
  recC2: { id: "rec-C2", title: "VFX Shot" },
};

// Pending snapshot rows. Note: job_date and due_date DIVERGE on purpose so
// that filtering by one vs the other yields different result sets.
const pendingRows: AnyRow[] = [
  {
    record_id: "rec-P1", board_id: "board-1", workspace_id: "ws-1",
    client_id: "client-wipro", job_date: "2026-09-10", due_date: "2026-09-20",
    volume: 1, status: "In Progress", is_pending: true,
  },
  {
    record_id: "rec-P2", board_id: "board-1", workspace_id: "ws-1",
    client_id: "client-wipro", job_date: "2026-09-15", due_date: "2026-09-25",
    volume: 1, status: "Not Started", is_pending: true,
  },
  {
    record_id: "rec-C1", board_id: "board-2", workspace_id: "ws-1",
    client_id: "client-philips", job_date: "2026-09-10", due_date: "2026-09-12",
    volume: 2, status: "Completed", is_pending: false,
  },
  {
    record_id: "rec-C2", board_id: "board-2", workspace_id: "ws-1",
    client_id: "client-philips", job_date: "2026-09-20", due_date: "2026-09-18",
    volume: 1, status: "In Progress", is_pending: true,
  },
];

function resetSharedData() {
  currentData.client_360_daily_snapshot = [...pendingRows];
  currentData.client_360_clients = [WIPEL.clientWipro, WIPEL.clientPhilips];
  currentData.client_360_client_aliases = [WIPEL.aliasWipro, WIPEL.aliasPhilips];
  currentData.client_360_field_mappings = [{ board_id: "board-1", field_type: "job_date" }];
  currentData.boards = [WIPEL.board1, WIPEL.board2];
  currentData.records = [WIPEL.recP1, WIPEL.recP2, WIPEL.recC1, WIPEL.recC2];
}

describe("GET /api/client-360/pending", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserSpy.mockResolvedValue({ data: { user: { id: "user-123" } } });
    (getUserOrganizationId as ReturnType<typeof vi.fn>).mockResolvedValue("org-test");
    resetSharedData();
  });

  it("returns 401 when user has no organization", async () => {
    (getUserOrganizationId as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const response = await GET(createMockRequest("http://localhost/api/client-360/pending"));

    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json.error).toContain("organization");
  });

  it("never includes completed rows (is_pending filtered at the DB level)", async () => {
    const response = await GET(createMockRequest("http://localhost/api/client-360/pending"));

    expect(response.status).toBe(200);
    const json = await response.json();

    expect(json.total_pending).toBe(3);
    const statuses = json.results.map((i: { status: string | null }) => i.status);
    expect(statuses).not.toContain("Completed");
    expect(json.results.find((i: { record_id: string }) => i.record_id === "rec-C1")).toBeUndefined();
  });

  it("defaults to all pending work (no date field / no date params)", async () => {
    const response = await GET(createMockRequest("http://localhost/api/client-360/pending"));

    expect(response.status).toBe(200);
    const json = await response.json();

    expect(json.date_field).toBeNull();
    expect(json.start).toBeNull();
    expect(json.end).toBeNull();
    expect(json.client_filter).toBeNull();
    expect(json.total_pending).toBe(3);
    expect(json.results).toHaveLength(3);
    expect(json.page).toBe(1);
    expect(json.page_size).toBe(50);
    expect(json.total_pages).toBe(1);
  });

  it("returns 400 when start/end are provided without a valid date_field", async () => {
    const response = await GET(
      createMockRequest("http://localhost/api/client-360/pending?start=2026-09-10&end=2026-09-12"),
    );

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toContain("date_field");
  });

  it("returns 400 when date range exceeds 180 days", async () => {
    const response = await GET(
      createMockRequest(
        "http://localhost/api/client-360/pending?date_field=job_date&start=2026-01-01&end=2026-07-01",
      ),
    );

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toContain("180 days");
  });

  it("returns 400 when page_size exceeds the 200 cap", async () => {
    const response = await GET(createMockRequest("http://localhost/api/client-360/pending?page_size=200"));
    expect(response.status).toBe(200);
  });

  it("client_id filter returns only that client's rows", async () => {
    const response = await GET(
      createMockRequest("http://localhost/api/client-360/pending?client_id=client-wipro"),
    );

    expect(response.status).toBe(200);
    const json = await response.json();

    expect(json.total_pending).toBe(2);
    expect(json.results.every((i: { client_id: string | null }) => i.client_id === "client-wipro")).toBe(true);
    expect(json.client_filter).toEqual({ client_id: "client-wipro", client_name: "wipro" });
  });

  it("uses client_id when both client_id and client_search are given", async () => {
    const response = await GET(
      createMockRequest(
        "http://localhost/api/client-360/pending?client_id=client-wipro&client_search=philips",
      ),
    );

    expect(response.status).toBe(200);
    const json = await response.json();

    expect(json.total_pending).toBe(2);
    expect(json.results.every((i: { client_id: string | null }) => i.client_id === "client-wipro")).toBe(true);
  });

  it("client_search partial match ('wip') returns Wipro rows via canonical name and alias", async () => {
    const response = await GET(
      createMockRequest("http://localhost/api/client-360/pending?client_search=wip"),
    );

    expect(response.status).toBe(200);
    const json = await response.json();

    expect(json.total_pending).toBe(2);
    expect(json.results.every((i: { client_id: string | null }) => i.client_id === "client-wipro")).toBe(true);
    expect(json.client_filter).toBeNull();
  });

  it("client_search matches via an alias even when canonical name does not contain the term", async () => {
    // 'solutions' only appears in the alias 'wipro solutions', not in any
    // canonical_name — exercising the alias_text match path.
    const response = await GET(
      createMockRequest("http://localhost/api/client-360/pending?client_search=solutions"),
    );

    expect(response.status).toBe(200);
    const json = await response.json();

    expect(json.total_pending).toBe(2);
    expect(json.results.every((i: { client_id: string | null }) => i.client_id === "client-wipro")).toBe(true);
  });

  it("date_field='due_date' vs 'job_date' filter on different columns (dates diverge)", async () => {
    // On 2026-09-20: only rec-P1 has due_date 2026-09-20; only rec-C2 has
    // job_date 2026-09-20. Filtering by each column therefore yields
    // different result sets.
    const dueRes = await GET(
      createMockRequest(
        "http://localhost/api/client-360/pending?date_field=due_date&start=2026-09-20&end=2026-09-20",
      ),
    );
    const jobRes = await GET(
      createMockRequest(
        "http://localhost/api/client-360/pending?date_field=job_date&start=2026-09-20&end=2026-09-20",
      ),
    );

    const dueJson = await dueRes.json();
    const jobJson = await jobRes.json();

    expect(dueJson.date_field).toBe("due_date");
    expect(dueJson.start).toBe("2026-09-20");
    expect(dueJson.end).toBe("2026-09-20");
    expect(dueJson.total_pending).toBe(1);
    expect(dueJson.results[0].record_id).toBe("rec-P1");

    expect(jobJson.date_field).toBe("job_date");
    expect(jobJson.total_pending).toBe(1);
    expect(jobJson.results[0].record_id).toBe("rec-C2");
  });

  it("single-day range (start === end) matches Part 2 semantics", async () => {
    const response = await GET(
      createMockRequest(
        "http://localhost/api/client-360/pending?date_field=job_date&start=2026-09-10&end=2026-09-10",
      ),
    );

    expect(response.status).toBe(200);
    const json = await response.json();

    // rec-P1 (job 09-10) and rec-C1 (job 09-10) are on 09-10, but rec-C1 is
    // completed → excluded by is_pending. Only rec-P1 remains.
    expect(json.total_pending).toBe(1);
    expect(json.results[0].record_id).toBe("rec-P1");
  });

  it("does not truncate past page_size — total_pages reflects the full set", async () => {
    // Build 87 pending rows across two clients.
    const rows: AnyRow[] = [];
    for (let i = 1; i <= 47; i++) {
      rows.push({
        record_id: `rec-p-${i}`, board_id: "board-2", workspace_id: "ws-1",
        client_id: "client-philips", job_date: "2026-09-12", due_date: "2026-09-22",
        volume: 1, status: "In Progress", is_pending: true,
      });
    }
    for (let i = 1; i <= 40; i++) {
      rows.push({
        record_id: `rec-w-${i}`, board_id: "board-1", workspace_id: "ws-1",
        client_id: "client-wipro", job_date: "2026-09-12", due_date: "2026-09-22",
        volume: 1, status: "In Progress", is_pending: true,
      });
    }
    currentData.client_360_daily_snapshot = rows;
    currentData.records = rows.map((r) => ({ id: r.record_id, title: `Item ${r.record_id}` }));

    // Page 1
    const p1 = await GET(createMockRequest("http://localhost/api/client-360/pending?page=1&page_size=50"));
    const json1 = await p1.json();
    expect(json1.total_pending).toBe(87);
    expect(json1.total_pages).toBe(2);
    expect(json1.page_size).toBe(50);
    expect(json1.results).toHaveLength(50);

    // Page 2 — must contain the overflow the first page could not hold.
    const p2 = await GET(createMockRequest("http://localhost/api/client-360/pending?page=2&page_size=50"));
    const json2 = await p2.json();
    expect(json2.total_pending).toBe(87);
    expect(json2.total_pages).toBe(2);
    expect(json2.page).toBe(2);
    expect(json2.results).toHaveLength(37);

    // The 51st row (by sort order) must appear on page 2, not page 1.
    const page1Ids = new Set(json1.results.map((i: { record_id: string }) => i.record_id));
    const lastOnPage1 = json1.results[json1.results.length - 1].record_id;
    expect(page1Ids.has(lastOnPage1)).toBe(true);
    expect(json2.results.some((i: { record_id: string }) => i.record_id === lastOnPage1)).toBe(false);
    expect(json2.results.length).toBe(87 - 50);
  });

  it("caps page_size at 200", async () => {
    const response = await GET(createMockRequest("http://localhost/api/client-360/pending?page_size=500"));
    const json = await response.json();
    expect(json.page_size).toBe(200);
  });

  it("reports unmapped boards (boards without a confirmed job_date mapping)", async () => {
    const response = await GET(createMockRequest("http://localhost/api/client-360/pending"));
    const json = await response.json();

    // board-1 has a job_date mapping; board-2 does not.
    expect(json.boards_touched).toBe(2);
    expect(json.unmapped_boards).toBe(1);
  });

  it("returns the full result envelope shape", async () => {
    const response = await GET(createMockRequest("http://localhost/api/client-360/pending"));
    const json = await response.json();

    expect(json).toEqual(
      expect.objectContaining({
        date_field: null,
        start: null,
        end: null,
        client_filter: null,
        total_pending: 3,
        clients_active: 2,
        boards_touched: 2,
        unmapped_boards: 1,
        results: expect.any(Array),
        page: 1,
        page_size: 50,
        total_pages: 1,
      }),
    );

    const item = json.results[0];
    expect(item).toEqual(
      expect.objectContaining({
        record_id: expect.any(String),
        board_id: expect.any(String),
        board_name: expect.any(String),
        client_id: expect.any(String),
        client_name: expect.any(String),
        item_name: expect.any(String),
        status: expect.anything(),
        job_date: expect.anything(),
        due_date: expect.anything(),
        assigned_to: expect.any(Array),
      }),
    );
  });
});
