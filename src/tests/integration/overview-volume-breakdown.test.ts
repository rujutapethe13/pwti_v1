import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

interface RpcCall {
  fn: string;
  args: Record<string, unknown>;
}

const { createServiceClient, mockSnapshotRefresh, rpcCalls, setRpcResult } =
  vi.hoisted(() => {
    const calls: RpcCall[] = [];
    let result: unknown = null;
    let error: { message: string } | null = null;

    function createServiceClient() {
      return {
        rpc: (fn: string, args: Record<string, unknown>) => {
          calls.push({ fn, args });
          return Promise.resolve({ data: result, error });
        },
        from: () => {
          const api: Record<string, unknown> = {
            select: () => api,
            eq: () => api,
            maybeSingle: () => Promise.resolve({ data: null, error: null }),
            update: () => Promise.resolve({ data: null, error: null }),
          };
          return api;
        },
      };
    }

    return {
      createServiceClient,
      mockSnapshotRefresh: vi.fn(),
      rpcCalls: calls,
      setRpcResult: (value: unknown, err: { message: string } | null = null) => {
        result = value;
        error = err;
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

const { GET } = await import("@/app/api/overview/breakdown/route");
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

function breakdownCall(): RpcCall | undefined {
  return rpcCalls.find((call) => call.fn === "overview_volume_breakdown");
}

describe("GET /api/overview/breakdown", () => {
  beforeEach(() => {
    rpcCalls.length = 0;
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 24, 12, 0, 0));
    vi.mocked(getUserOrganizationId).mockResolvedValue("org-test");
    setRpcResult({
      total_volume: 100,
      total_jobs: 10,
      job_type_available: true,
      items: [
        { key: "Retouching", volume: 60, jobs: 6 },
        { key: "Delivery", volume: 30, jobs: 3 },
        { key: "Color Grade", volume: 10, jobs: 1 },
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("aggregates the window it was asked for, scoped to the organization", async () => {
    const { response } = await load(
      "/api/overview/breakdown?from=2026-09-18&to=2026-09-24&range=7d",
    );

    expect(response.status).toBe(200);
    expect(breakdownCall()?.args).toMatchObject({
      p_organization_id: "org-test",
      p_from: "2026-09-18",
      p_to: "2026-09-24",
    });
  });

  it("passes the database counts straight through", async () => {
    const { json } = await load(
      "/api/overview/breakdown?from=2026-09-18&to=2026-09-24&range=7d",
    );

    expect(json.grouping).toEqual({
      field: "job_type",
      label: "Job type",
      available: true,
    });
    expect(json.total).toEqual({ volume: 100, jobs: 10 });
    expect(json.items).toEqual([
      { key: "Retouching", volume: 60, jobs: 6 },
      { key: "Delivery", volume: 30, jobs: 3 },
      { key: "Color Grade", volume: 10, jobs: 1 },
    ]);
    expect(json.range).toMatchObject({
      id: "7d",
      label: "Last 7 days",
      from: "2026-09-18",
      to: "2026-09-24",
      days: 7,
    });
  });

  it("refreshes a stale snapshot before counting", async () => {
    await load("/api/overview/breakdown?from=2026-09-18&to=2026-09-24&range=7d");

    expect(mockSnapshotRefresh).toHaveBeenCalledTimes(1);
  });

  it("keeps untyped records instead of dropping them from the totals", async () => {
    setRpcResult({
      total_volume: 25,
      total_jobs: 2,
      job_type_available: true,
      items: [{ key: "", volume: 25, jobs: 2 }],
    });

    const { json } = await load(
      "/api/overview/breakdown?from=2026-09-18&to=2026-09-24&range=7d",
    );

    expect(json.items).toEqual([{ key: "", volume: 25, jobs: 2 }]);
    expect(json.total).toEqual({ volume: 25, jobs: 2 });
  });

  it("reports the job-type column as unavailable when the org maps none", async () => {
    setRpcResult({
      total_volume: 25,
      total_jobs: 2,
      job_type_available: false,
      items: [{ key: "", volume: 25, jobs: 2 }],
    });

    const { json } = await load(
      "/api/overview/breakdown?from=2026-09-18&to=2026-09-24&range=7d",
    );

    expect(json.grouping.available).toBe(false);
  });

  it("discards a group with no volume so it cannot become a 0% legend row", async () => {
    setRpcResult({
      total_volume: 10,
      total_jobs: 1,
      job_type_available: true,
      items: [
        { key: "Retouching", volume: 10, jobs: 1 },
        { key: "Proofing", volume: 0, jobs: 0 },
      ],
    });

    const { json } = await load(
      "/api/overview/breakdown?from=2026-09-18&to=2026-09-24&range=7d",
    );

    expect(json.items).toEqual([{ key: "Retouching", volume: 10, jobs: 1 }]);
  });

  it("returns an empty range rather than inventing data", async () => {
    setRpcResult({
      total_volume: 0,
      total_jobs: 0,
      job_type_available: true,
      items: [],
    });

    const { json } = await load(
      "/api/overview/breakdown?from=2026-09-18&to=2026-09-24&range=7d",
    );

    expect(json.items).toEqual([]);
    expect(json.total).toEqual({ volume: 0, jobs: 0 });
  });

  it("tolerates a null payload without inventing counts", async () => {
    setRpcResult(null);

    const { json } = await load(
      "/api/overview/breakdown?from=2026-09-18&to=2026-09-24&range=7d",
    );

    expect(json.items).toEqual([]);
    expect(json.total).toEqual({ volume: 0, jobs: 0 });
    expect(json.grouping.available).toBe(false);
  });

  it("fails loudly rather than returning an empty chart when the query errors", async () => {
    setRpcResult(null, { message: "connection reset" });

    const { response, json } = await load(
      "/api/overview/breakdown?from=2026-09-18&to=2026-09-24&range=7d",
    );

    expect(response.status).toBe(500);
    expect(json.error).toContain("connection reset");
  });

  it("honours explicit bounds over the preset's own window", async () => {
    await load("/api/overview/breakdown?from=2026-01-01&to=2026-01-07&range=1y");

    expect(breakdownCall()?.args).toMatchObject({
      p_from: "2026-01-01",
      p_to: "2026-01-07",
    });
  });

  it("returns 401 without an organization", async () => {
    vi.mocked(getUserOrganizationId).mockResolvedValue(null);

    const { response } = await load("/api/overview/breakdown?range=7d");

    expect(response.status).toBe(401);
    expect(breakdownCall()).toBeUndefined();
  });
});
