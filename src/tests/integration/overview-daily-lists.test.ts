import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

type AnyRow = Record<string, unknown>;

interface QueryRecord {
  table: string;
  ops: Array<{ op: string; args: unknown[] }>;
}

const { createServiceClient, mockSnapshotRefresh, supabaseQueries, tables, tableErrors } =
  vi.hoisted(() => {
    const queries: QueryRecord[] = [];
    const data: Record<string, AnyRow[]> = {
      client_360_daily_snapshot: [],
      records: [],
      boards: [],
      workspaces: [],
      client_360_field_mappings: [],
    };
    const errors: Record<string, { message: string }> = {};

    function createServiceClient() {
      const from = (table: string) => {
        const ops: Array<{ op: string; args: unknown[] }> = [];
        const record = (op: string, args: unknown[]) => {
          ops.push({ op, args });
          return api;
        };

        function applyFilters(rows: AnyRow[]): AnyRow[] {
          let result = rows;
          for (const entry of ops) {
            const [col, val] = entry.args as [string, unknown];
            switch (entry.op) {
              case "eq":
                result = result.filter((r) => r[col] === val);
                break;
              case "neq":
                result = result.filter((r) => r[col] !== val);
                break;
              case "not":
                if (entry.args[1] === "is" && entry.args[2] === null) {
                  result = result.filter((r) => r[col] != null);
                } else {
                  result = result.filter((r) => r[col] !== val);
                }
                break;
              case "lt":
                result = result.filter(
                  (r) => r[col] != null && String(r[col]) < String(val),
                );
                break;
              case "lte":
                result = result.filter(
                  (r) => r[col] != null && String(r[col]) <= String(val),
                );
                break;
              case "gt":
                result = result.filter(
                  (r) => r[col] != null && String(r[col]) > String(val),
                );
                break;
              case "gte":
                result = result.filter(
                  (r) => r[col] != null && String(r[col]) >= String(val),
                );
                break;
              case "in":
                result = result.filter((r) =>
                  (val as unknown[]).includes(r[col]),
                );
                break;
              case "or": {
                // PostgREST syntax, passed as a single argument:
                // "job_date.eq.2026-09-24,due_date.eq.2026-09-24"
                const clauses = String(entry.args[0])
                  .split(",")
                  .map((clause) => clause.split("."));
                result = result.filter((r) =>
                  clauses.some(([c, , v]) => String(r[c as string]) === v),
                );
                break;
              }
              case "limit":
                result = result.slice(0, val as number);
                break;
              default:
                break;
            }
          }
          return result;
        }

        const api: Record<string, unknown> = {
          select: (...args: unknown[]) => record("select", args),
          eq: (...args: unknown[]) => record("eq", args),
          neq: (...args: unknown[]) => record("neq", args),
          not: (...args: unknown[]) => record("not", args),
          lt: (...args: unknown[]) => record("lt", args),
          lte: (...args: unknown[]) => record("lte", args),
          gt: (...args: unknown[]) => record("gt", args),
          gte: (...args: unknown[]) => record("gte", args),
          in: (...args: unknown[]) => record("in", args),
          or: (...args: unknown[]) => record("or", args),
          order: (...args: unknown[]) => record("order", args),
          limit: (...args: unknown[]) => record("limit", args),
          then: (resolve: (value: unknown) => unknown) => {
            queries.push({ table, ops });
            const error = errors[table] ?? null;
            return Promise.resolve(
              error ? { data: null, error } : { data: applyFilters(data[table] ?? []), error: null },
            ).then(resolve);
          },
        };
        return api;
      };

      return { from };
    }

    return {
      createServiceClient,
      mockSnapshotRefresh: vi.fn(),
      supabaseQueries: queries,
      tables: data,
      tableErrors: errors,
    };
  });

vi.mock("@/lib/organization", () => ({
  getUserOrganizationId: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient,
}));

vi.mock("@/features/client-360/daily-activity-service", () => ({
  checkAndRefreshSnapshotIfNeeded: mockSnapshotRefresh,
}));

const { GET } = await import("@/app/api/overview/daily-lists/route");
const { getUserOrganizationId } = await import("@/lib/organization");

const TODAY = "2026-09-24";
const HORIZON = "2026-10-01";

function createMockRequest(url: string): NextRequest {
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
}

function getPanel(panel: string, query = ""): NextRequest {
  return createMockRequest(
    `http://localhost/api/overview/daily-lists?panel=${panel}${query}`,
  );
}

function snapshotQuery() {
  const query = supabaseQueries.find(
    (q) => q.table === "client_360_daily_snapshot",
  );
  return query;
}

function opArgs(op: string, column?: string): unknown[] | undefined {
  return snapshotQuery()?.ops.find(
    (o) => o.op === op && (column === undefined || o.args[0] === column),
  )?.args;
}

