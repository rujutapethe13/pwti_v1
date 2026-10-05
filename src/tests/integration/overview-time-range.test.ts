import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

interface QueryRecord {
  table: string;
  ops: Array<{ op: string; args: unknown[] }>;
}

const { createServiceClient, mockSnapshotRefresh, supabaseQueries } = vi.hoisted(
  () => {
    const queries: QueryRecord[] = [];

    function createServiceClient() {
      const from = (table: string) => {
        const ops: Array<{ op: string; args: unknown[] }> = [];
        const record = (op: string, args: unknown[]) => {
          ops.push({ op, args });
          return api;
        };
        const api: Record<string, unknown> = {
          select: (...args: unknown[]) => record("select", args),
          eq: (...args: unknown[]) => record("eq", args),
          in: (...args: unknown[]) => record("in", args),
          gte: (...args: unknown[]) => record("gte", args),
          lte: (...args: unknown[]) => record("lte", args),
          lt: (...args: unknown[]) => record("lt", args),
          order: (...args: unknown[]) => record("order", args),
          limit: (...args: unknown[]) => record("limit", args),
          range: (...args: unknown[]) => record("range", args),
          then: (resolve: (value: unknown) => unknown) => {
            queries.push({ table, ops });
            return Promise.resolve({ data: [], count: 0, error: null }).then(resolve);
          },
        };
        return api;
      };

      return {
        from,
        // The route narrows an "All time" window with the same bounds RPC the
        // three section services use. Returning nulls keeps the sentinel, which
        // is the non-"all" behaviour every test below asserts.
        rpc: () => Promise.resolve({ data: { earliest: null, latest: null }, error: null }),
        auth: {
          getUser: () =>
            Promise.resolve({
              data: { user: { user_metadata: { full_name: "Alex Rivera" } } },
            }),
        },
      };
    }

    return {
      createServiceClient,
      mockSnapshotRefresh: vi.fn(),
      supabaseQueries: queries,
    };
  },
);

vi.mock("@/lib/organization", () => ({
  getUserOrganizationId: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient,
}));

vi.mock("@/features/client-360/daily-activity-service", () => ({
  checkAndRefreshSnapshotIfNeeded: mockSnapshotRefresh,
}));

const { GET } = await import("@/app/api/overview/route");
const { getUserOrganizationId } = await import("@/lib/organization");

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

/** Bound filters per table, e.g. { "job_date": { gte, lte } }. */
function boundsFor(table: string, column: string) {
  return supabaseQueries
    .filter((q) => q.table === table)
    .map((q) => ({
      gte: q.ops.find((o) => o.op === "gte" && o.args[0] === column)?.args[1],
      lte: q.ops.find((o) => o.op === "lte" && o.args[0] === column)?.args[1],
    }));
}

function jobDateWindows() {
  return boundsFor("client_360_daily_snapshot", "job_date");
}

describe("GET /api/overview time range", () => {
  beforeEach(() => {
    supabaseQueries.length = 0;
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 24, 12, 0, 0));
    vi.mocked(getUserOrganizationId).mockResolvedValue("org-test");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("scopes every snapshot section to the requested window", async () => {
    const response = await GET(
      createMockRequest(
        "http://localhost/api/overview?from=2026-09-18&to=2026-09-24&range=7d",
      ),
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.range).toEqual({
      id: "7d",
      label: "Last 7 days",
      from: "2026-09-18",
      to: "2026-09-24",
      days: 7,
      granularity: "day",
    });

    // Workload is the only panel still served here. Stat cards and the volume
    // trend have their own endpoints and must not be re-derived in this payload.
    const windows = jobDateWindows();
    expect(windows).toHaveLength(1);
    expect(
      windows.every((w) => w.gte === "2026-09-18" && w.lte === "2026-09-24"),
    ).toBe(true);
    expect(json.stats).toBeUndefined();
    expect(json.weeklyVolume).toBeUndefined();
  });

  it("scopes the activity feed by created_at", async () => {
    await GET(
      createMockRequest(
        "http://localhost/api/overview?from=2026-09-18&to=2026-09-24&range=7d",
      ),
    );

    const [activityQuery] = supabaseQueries.filter((q) => q.table === "activity_logs");
    expect(activityQuery).toBeDefined();
    expect(boundsFor("activity_logs", "created_at")).toEqual([
      { gte: "2026-09-18T00:00:00.000Z", lte: "2026-09-24T23:59:59.999Z" },
    ]);
    // Still newest-first and capped.
    expect(
      activityQuery!.ops.some((o) => o.op === "order" && o.args[0] === "created_at"),
    ).toBe(true);
    expect(activityQuery!.ops.some((o) => o.op === "limit")).toBe(true);
  });

  it("widens the window and the chart granularity for a 1 year range", async () => {
    const response = await GET(
      createMockRequest(
        "http://localhost/api/overview?from=2025-09-24&to=2026-09-24&range=1y",
      ),
    );

    const json = await response.json();
    expect(json.range.days).toBe(366);
    expect(json.range.granularity).toBe("month");
    // The bucketed series itself is served by /api/overview/volume-trend.
    expect(json.weeklyVolume).toBeUndefined();

    const windows = jobDateWindows();
    expect(
      windows.every(
        (w) =>
          (w.gte === "2025-09-24" && w.lte === "2026-09-24") ||
          (w.gte === "2024-09-23" && w.lte === "2025-09-23"),
      ),
    ).toBe(true);
  });

  it("compares no prior period, because this endpoint has no trend metrics", async () => {
    await GET(
      createMockRequest(
        "http://localhost/api/overview?from=2026-09-18&to=2026-09-24&range=7d",
      ),
    );

    expect(
      jobDateWindows().filter((w) => w.gte === "2026-09-11" && w.lte === "2026-09-17"),
    ).toHaveLength(0);
  });

  it("honours the requested preset when the bounds are malformed", async () => {
    const response = await GET(
      createMockRequest(
        "http://localhost/api/overview?from=2026-09-30&to=2026-09-01&range=1y",
      ),
    );

    const json = await response.json();
    expect(json.range.id).toBe("1y");
    expect(json.range.from).toBe("2025-09-24");
    expect(json.range.to).toBe("2026-09-24");
  });

  it("falls back to the default preset when no range is requested", async () => {
    const response = await GET(
      createMockRequest("http://localhost/api/overview?from=bogus&to=bogus"),
    );

    const json = await response.json();
    expect(json.range.id).toBe("7d");
    expect(json.range.from).toBe("2026-09-18");
    expect(json.range.to).toBe("2026-09-24");
  });

  it("returns 401 without an organization", async () => {
    vi.mocked(getUserOrganizationId).mockResolvedValue(null);
    const response = await GET(
      createMockRequest(
        "http://localhost/api/overview?from=2026-09-18&to=2026-09-24",
      ),
    );
    expect(response.status).toBe(401);
  });
});
