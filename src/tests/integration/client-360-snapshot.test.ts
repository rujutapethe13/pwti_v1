import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

// Workaround for TypeScript not recognizing vitest globals
const vitestVi = vi as any;

vi.mock("server-only", () => ({}));

vi.mock("next/headers", () => ({
  cookies: () => ({
    getAll: () => [],
    setAll: () => {},
  }),
}));

const {
  mockServerClient,
  mockServiceClient,
  getUserSpy,
  snapshotSelectSpy,
  clientSelectSpy,
  mappingSelectSpy,
} = vi.hoisted(() => {
  const getUser = vi.fn();

  const snapshotSelect = vi.fn();
  const clientSelect = vi.fn();
  const mappingSelect = vi.fn();

  const serverClient = {
    from: vi.fn(() => ({})),
    auth: { getUser },
  };

  const serviceClient = {
    from: vi.fn((table: string) => {
      if (table === "client_360_daily_snapshot") {
        return {
          select: snapshotSelect,
        };
      }
      if (table === "client_360_clients") {
        return {
          select: clientSelect,
        };
      }
      if (table === "client_360_field_mappings") {
        return {
          select: mappingSelect,
        };
      }
      return {
        select: vi.fn(),
      };
    }),
  };

  return {
    mockServerClient: serverClient,
    mockServiceClient: serviceClient,
    getUserSpy: getUser,
    snapshotSelectSpy: snapshotSelect,
    clientSelectSpy: clientSelect,
    mappingSelectSpy: mappingSelect,
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => mockServerClient,
  createServiceClient: () => mockServiceClient,
}));

vi.mock("@/lib/organization", () => ({
  getUserOrganizationId: vi.fn(),
}));

const { GET } = await import("@/app/api/client-360/snapshot/route");
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

