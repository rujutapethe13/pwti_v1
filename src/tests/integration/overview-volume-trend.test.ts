import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

/**
 * The volume trend now groups in the database: the service calls
 * `overview_volume_trend`, which filters on the real `job_date` DATE column and
 * buckets with `date_trunc`, returning only non-empty buckets. These tests
 therefore mock the RPC rather than the snapshot table, and assert both the
 * arguments the RPC was given and the zero-filling the service still applies.
 */

interface RpcCall {
  fn: string;
  args: Record<string, unknown>;
}

interface TrendRpcResult {
  granularity?: string;
  received?: Array<{ key: string; jobs: number }>;
  completed?: Array<{ key: string; jobs: number }>;
  completed_date_available?: boolean;
  coverage?: Record<string, unknown>;
}

const {
  createServiceClient,
  mockSnapshotRefresh,
  rpcCalls,
  setTrendResult,
  setBoundsResult,
  setTrendError,
  setBoundsError,
} = vi.hoisted(() => {
  const calls: RpcCall[] = [];
  let trendResult: TrendRpcResult = {};
  let boundsResult: Record<string, unknown> = {};
  let trendError: { message: string } | null = null;
  let boundsError: { message: string } | null = null;

  function createServiceClient() {
    return {
      from: () => {
        const api: Record<string, unknown> = {
          select: () => api,
          eq: () => api,
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        };
        return api;
      },
      rpc: (fn: string, args: Record<string, unknown> = {}) => {
        calls.push({ fn, args });
        if (fn === "overview_volume_trend") {
          return Promise.resolve({ data: trendResult, error: trendError });
        }
        if (fn === "overview_data_bounds") {
          return Promise.resolve({ data: boundsResult, error: boundsError });
        }
        return Promise.resolve({ data: null, error: null });
      },
    };
  }

  return {
    createServiceClient,
    mockSnapshotRefresh: vi.fn(),
    rpcCalls: calls,
    setTrendResult: (result: TrendRpcResult) => {
      trendResult = result;
    },
    setBoundsResult: (result: Record<string, unknown>) => {
      boundsResult = result;
    },
    setTrendError: (error: { message: string } | null) => {
      trendError = error;
    },
    setBoundsError: (error: { message: string } | null) => {
      boundsError = error;
    },
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

const { GET } = await import("@/app/api/overview/volume-trend/route");
const { getUserOrganizationId } = await import("@/lib/organization");

function createMockRequest(url: string): NextRequest {
  const request = new Request(url, { method: "GET" });
  Object.defineProperty(request, "nextUrl", {
    value: new URL(url),
    writable: false,
    configurable: true,
  });
  return request as unknown as NextRequest;
}

async function load(query: string) {
  const response = await GET(createMockRequest(`http://localhost${query}`));
  return { response, json: await response.json() };
}

function trendCall(): RpcCall | undefined {
  return rpcCalls.find((c) => c.fn === "overview_volume_trend");
}

describe("GET /api/overview/volume-trend", () => {
  beforeEach(() => {
    rpcCalls.length = 0;
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 24, 12, 0, 0));
    vi.mocked(getUserOrganizationId).mockResolvedValue("org-test");
    setTrendResult({});
    setBoundsResult({});
    setTrendError(null);
    setBoundsError(null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("filters and groups in SQL over the requested window and organization", async () => {
    const { response } = await load(
      "/api/overview/volume-trend?from=2026-09-18&to=2026-09-24&range=7d",
    );

    expect(response.status).toBe(200);
    expect(trendCall()?.args).toMatchObject({
      p_organization_id: "org-test",
      p_from: "2026-09-18",
      p_to: "2026-09-24",
      p_granularity: "day",
    });
  });

  it("uses daily buckets for a 7 day range, zero-filled", async () => {
    setTrendResult({
      granularity: "day",
      received: [
        { key: "2026-09-20", jobs: 3 },
        { key: "2026-09-24", jobs: 2 },
      ],
      completed: [{ key: "2026-09-23", jobs: 2 }],
    });

    const { json } = await load(
      "/api/overview/volume-trend?from=2026-09-18&to=2026-09-24&range=7d",
    );

    expect(json.range.granularity).toBe("day");
    expect(json.range.days).toBe(7);
    expect(json.received).toHaveLength(7);
    expect(json.received.map((b: { key: string }) => b.key)).toEqual([
      "2026-09-18",
      "2026-09-19",
      "2026-09-20",
      "2026-09-21",
      "2026-09-22",
      "2026-09-23",
      "2026-09-24",
    ]);
    expect(json.received.find((b: { key: string }) => b.key === "2026-09-20").jobs).toBe(3);
    // A quiet day must still be a bucket, or the axis collapses.
    expect(json.received.find((b: { key: string }) => b.key === "2026-09-19").jobs).toBe(0);
    // The 24th was completed on the 23rd, so it lands in the 23rd's bucket.
    expect(json.completed.find((b: { key: string }) => b.key === "2026-09-23").jobs).toBe(2);
    expect(json.completed.find((b: { key: string }) => b.key === "2026-09-24").jobs).toBe(0);
  });

  it("asks SQL for weekly buckets over a 90 day range", async () => {
    const { json } = await load(
      "/api/overview/volume-trend?from=2026-06-27&to=2026-09-24&range=90d",
    );

    expect(trendCall()?.args.p_granularity).toBe("week");
    expect(json.range.granularity).toBe("week");
    // 90 days of Sundays.
    expect(json.received).toHaveLength(14);
  });

  /**
   * Regression guard. Postgres date_trunc('week', ...) returns the ISO Monday
   * while the client axis starts weeks on Sunday, so the two key spaces never
   * intersect and every weekly bucket silently rendered as zero. The SQL side
   * subtracts a day to compensate; these buckets are what it must produce.
   */
  it("lands Sunday-keyed server buckets on the client axis", async () => {
    setTrendResult({
      received: [
        { key: "2026-06-21", jobs: 7 },
        { key: "2026-06-28", jobs: 3 },
      ],
      completed: [],
    });

    const { json } = await load(
      "/api/overview/volume-trend?from=2026-06-27&to=2026-09-24&range=90d",
    );

    const byKey = Object.fromEntries(
      json.received.map((b: { key: string; jobs: number }) => [b.key, b.jobs]),
    );
    expect(byKey["2026-06-21"]).toBe(7);
    expect(byKey["2026-06-28"]).toBe(3);
    // The surrounding weeks are genuinely empty, not silently zero-filled wrong.
    expect(json.received).toHaveLength(14);
  });

  it("does not silently discard a server bucket that falls off the axis", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    // A key outside the window is what the SQL emitted for a week bucket whose
    // Monday key never matched the Sunday axis. It must surface rather than
    // vanish and render as a flat zero line.
    setTrendResult({ received: [{ key: "2026-09-28", jobs: 5 }], completed: [] });

    const { json } = await load(
      "/api/overview/volume-trend?from=2026-09-18&to=2026-09-24&range=7d",
    );

    expect(json.received.some((b: { key: string }) => b.key === "2026-09-28")).toBe(true);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("outside the"));
    warn.mockRestore();
  });

  it("asks SQL for monthly buckets over a 1 year range", async () => {
    setTrendResult({
      granularity: "month",
      received: [
        { key: "2025-10", jobs: 2 },
        { key: "2026-09", jobs: 5 },
      ],
      completed: [{ key: "2026-09", jobs: 5 }],
    });

    const { json } = await load(
      "/api/overview/volume-trend?from=2025-09-24&to=2026-09-24&range=1y",
    );

    expect(trendCall()?.args.p_granularity).toBe("month");
    expect(json.range.granularity).toBe("month");
    expect(json.received).toHaveLength(13);
    expect(json.received[0].key).toBe("2025-09");
    expect(json.received[12].jobs).toBe(5);
    expect(json.completed[12].jobs).toBe(5);
  });

  it("reports today's key so the client can mark it", async () => {
    const { json } = await load(
      "/api/overview/volume-trend?from=2026-09-18&to=2026-09-24&range=7d",
    );

    expect(json.range.today).toBe("2026-09-24");
  });

  it("refreshes a stale snapshot before counting", async () => {
    await load("/api/overview/volume-trend?from=2026-09-18&to=2026-09-24&range=7d");

    expect(mockSnapshotRefresh).toHaveBeenCalledTimes(1);
  });

  it("offers the completed series only when a board maps a completion date", async () => {
    setTrendResult({ completed_date_available: false });
    let json = (
      await load("/api/overview/volume-trend?from=2026-09-18&to=2026-09-24&range=7d")
    ).json;
    expect(json.completedDateAvailable).toBe(false);

    setTrendResult({ completed_date_available: true });
    json = (
      await load("/api/overview/volume-trend?from=2026-09-18&to=2026-09-24&range=7d")
    ).json;
    expect(json.completedDateAvailable).toBe(true);
  });

  it("returns the coverage block so an empty chart can explain itself", async () => {
    setTrendResult({
      coverage: {
        total_rows: 4203,
        dated_rows: 3987,
        in_range: 0,
        before_range: 3000,
        after_range: 987,
        undated: 216,
        earliest: "2025-06-11",
        latest: "2025-12-21",
      },
    });

    const { json } = await load(
      "/api/overview/volume-trend?from=2026-09-18&to=2026-09-24&range=7d",
    );

    expect(json.coverage).toEqual({
      totalRows: 4203,
      datedRows: 3987,
      inRange: 0,
      beforeRange: 3000,
      afterRange: 987,
      undated: 216,
      earliest: "2025-06-11",
      latest: "2025-12-21",
    });
  });

  it("narrows all time to the bounds the data occupies", async () => {
    setBoundsResult({ earliest: "2025-06-11", latest: "2025-12-21" });

    const { json } = await load("/api/overview/volume-trend?range=all");

    expect(trendCall()?.args).toMatchObject({
      p_from: "2025-06-11",
      p_to: "2025-12-21",
    });
    expect(json.range.from).toBe("2025-06-11");
    expect(json.range.to).toBe("2025-12-21");
  });

  it("keeps an explicit selection instead of stretching it to all data", async () => {
    setBoundsResult({ earliest: "2020-01-01", latest: "2020-12-31" });

    const { json } = await load(
      "/api/overview/volume-trend?from=2026-09-18&to=2026-09-24&range=7d",
    );

    expect(json.range.from).toBe("2026-09-18");
    expect(json.range.to).toBe("2026-09-24");
  });

  it("returns 401 without an organization", async () => {
    vi.mocked(getUserOrganizationId).mockResolvedValue(null);
    const { response } = await load("/api/overview/volume-trend?range=7d");
    expect(response.status).toBe(401);
  });

  it("fails loudly rather than returning an empty chart when the query errors", async () => {
    setTrendError({ message: "connection reset" });
    const { response, json } = await load(
      "/api/overview/volume-trend?from=2026-09-18&to=2026-09-24&range=7d",
    );

    expect(response.status).toBe(500);
    expect(json.error).toContain("connection reset");
  });

  it("honours explicit bounds over the preset's own window", async () => {
    const { json } = await load(
      "/api/overview/volume-trend?from=2026-01-01&to=2026-01-07&range=1y",
    );

    expect(json.range.from).toBe("2026-01-01");
    expect(json.range.to).toBe("2026-01-07");
    expect(json.range.granularity).toBe("day");
    expect(json.received).toHaveLength(7);
  });
});