function snapshotRow(overrides: AnyRow = {}): AnyRow {
  return {
    organization_id: "org-test",
    record_id: "rec-1",
    board_id: "board-1",
    workspace_id: "ws-1",
    job_date: null,
    due_date: null,
    status: "In progress",
    is_pending: true,
    ...overrides,
  };
}

beforeEach(() => {
  supabaseQueries.length = 0;
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 8, 24, 12, 0, 0));
  vi.mocked(getUserOrganizationId).mockResolvedValue("org-test");

  tables.client_360_daily_snapshot = [];
  tables.records = [];
  tables.boards = [];
  tables.workspaces = [];
  tables.client_360_field_mappings = [];
  for (const key of Object.keys(tableErrors)) delete tableErrors[key];
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/overview/daily-lists", () => {
  it("rejects an unknown panel instead of guessing one", async () => {
    const response = await GET(getPanel("yesterday"));
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toContain("today, overdue, upcoming");
  });

  it("requires a panel", async () => {
    const response = await GET(
      createMockRequest("http://localhost/api/overview/daily-lists"),
    );
    expect(response.status).toBe(400);
  });

  it("returns 401 without an organization", async () => {
    vi.mocked(getUserOrganizationId).mockResolvedValue(null);
    const response = await GET(getPanel("today"));
    expect(response.status).toBe(401);
  });

  it("fails with 500 when the snapshot query fails, rather than returning an empty list", async () => {
    tableErrors.client_360_daily_snapshot = { message: "relation does not exist" };
    const response = await GET(getPanel("overdue"));
    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error).toContain("relation does not exist");
    expect(json.items).toBeUndefined();
  });
});

describe("today's jobs", () => {
  it("queries jobs received today or due today, with no status filter", async () => {
    const response = await GET(getPanel("today"));
    expect(response.status).toBe(200);

    expect(opArgs("or")).toEqual([
      `job_date.eq.${TODAY},due_date.eq.${TODAY}`,
    ]);
    // "Received or due today" says nothing about completion, so no pending filter.
    expect(opArgs("eq", "is_pending")).toBeUndefined();
    expect(opArgs("eq", "organization_id")).toEqual(["organization_id", "org-test"]);

    const json = await response.json();
    expect(json.anchorDate).toBe(TODAY);
    expect(json.horizonDate).toBeNull();
  });

  it("includes a completed job received today", async () => {
    tables.client_360_daily_snapshot = [
      snapshotRow({ job_date: TODAY, status: "Delivered", is_pending: false }),
    ];
    tables.records = [{ id: "rec-1", title: "Autumn campaign" }];
    tables.boards = [{ id: "board-1", name: "Retouching", slug: "retouching", workspace_id: "ws-1" }];
    tables.workspaces = [{ id: "ws-1", name: "Powerweave Studio" }];

    const json = await (await GET(getPanel("today"))).json();
    expect(json.items).toHaveLength(1);
    expect(json.items[0].matched).toEqual(["job_date"]);
  });

  it("returns an empty list — not a fabricated one — when nothing matches", async () => {
    const json = await (await GET(getPanel("today"))).json();
    expect(json.items).toEqual([]);
    expect(json.truncated).toBe(false);
  });
});

describe("overdue", () => {
  it("queries due dates before today that are still pending", async () => {
    const response = await GET(getPanel("overdue"));
    expect(response.status).toBe(200);

    expect(opArgs("lt", "due_date")).toEqual(["due_date", TODAY]);
    expect(opArgs("eq", "is_pending")).toEqual(["is_pending", true]);
    expect(opArgs("not", "due_date")).toEqual(["due_date", "is", null]);
  });

  it("excludes a completed job whose due date has passed", async () => {
    tables.client_360_daily_snapshot = [
      snapshotRow({ due_date: "2026-09-01", is_pending: false, status: "Delivered" }),
    ];

    const json = await (await GET(getPanel("overdue"))).json();
    expect(json.items).toEqual([]);
  });

  it("sorts the most overdue first", async () => {
    tables.client_360_daily_snapshot = [
      snapshotRow({ record_id: "rec-late", due_date: "2026-09-20" }),
      snapshotRow({ record_id: "rec-old", due_date: "2026-08-30" }),
    ];
    tables.records = [
      { id: "rec-late", title: "Late job" },
      { id: "rec-old", title: "Old job" },
    ];
    tables.boards = [{ id: "board-1", name: "Retouching", slug: "retouching", workspace_id: "ws-1" }];
    tables.workspaces = [{ id: "ws-1", name: "Powerweave Studio" }];

    const json = await (await GET(getPanel("overdue"))).json();
    expect(json.items.map((i: { record_id: string }) => i.record_id)).toEqual([
      "rec-old",
      "rec-late",
    ]);
  });
});