describe("GET /api/client-360/snapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserSpy.mockResolvedValue({ data: { user: { id: "user-123" } } });
    (getUserOrganizationId as vitestVi.Mock).mockResolvedValue("org-test");
  });

  it("returns 401 when user has no organization", async () => {
    (getUserOrganizationId as vitestVi.Mock).mockResolvedValue(null);

    const request = createMockRequest("http://localhost/api/client-360/snapshot");
    const response = await GET(request);

    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json.error).toContain("organization");
  });

  it("returns 400 when date range exceeds 180 days", async () => {
    const request = createMockRequest(
      "http://localhost/api/client-360/snapshot?start=2026-01-01&end=2026-07-01"
    );
    const response = await GET(request);

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toContain("180 days");
  });

  it("returns aggregated data for a single day", async () => {
    const mockSnapshots = [
      {
        job_date: "2026-08-27",
        client_id: "client-1",
        volume: 5,
        board_id: "board-1",
        record_id: "rec-1",
      },
      {
        job_date: "2026-08-27",
        client_id: "client-1",
        volume: 3,
        board_id: "board-1",
        record_id: "rec-2",
      },
      {
        job_date: "2026-08-27",
        client_id: "client-2",
        volume: 2,
        board_id: "board-2",
        record_id: "rec-3",
      },
    ];

    const mockClients = [
      { id: "client-1", canonical_name: "Philips Auction" },
      { id: "client-2", canonical_name: "Acme Corp" },
    ];

    const mockMappings = [{ board_id: "board-1" }, { board_id: "board-2" }];

    snapshotSelectSpy.mockReturnValue({
      eq: vi.fn().mockReturnValue({
        gte: vi.fn().mockReturnValue({
          lte: vi.fn().mockResolvedValue({ data: mockSnapshots, error: null }),
        }),
      }),
    });

    clientSelectSpy.mockReturnValue({
      in: vi.fn().mockResolvedValue({ data: mockClients, error: null }),
    });

    mappingSelectSpy.mockReturnValue({
      in: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: mockMappings, error: null }),
        }),
      }),
    });

    const request = createMockRequest(
      "http://localhost/api/client-360/snapshot?start=2026-08-27&end=2026-08-27"
    );
    const response = await GET(request);

    expect(response.status).toBe(200);
    const json = await response.json();

    expect(json.start).toBe("2026-08-27");
    expect(json.end).toBe("2026-08-27");
    expect(json.total_jobs).toBe(10);
    expect(json.clients_active).toBe(2);
    expect(json.boards_touched).toBe(2);
    expect(json.clients).toHaveLength(2);
    expect(json.clients[0]).toEqual({
      client_id: "client-1",
      client_name: "Philips Auction",
      count: 8,
    });
    expect(json.clients[1]).toEqual({
      client_id: "client-2",
      client_name: "Acme Corp",
      count: 2,
    });
    expect(json.daily_breakdown).toHaveLength(1);
    expect(json.daily_breakdown[0]).toEqual({ date: "2026-08-27", total: 10 });
    expect(json.unmapped_boards).toBe(0);
  });

  it("returns aggregated data for a date range", async () => {
    const mockSnapshots = [
      { job_date: "2026-08-25", client_id: "client-1", volume: 3, board_id: "board-1", record_id: "rec-1" },
      { job_date: "2026-08-26", client_id: "client-1", volume: 5, board_id: "board-1", record_id: "rec-2" },
      { job_date: "2026-08-27", client_id: "client-1", volume: 2, board_id: "board-1", record_id: "rec-3" },
      { job_date: "2026-08-26", client_id: "client-2", volume: 4, board_id: "board-2", record_id: "rec-4" },
      { job_date: "2026-08-27", client_id: "client-2", volume: 1, board_id: "board-2", record_id: "rec-5" },
    ];

    const mockClients = [
      { id: "client-1", canonical_name: "Philips Auction" },
      { id: "client-2", canonical_name: "Acme Corp" },
    ];

    const mockMappings = [{ board_id: "board-1" }, { board_id: "board-2" }];

    snapshotSelectSpy.mockReturnValue({
      eq: vi.fn().mockReturnValue({
        gte: vi.fn().mockReturnValue({
          lte: vi.fn().mockResolvedValue({ data: mockSnapshots, error: null }),
        }),
      }),
    });

    clientSelectSpy.mockReturnValue({
      in: vi.fn().mockResolvedValue({ data: mockClients, error: null }),
    });

    mappingSelectSpy.mockReturnValue({
      in: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: mockMappings, error: null }),
        }),
      }),
    });

    const request = createMockRequest(
      "http://localhost/api/client-360/snapshot?start=2026-08-25&end=2026-08-27"
    );
    const response = await GET(request);

    expect(response.status).toBe(200);
    const json = await response.json();

    expect(json.start).toBe("2026-08-25");
    expect(json.end).toBe("2026-08-27");
    expect(json.total_jobs).toBe(15);
    expect(json.clients_active).toBe(2);
    expect(json.boards_touched).toBe(2);
    expect(json.clients).toHaveLength(2);
    expect(json.clients[0]).toEqual({
      client_id: "client-1",
      client_name: "Philips Auction",
      count: 10,
    });
    expect(json.clients[1]).toEqual({
      client_id: "client-2",
      client_name: "Acme Corp",
      count: 5,
    });
    expect(json.daily_breakdown).toHaveLength(3);
    expect(json.daily_breakdown).toEqual([
      { date: "2026-08-25", total: 3 },
      { date: "2026-08-26", total: 9 },
      { date: "2026-08-27", total: 3 },
    ]);
    expect(json.unmapped_boards).toBe(0);
  });

  it("counts unmapped boards correctly", async () => {
    const mockSnapshots = [
      { job_date: "2026-08-27", client_id: "client-1", volume: 5, board_id: "board-1", record_id: "rec-1" },
      { job_date: "2026-08-27", client_id: "client-2", volume: 3, board_id: "board-2", record_id: "rec-2" },
      { job_date: "2026-08-27", client_id: "client-3", volume: 2, board_id: "board-3", record_id: "rec-3" },
    ];

    const mockClients = [
      { id: "client-1", canonical_name: "Client A" },
      { id: "client-2", canonical_name: "Client B" },
      { id: "client-3", canonical_name: "Client C" },
    ];

    const mockMappings = [{ board_id: "board-1" }];

    snapshotSelectSpy.mockReturnValue({
      eq: vi.fn().mockReturnValue({
        gte: vi.fn().mockReturnValue({
          lte: vi.fn().mockResolvedValue({ data: mockSnapshots, error: null }),
        }),
      }),
    });

    clientSelectSpy.mockReturnValue({
      in: vi.fn().mockResolvedValue({ data: mockClients, error: null }),
    });

    mappingSelectSpy.mockReturnValue({
      in: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: mockMappings, error: null }),
        }),
      }),
    });

    const request = createMockRequest(
      "http://localhost/api/client-360/snapshot?start=2026-08-27&end=2026-08-27"
    );
    const response = await GET(request);

    expect(response.status).toBe(200);
    const json = await response.json();

    expect(json.unmapped_boards).toBe(2);
  });

  it("uses today's date when no params provided", async () => {
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];

    const mockSnapshots = [
      { job_date: todayStr, client_id: "client-1", volume: 1, board_id: "board-1", record_id: "rec-1" },
    ];

    const mockClients = [{ id: "client-1", canonical_name: "Test Client" }];
    const mockMappings = [{ board_id: "board-1" }];

    snapshotSelectSpy.mockReturnValue({
      eq: vi.fn().mockReturnValue({
        gte: vi.fn().mockReturnValue({
          lte: vi.fn().mockResolvedValue({ data: mockSnapshots, error: null }),
        }),
      }),
    });

    clientSelectSpy.mockReturnValue({
      in: vi.fn().mockResolvedValue({ data: mockClients, error: null }),
    });

    mappingSelectSpy.mockReturnValue({
      in: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: mockMappings, error: null }),
        }),
      }),
    });

    const request = createMockRequest("http://localhost/api/client-360/snapshot");
    const response = await GET(request);

    expect(response.status).toBe(200);
    const json = await response.json();

    expect(json.start).toBe(todayStr);
    expect(json.end).toBe(todayStr);
  });

  it("returns empty result when no snapshots found", async () => {
    snapshotSelectSpy.mockReturnValue({
      eq: vi.fn().mockReturnValue({
        gte: vi.fn().mockReturnValue({
          lte: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    });

    const request = createMockRequest(
      "http://localhost/api/client-360/snapshot?start=2026-08-27&end=2026-08-27"
    );
    const response = await GET(request);

    expect(response.status).toBe(200);
    const json = await response.json();

    expect(json.total_jobs).toBe(0);
    expect(json.clients_active).toBe(0);
    expect(json.boards_touched).toBe(0);
    expect(json.clients).toEqual([]);
    expect(json.daily_breakdown).toEqual([
      { date: "2026-08-27", total: 0 },
    ]);
    expect(json.unmapped_boards).toBe(0);
  });

  it("handles snapshot query error", async () => {
    snapshotSelectSpy.mockReturnValue({
      eq: vi.fn().mockReturnValue({
        gte: vi.fn().mockReturnValue({
          lte: vi.fn().mockResolvedValue({ data: null, error: { message: "DB error" } }),
        }),
      }),
    });

    const request = createMockRequest(
      "http://localhost/api/client-360/snapshot?start=2026-08-27&end=2026-08-27"
    );
    const response = await GET(request);

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error).toBe("Failed to fetch snapshot data");
  });
});