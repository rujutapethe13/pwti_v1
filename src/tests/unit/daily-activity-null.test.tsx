import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const emptyActivity = {
  selectedDate: "2026-11-03",
  start: "2026-09-05",
  end: "2026-11-03",
  total_jobs: 0,
  clients_active: 0,
  boards_touched: 0,
  busiest_client: null,
  clients: [],
  daily_breakdown: [],
  unmapped_boards: 0,
  row_total_jobs: 0,
  row_clients: [],
  row_busiest_client: null,
  row_daily_breakdown: [],
};

const emptyTasks = {
  selectedDate: "2026-11-03",
  today: "2026-11-03",
  mode: "received",
  items: [],
  daily_breakdown: [],
  boards_without_due_date: [],
  finished_statuses: [],
};

vi.mock("@/features/client-360/daily-activity-action", () => ({
  fetchClient360DailyActivityAction: vi.fn(),
  fetchActivityAction: vi.fn(),
  fetchActivityTasksAction: vi.fn(),
}));

vi.mock("@/lib/user-context", () => ({
  useUser: vi.fn(),
}));

vi.mock("@/features/client-360/activity-drilldown-panel", () => ({
  ActivityDrilldownPanel: () => <div data-testid="drilldown-panel">drilldown</div>,
}));

import { fetchClient360DailyActivityAction, fetchActivityTasksAction } from "@/features/client-360/daily-activity-action";
import { useUser } from "@/lib/user-context";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useUser).mockReturnValue({
    user: null,
    settings: {},
    settingsPersisted: true,
    permissions: [],
    sessions: [],
    lastSignInAt: null,
    loading: false,
    error: null,
    refresh: vi.fn(),
    applySnapshot: vi.fn(),
    patchUser: vi.fn(),
  } as never);
});

afterEach(() => {
  vi.resetAllMocks();
});

describe("Client360DailyActivityView with null / empty data", () => {
  it("renders an empty state instead of crashing when data is empty", async () => {
    vi.mocked(fetchClient360DailyActivityAction).mockResolvedValue({
      data: emptyActivity,
      error: null,
      status: 200,
    } as never);

    const { Client360DailyActivityView } = await import("@/features/client-360/daily-activity-view");
    render(<Client360DailyActivityView variant="dashboard" />);

    await screen.findByText("No jobs recorded for this day");
    expect(screen.queryByText(/Cannot read properties/)).toBeNull();
  });

  it("renders without crashing when the fetch returns null data", async () => {
    vi.mocked(fetchClient360DailyActivityAction).mockResolvedValue({
      data: null,
      error: null,
      status: 200,
    } as never);
    vi.mocked(fetchActivityTasksAction).mockResolvedValue({
      data: emptyTasks,
      error: null,
      status: 200,
    } as never);

    const { Client360DailyActivityView } = await import("@/features/client-360/daily-activity-view");
    render(<Client360DailyActivityView variant="dashboard" />);

    // Wait for the fetch to settle, then assert no crash and an empty/loading state exists.
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText(/Cannot read properties/)).toBeNull();
    expect(screen.queryByText(/No daily activity data|No jobs recorded for this day/)).not.toBeNull();
  });
});
