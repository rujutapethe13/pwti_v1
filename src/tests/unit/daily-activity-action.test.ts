import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockFetchClient360DailyActivity = vi.fn();

vi.mock("@/features/client-360/daily-activity-service", () => ({
  fetchClient360DailyActivity: (...args: unknown[]) =>
    mockFetchClient360DailyActivity(...args),
}));

const { fetchClient360DailyActivityAction } = await import(
  "@/features/client-360/daily-activity-action"
);

describe("fetchClient360DailyActivityAction", () => {
  beforeEach(() => {
    mockFetchClient360DailyActivity.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns parsed data on success", async () => {
    const data = {
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
    mockFetchClient360DailyActivity.mockResolvedValue(data);

    const res = await fetchClient360DailyActivityAction({
      selectedDate: "2026-09-23",
    });

    expect(mockFetchClient360DailyActivity).toHaveBeenCalledWith({
      selectedDate: "2026-09-23",
    });
    expect(res.error).toBeNull();
    expect(res.data).toEqual(data);
    expect(res.status).toBe(200);
  });

  it("passes clientId through to the service", async () => {
    mockFetchClient360DailyActivity.mockResolvedValue({});

    await fetchClient360DailyActivityAction({
      selectedDate: "2026-09-23",
      clientId: "client-1",
    });

    expect(mockFetchClient360DailyActivity).toHaveBeenCalledWith({
      selectedDate: "2026-09-23",
      clientId: "client-1",
    });
  });

  it("passes no options when called with empty args", async () => {
    mockFetchClient360DailyActivity.mockResolvedValue({});

    await fetchClient360DailyActivityAction({});

    expect(mockFetchClient360DailyActivity).toHaveBeenCalledWith({});
  });

  it("returns the real error message on service failure", async () => {
    mockFetchClient360DailyActivity.mockRejectedValue(
      new Error("Unable to determine organization. Please ensure you are a member of a workspace."),
    );

    const res = await fetchClient360DailyActivityAction({});

    expect(res.data).toBeNull();
    expect(res.error).toContain("Unable to determine organization");
    expect(res.status).toBe(500);
  });

  it("surfaces underlying details on service failure", async () => {
    mockFetchClient360DailyActivity.mockRejectedValue(
      new Error("Failed to fetch daily activity data: relation \"client_360_daily_snapshot\" does not exist"),
    );

    const res = await fetchClient360DailyActivityAction({});

    expect(res.error).toContain("Failed to fetch daily activity data");
    expect(res.error).toContain("does not exist");
    expect(res.status).toBe(500);
  });

  it("handles non-Error throws", async () => {
    mockFetchClient360DailyActivity.mockRejectedValue("something went wrong");

    const res = await fetchClient360DailyActivityAction({});

    expect(res.data).toBeNull();
    expect(res.error).toContain("Failed to fetch daily activity data");
    expect(res.error).toContain("something went wrong");
    expect(res.status).toBe(500);
  });
});
