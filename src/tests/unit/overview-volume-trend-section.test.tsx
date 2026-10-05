import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { VolumeTrendSection } from "@/features/overview/volume-trend-section";
import type { VolumeTrendPayload } from "@/features/overview/volume-trend";
import type { TimeRangeId } from "@/features/overview/time-range";

const fetchMock = vi.fn();

function bucket(key: string, label: string, jobs: number) {
  return { key, label, jobs };
}

function payload(overrides: Partial<VolumeTrendPayload> = {}): VolumeTrendPayload {
  return {
    range: {
      id: "7d",
      label: "Last 7 days",
      from: "2026-09-18",
      to: "2026-09-24",
      days: 7,
      granularity: "day",
      today: "2026-09-24",
    },
    received: [
      bucket("2026-09-22", "Tue", 0),
      bucket("2026-09-23", "Wed", 2),
      bucket("2026-09-24", "Thu", 4),
    ],
    completed: [
      bucket("2026-09-23", "Wed", 1),
      bucket("2026-09-24", "Thu", 5),
    ],
    completedDateAvailable: true,
    coverage: {
      totalRows: 0,
      datedRows: 0,
      inRange: 0,
      beforeRange: 0,
      afterRange: 0,
      undated: 0,
      earliest: null,
      latest: null,
    },
    ...overrides,
  };
}

function respondWith(body: unknown, status = 200) {
  fetchMock.mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

describe("VolumeTrendSection", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("queries the volume endpoint for the selected range", async () => {
    respondWith(payload());

    render(<VolumeTrendSection rangeId="7d" />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const url = new URL(fetchMock.mock.calls[0][0] as string, "http://localhost");
    expect(url.pathname).toBe("/api/overview/volume-trend");
    expect(url.searchParams.get("range")).toBe("7d");
    expect(url.searchParams.get("from")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(url.searchParams.get("to")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("re-queries when the range changes", async () => {
    respondWith(payload());
    const { rerender } = render(<VolumeTrendSection rangeId="7d" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    respondWith(payload());
    rerender(<VolumeTrendSection rangeId={"90d" as TimeRangeId} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const lastUrl = new URL(
      fetchMock.mock.calls[1][0] as string,
      "http://localhost",
    );
    expect(lastUrl.searchParams.get("range")).toBe("90d");
  });

  it("shows a loading placeholder before the counts arrive", () => {
    fetchMock.mockReturnValue(new Promise(() => {}));

    const { container } = render(<VolumeTrendSection rangeId="7d" />);

    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(
      container.querySelector('[class*="animate-pulse"]'),
    ).not.toBeNull();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("totals the received series and describes the bucket size", async () => {
    respondWith(payload());

    render(<VolumeTrendSection rangeId="7d" />);

    expect(
      await screen.findByText("6 received · last 7 days · daily buckets"),
    ).toBeInTheDocument();
  });

  it("switches to the completed series when the toggle is used", async () => {
    const user = userEvent.setup();
    respondWith(payload());

    render(<VolumeTrendSection rangeId="7d" />);
    await screen.findByText("6 received · last 7 days · daily buckets");

    await user.click(screen.getByRole("button", { name: "Completed" }));

    expect(
      await screen.findByText("6 completed · last 7 days · daily buckets"),
    ).toBeInTheDocument();
    // Switching metrics re-reads the payload it already has; no refetch.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("hides the completed toggle when no board maps a completion date", async () => {
    respondWith(payload({ completedDateAvailable: false }));

    render(<VolumeTrendSection rangeId="7d" />);

    await screen.findByText("6 received · last 7 days · daily buckets");
    expect(screen.queryByRole("button", { name: "Completed" })).not.toBeInTheDocument();
    expect(
      screen.getByText(/No board here maps a completion-date column/),
    ).toBeInTheDocument();
  });

  it("marks today only when the buckets are days and today is in range", async () => {
    const { unmount } = render(<VolumeTrendSection rangeId="7d" />);
    respondWith(payload());
    unmount();

    respondWith(payload());
    const daily = render(<VolumeTrendSection rangeId="7d" />);
    expect(await screen.findByText(/Today is marked with a dashed line\./)).toBeInTheDocument();
    daily.unmount();

    respondWith(
      payload({
        range: {
          id: "90d",
          label: "Last 90 days",
          from: "2026-06-27",
          to: "2026-09-24",
          days: 90,
          granularity: "week",
          today: "2026-09-24",
        },
      }),
    );
    render(<VolumeTrendSection rangeId={"90d" as TimeRangeId} />);
    await waitFor(() =>
      expect(screen.queryByText(/Today is marked/)).not.toBeInTheDocument(),
    );
  });

  it("shows an empty state instead of a flat line when nothing was received", async () => {
    respondWith(
      payload({
        received: [bucket("2026-09-24", "Thu", 0)],
        completed: [bucket("2026-09-24", "Thu", 0)],
      }),
    );

    render(<VolumeTrendSection rangeId="7d" />);

    expect(await screen.findByText("No jobs in this period")).toBeInTheDocument();
  });

  it("surfaces a failure with a retry, and recovers when the retry succeeds", async () => {
    const user = userEvent.setup();
    respondWith({ error: "Failed to fetch volume trend data: timeout" }, 500);

    render(<VolumeTrendSection rangeId="7d" />);

    const failure = await screen.findByRole("alert");
    expect(failure).toHaveTextContent("Failed to fetch volume trend data: timeout");
    expect(failure).toHaveTextContent("Volume trend unavailable");

    respondWith(payload());
    await user.click(within(failure).getByRole("button", { name: "Retry" }));

    expect(
      await screen.findByText("6 received · last 7 days · daily buckets"),
    ).toBeInTheDocument();
  });
});
