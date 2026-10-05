import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const { mockDailyActivity } = vi.hoisted(() => ({
  mockDailyActivity: vi.fn(),
}));

vi.mock("@/features/client-360/daily-activity-service", () => ({
  fetchClient360DailyActivity: mockDailyActivity,
}));

vi.mock("@/lib/organization", () => ({
  getUserOrganizationId: vi.fn(),
}));

const { GET } = await import("@/app/api/client-360/daily-activity/route");
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

const validData = {
  selectedDate: "2026-09-23",
  start: "2026-07-25",
  end: "2026-09-23",
  total_jobs: 5,
  clients_active: 2,
  boards_touched: 1,
  busiest_client: { client_id: "c1", client_name: "Acme", count: 3 },
  clients: [{ client_id: "c1", client_name: "Acme", count: 3 }],
  daily_breakdown: [{ date: "2026-09-23", total: 5 }],
  unmapped_boards: 0,
};

describe("GET /api/client-360/daily-activity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUserOrganizationId).mockResolvedValue("org-test");
  });

  it("returns 401 when the user has no organization", async () => {
    vi.mocked(getUserOrganizationId).mockResolvedValue(null);

    const response = await GET(
      createMockRequest("http://localhost/api/client-360/daily-activity"),
    );

    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain("organization");
    expect(json.details).toBeNull();
  });

  it("returns 400 for an invalid selectedDate", async () => {
    const response = await GET(
      createMockRequest(
        "http://localhost/api/client-360/daily-activity?selectedDate=not-a-date",
      ),
    );

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain("selectedDate");
  });

  it("returns a success envelope wrapping the service result", async () => {
    vi.mocked(mockDailyActivity).mockResolvedValue(validData);

    const response = await GET(
      createMockRequest(
        "http://localhost/api/client-360/daily-activity?selectedDate=2026-09-23&clientId=client-1",
      ),
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.data).toEqual(validData);
  });

  it("passes selectedDate, clientId and organizationId to the service", async () => {
    vi.mocked(mockDailyActivity).mockResolvedValue(validData);

    await GET(
      createMockRequest(
        "http://localhost/api/client-360/daily-activity?selectedDate=2026-09-23&clientId=client-1",
      ),
    );

    expect(mockDailyActivity).toHaveBeenCalledWith({
      selectedDate: "2026-09-23",
      clientId: "client-1",
      organizationId: "org-test",
    });
  });

  it("returns a 500 envelope with details when the service throws", async () => {
    vi.mocked(mockDailyActivity).mockRejectedValue(
      new Error('relation "client_360_daily_snapshot" does not exist'),
    );

    const response = await GET(
      createMockRequest(
        "http://localhost/api/client-360/daily-activity?selectedDate=2026-09-23",
      ),
    );

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe("Failed to fetch daily activity data");
    expect(json.details).toContain("does not exist");
  });

  it("returns JSON (never HTML) for an unhandled route error", async () => {
    vi.mocked(getUserOrganizationId).mockRejectedValue(new Error("supabase down"));

    const response = await GET(
      createMockRequest("http://localhost/api/client-360/daily-activity"),
    );

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.details).toContain("supabase down");
  });
});
