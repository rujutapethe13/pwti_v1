import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const { createServiceClient, mockSnapshotRefresh, rpcCalls } = vi.hoisted(() => {
  const calls: Array<{ fn: string; args: unknown }> = [];
  let rpcResult: { data: unknown; error: { message: string } | null } = {
    data: null,
    error: null,
  };
  let boundsResult: { data: unknown; error: { message: string } | null } = {
    data: null,
    error: null,
  };

  function createServiceClient() {
    return {
      from: () => {
        throw new Error("stat cards must not read the snapshot row by row");
      },
      rpc: (fn: string, args: unknown) => {
        calls.push({ fn, args });
        // `overview_data_bounds` only ever answers the "All time" window, so it
        // must not borrow the stats payload the way a single shared mock would.
        if (fn === "overview_data_bounds") {
          return Promise.resolve(boundsResult);
        }
        return Promise.resolve(rpcResult);
      },
      __setRpcResult: (result: typeof rpcResult) => {
        rpcResult = result;
      },
      __setBoundsResult: (result: typeof boundsResult) => {
        boundsResult = result;
      },
    };
  }

  return { createServiceClient, mockSnapshotRefresh: vi.fn(), rpcCalls: calls };
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

const { GET } = await import("@/app/api/overview/stats/route");
const { getUserOrganizationId } = await import("@/lib/organization");
const { createServiceClient: makeClient } = await import("@/lib/supabase/server");

function setRpcResult(result: { data: unknown; error: { message: string } | null }) {
  (makeClient() as unknown as { __setRpcResult: (r: typeof result) => void }).__setRpcResult(
    result,
  );
}

function setBoundsResult(result: { data: unknown; error: { message: string } | null }) {
  (
    makeClient() as unknown as { __setBoundsResult: (r: typeof result) => void }
  ).__setBoundsResult(result);
}

function callsTo(fn: string) {
  return rpcCalls.filter((c) => c.fn === fn);
}

function createMockRequest(url: string): NextRequest {
  const request = new Request(url, { method: "GET" });
  Object.defineProperty(request, "nextUrl", {
    value: new URL(url),
    writable: false,
    configurable: true,
  });
  return request as unknown as NextRequest;
}

const WINDOW = {
  records_in_window: 12,
  jobs_received: 12,
  clients_active: 3,
  boards_touched: 2,
  completed_by_status: 5,
  jobs_completed: 4,
  received_timestamps: 12,
  completed_timestamps: 4,
  turnaround_sample: 4,
  turnaround_avg_days: 2.5,
  completed_date_available: true,
  busiest_client: { client_id: "client-1", count: 7, name: "Acme" },
};

const PRIOR_WINDOW = {
  ...WINDOW,
  records_in_window: 9,
  jobs_received: 9,
  clients_active: 2,
  boards_touched: 1,
  completed_by_status: 4,
  jobs_completed: 3,
  turnaround_sample: 3,
  turnaround_avg_days: 3.5,
};

describe("GET /api/overview/stats", () => {
  beforeEach(() => {
    rpcCalls.length = 0;
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 24, 12, 0, 0));
    vi.mocked(getUserOrganizationId).mockResolvedValue("org-test");
    setRpcResult({
      data: {
        current: WINDOW,
        prior: PRIOR_WINDOW,
        current_top_client_prior_count: 5,
      },
      error: null,
    });
    setBoundsResult({ data: null, error: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("aggregates the selected window and its equal-length predecessor in one call", async () => {
    const response = await GET(
      createMockRequest(
        "http://localhost/api/overview/stats?from=2026-09-18&to=2026-09-24&range=7d",
      ),
    );

    expect(response.status).toBe(200);
    // Current and prior period come back from the same round trip; only the
    // separate "All time" bounds lookup may add a second call.
    const statsCalls = callsTo("overview_period_stats");
    expect(statsCalls).toHaveLength(1);
    expect(statsCalls[0].args).toMatchObject({
      p_organization_id: "org-test",
      p_from: "2026-09-18",
      p_to: "2026-09-24",
      p_prior_from: "2026-09-11",
      p_prior_to: "2026-09-17",
    });
  });

  it("narrows all time to the bounds the data occupies", async () => {
    setBoundsResult({ data: { earliest: "2025-06-11", latest: "2025-12-21" }, error: null });

    const response = await GET(createMockRequest("http://localhost/api/overview/stats?range=all"));
    const json = await response.json();

    expect(callsTo("overview_period_stats")[0].args).toMatchObject({
      p_from: "2025-06-11",
      p_to: "2025-12-21",
    });
    expect(json.range).toMatchObject({
      id: "all",
      from: "2025-06-11",
      to: "2025-12-21",
    });
  });

  it("fetches data bounds for coverage but does not widen an explicit window", async () => {
    setBoundsResult({ data: { earliest: "2020-01-01", latest: "2020-12-31" }, error: null });

    const response = await GET(
      createMockRequest("http://localhost/api/overview/stats?from=2026-09-18&to=2026-09-24"),
    );
    const json = await response.json();

    // Bounds are always read, because an empty window has to be able to explain
    // that the data exists but sits outside it.
    expect(callsTo("overview_data_bounds")).toHaveLength(1);
    expect(callsTo("overview_period_stats")[0].args).toMatchObject({
      p_from: "2026-09-18",
      p_to: "2026-09-24",
    });
    expect(json.range).toMatchObject({ from: "2026-09-18", to: "2026-09-24" });
  });

  it("refreshes a stale snapshot before aggregating", async () => {
    await GET(
      createMockRequest("http://localhost/api/overview/stats?from=2026-09-18&to=2026-09-24"),
    );
    expect(mockSnapshotRefresh).toHaveBeenCalledTimes(1);
  });

  it("returns six cards whose trends cite the prior window", async () => {
    const response = await GET(
      createMockRequest("http://localhost/api/overview/stats?from=2026-09-18&to=2026-09-24"),
    );
    const json = await response.json();

    expect(json.cards).toHaveLength(6);
    expect(json.range).toEqual({
      id: "7d",
      label: "Last 7 days",
      from: "2026-09-18",
      to: "2026-09-24",
      days: 7,
      priorFrom: "2026-09-11",
      priorTo: "2026-09-17",
    });
    expect(json.isEmpty).toBe(false);

    const byId = Object.fromEntries(
      json.cards.map((c: { id: string }) => [c.id, c]),
    );
    expect(byId.jobsReceived.value).toBe("12");
    expect(byId.jobsReceived.trend.label).toBe("↑ 12 vs 9 in the prior 7 days");
    expect(byId.jobsReceived.trend.percentChange).toBeCloseTo(33.33, 1);
    expect(byId.busiestClient.detail).toBe("Acme");
    expect(byId.busiestClient.trend.label).toBe("↑ 7 vs 5 in the prior 7 days");
    expect(byId.avgTurnaround.value).toBe("2.5d");
    expect(byId.avgTurnaround.trend.sentiment).toBe("good");
  });

  it("reports the empty state when the window holds no records", async () => {
    setRpcResult({
      data: {
        current: { ...WINDOW, records_in_window: 0, jobs_received: 0 },
        prior: { ...PRIOR_WINDOW, records_in_window: 0, jobs_received: 0 },
        current_top_client_prior_count: 0,
      },
      error: null,
    });

    const response = await GET(
      createMockRequest("http://localhost/api/overview/stats?from=2026-09-18&to=2026-09-24"),
    );
    const json = await response.json();
    expect(json.isEmpty).toBe(true);
  });

  it("surfaces a real error instead of falling back to numbers", async () => {
    setRpcResult({ data: null, error: { message: "relation does not exist" } });

    const response = await GET(
      createMockRequest("http://localhost/api/overview/stats?from=2026-09-18&to=2026-09-24"),
    );
    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.cards).toBeUndefined();
    expect(json.error).toContain("relation does not exist");
  });

  it("never invents a percentage when the prior window is empty", async () => {
    setRpcResult({
      data: {
        current: WINDOW,
        prior: { ...PRIOR_WINDOW, records_in_window: 0, jobs_received: 0 },
        current_top_client_prior_count: 0,
      },
      error: null,
    });

    const response = await GET(
      createMockRequest("http://localhost/api/overview/stats?from=2026-09-18&to=2026-09-24"),
    );
    const json = await response.json();
    const received = json.cards.find((c: { id: string }) => c.id === "jobsReceived");
    expect(received.trend.percentChange).toBeNull();
    expect(received.trend.label).toBe("↑ 12 vs 0 in the prior 7 days");
  });

  it("falls back to the default preset when bounds are malformed", async () => {
    await GET(createMockRequest("http://localhost/api/overview/stats?from=x&to=y"));
    expect(callsTo("overview_period_stats")[0].args).toMatchObject({
      p_from: "2026-09-18",
      p_to: "2026-09-24",
      p_prior_from: "2026-09-11",
      p_prior_to: "2026-09-17",
    });
  });

  it("returns 401 without an organization", async () => {
    vi.mocked(getUserOrganizationId).mockResolvedValue(null);
    const response = await GET(
      createMockRequest("http://localhost/api/overview/stats?from=2026-09-18&to=2026-09-24"),
    );
    expect(response.status).toBe(401);
  });
});