describe("upcoming", () => {
  it("queries tomorrow through the 7th day ahead, still pending", async () => {
    const response = await GET(getPanel("upcoming"));
    expect(response.status).toBe(200);

    expect(opArgs("gt", "due_date")).toEqual(["due_date", TODAY]);
    expect(opArgs("lte", "due_date")).toEqual(["due_date", HORIZON]);
    expect(opArgs("eq", "is_pending")).toEqual(["is_pending", true]);

    const json = await response.json();
    expect(json.horizonDate).toBe(HORIZON);
  });

  it("drops a job due on the 8th day that the window let through", async () => {
    // The service re-checks every row against the same rule the UI documents,
    // so a loose window can never widen the list.
    tables.client_360_daily_snapshot = [snapshotRow({ due_date: "2026-10-09" })];

    const json = await (await GET(getPanel("upcoming"))).json();
    expect(json.items).toEqual([]);
  });
});

describe("list items", () => {
  beforeEach(() => {
    tables.client_360_daily_snapshot = [snapshotRow({ due_date: "2026-09-10" })];
    tables.records = [{ id: "rec-1", title: "Winter lookbook" }];
    tables.boards = [
      { organization_id: "org-test", id: "board-1", name: "Retouching", slug: "retouching", workspace_id: "ws-1" },
    ];
    tables.workspaces = [{ id: "ws-1", name: "Powerweave Studio" }];
    tables.client_360_field_mappings = [
      { organization_id: "org-test", field_type: "due_date", board_id: "board-1" },
    ];
  });

  it("carries the item name, its board, its workspace and a link back to it", async () => {
    const json = await (await GET(getPanel("overdue"))).json();
    expect(json.items[0]).toMatchObject({
      record_id: "rec-1",
      item_name: "Winter lookbook",
      board_name: "Retouching",
      workspace_name: "Powerweave Studio",
      status: "In progress",
      due_date: "2026-09-10",
      href: "/retouching",
    });
  });

  it("reports a board with no due-date field so a short list is not read as the whole truth", async () => {
    tables.boards = [
      { organization_id: "org-test", id: "board-1", name: "Retouching", slug: "retouching", workspace_id: "ws-1" },
      { organization_id: "org-test", id: "board-2", name: "CGI", slug: "cgi", workspace_id: "ws-1" },
    ];

    const json = await (await GET(getPanel("overdue"))).json();
    expect(json.boardsWithoutDueDate).toBe(1);
  });

  it("drops a snapshot row whose record no longer exists instead of linking to nothing", async () => {
    tables.records = [];

    const json = await (await GET(getPanel("overdue"))).json();
    expect(json.items).toEqual([]);
  });

  it("drops a snapshot row whose board no longer exists", async () => {
    tables.boards = [];

    const json = await (await GET(getPanel("overdue"))).json();
    expect(json.items).toEqual([]);
  });

  it("falls back to the record id when the title is blank", async () => {
    tables.records = [{ id: "rec-1", title: "   " }];

    const json = await (await GET(getPanel("overdue"))).json();
    expect(json.items[0].item_name).toBe("rec-1");
  });

  it("links by board id when the board has no slug", async () => {
    tables.boards = [{ organization_id: "org-test", id: "board-1", name: null, slug: null, workspace_id: "ws-1" }];

    const json = await (await GET(getPanel("overdue"))).json();
    expect(json.items[0].href).toBe("/board-1");
    expect(json.items[0].board_name).toBeNull();
  });

  it("flags a truncated list instead of presenting a cap as the total", async () => {
    tables.client_360_daily_snapshot = Array.from({ length: 51 }, (_, i) =>
      snapshotRow({ record_id: `rec-${i}`, due_date: "2026-09-10" }),
    );
    tables.records = Array.from({ length: 51 }, (_, i) => ({
      id: `rec-${i}`,
      title: `Job ${i}`,
    }));

    const json = await (await GET(getPanel("overdue"))).json();
    expect(json.items).toHaveLength(50);
    expect(json.truncated).toBe(true);
  });
});

describe("independence from the range selector", () => {
  it("ignores from/to/range and stays anchored to today", async () => {
    const json = await (
      await GET(getPanel("today", "&from=2020-01-01&to=2020-12-31&range=1y"))
    ).json();

    expect(json.anchorDate).toBe(TODAY);
    expect(opArgs("or")).toEqual([`job_date.eq.${TODAY},due_date.eq.${TODAY}`]);

    const upcoming = await (
      await GET(getPanel("upcoming", "&from=2020-01-01&to=2020-12-31&range=1y"))
    ).json();
    expect(upcoming.horizonDate).toBe(HORIZON);
  });

  it("refreshes the snapshot before reading it, so new jobs show up", async () => {
    await GET(getPanel("today"));
    expect(mockSnapshotRefresh).toHaveBeenCalledTimes(1);
  });
});
