import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { VolumeBreakdownSection } from "@/features/overview/volume-breakdown-section";
import type { BreakdownPayload } from "@/features/overview/volume-breakdown";
import type { TimeRangeId } from "@/features/overview/time-range";

const fetchMock = vi.fn();

function payload(overrides: Partial<BreakdownPayload> = {}): BreakdownPayload {
  return {
    range: {
      id: "7d",
      label: "Last 7 days",
      from: "2026-09-18",
      to: "2026-09-24",
      days: 7,
    },
    grouping: { field: "job_type", label: "Job type", available: true },
    total: { volume: 100, jobs: 10 },
    items: [
      { key: "Retouching", volume: 60, jobs: 6 },
      { key: "Delivery", volume: 30, jobs: 3 },
      { key: "Color Grade", volume: 10, jobs: 1 },
    ],
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

/** Every legend row as "Label 60% 60", which is what a reader would check. */
function legendRows(): string[] {
  const list = screen.getByRole("list");
  return within(list)
    .getAllByRole("listitem")
    .map((row) => row.textContent ?? "");
}

describe("VolumeBreakdownSection", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("queries the breakdown endpoint for the selected range", async () => {
    respondWith(payload());

    render(<VolumeBreakdownSection rangeId="7d" />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const url = new URL(fetchMock.mock.calls[0][0] as string, "http://localhost");
    expect(url.pathname).toBe("/api/overview/breakdown");
    expect(url.searchParams.get("range")).toBe("7d");
    expect(url.searchParams.get("from")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(url.searchParams.get("to")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("re-queries when the range changes", async () => {
    respondWith(payload());
    const { rerender } = render(<VolumeBreakdownSection rangeId="7d" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    respondWith(payload());
    rerender(<VolumeBreakdownSection rangeId={"90d" as TimeRangeId} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const lastUrl = new URL(
      fetchMock.mock.calls[1][0] as string,
      "http://localhost",
    );
    expect(lastUrl.searchParams.get("range")).toBe("90d");
  });

  it("shows a loading placeholder before the counts arrive", () => {
    fetchMock.mockReturnValue(new Promise(() => {}));

    const { container } = render(<VolumeBreakdownSection rangeId="7d" />);

    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(container.querySelector('[class*="animate-pulse"]')).not.toBeNull();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders a legend row per job type with shares from the real counts", async () => {
    respondWith(payload());

    render(<VolumeBreakdownSection rangeId="7d" />);

    expect(
      await screen.findByText(
        "100 volume · last 7 days · 3 job types",
      ),
    ).toBeInTheDocument();
    expect(legendRows()).toEqual([
      "Retouching60%60",
      "Delivery30%30",
      "Color Grade10%10",
    ]);
  });

  it("states the window the shares describe", async () => {
    respondWith(payload());

    render(<VolumeBreakdownSection rangeId="7d" />);

    expect(
      await screen.findByText(/Shares are of the 100 volume received between/),
    ).toBeInTheDocument();
  });

  it("shows untyped records as their own row rather than hiding them", async () => {
    respondWith(
      payload({
        total: { volume: 100, jobs: 10 },
        items: [
          { key: "Retouching", volume: 75, jobs: 3 },
          { key: "", volume: 25, jobs: 2 },
        ],
      }),
    );

    render(<VolumeBreakdownSection rangeId="7d" />);

    const rows = await screen.findAllByRole("listitem");
    expect(rows[1]).toHaveTextContent("Unclassified");
    expect(rows[1]).toHaveTextContent("25%");
    expect(
      screen.getByText(/2 jobs has no job type recorded/),
    ).toBeInTheDocument();
  });

  it("says so when no board maps a job-type column", async () => {
    respondWith(
      payload({
        grouping: { field: "job_type", label: "Job type", available: false },
        total: { volume: 40, jobs: 4 },
        items: [{ key: "", volume: 40, jobs: 4 }],
      }),
    );

    render(<VolumeBreakdownSection rangeId="7d" />);

    expect(
      await screen.findByText(/No board here maps a job-type column/),
    ).toBeInTheDocument();
    // Still a real total, not a fabricated breakdown.
    expect(screen.getByText("40 volume · last 7 days · 0 job types")).toBeInTheDocument();
  });

  it("discloses that the smallest job types were rolled into Other", async () => {
    respondWith(
      payload({
        total: { volume: 100, jobs: 10 },
        items: [
          { key: "Retouching", volume: 50, jobs: 5 },
          { key: "Delivery", volume: 20, jobs: 2 },
          { key: "Compositing", volume: 15, jobs: 1 },
          { key: "Color Grade", volume: 10, jobs: 1 },
          { key: "Proofing", volume: 5, jobs: 1 },
        ],
      }),
    );

    render(<VolumeBreakdownSection rangeId="7d" />);

    expect(
      await screen.findByText(/Smaller job types are grouped under Other\./),
    ).toBeInTheDocument();
  });

  it("uses the singular job type for a single category", async () => {
    respondWith(
      payload({
        total: { volume: 12, jobs: 1 },
        items: [{ key: "Retouching", volume: 12, jobs: 1 }],
      }),
    );

    render(<VolumeBreakdownSection rangeId="7d" />);

    expect(
      await screen.findByText("12 volume · last 7 days · 1 job type"),
    ).toBeInTheDocument();
  });

  it("shows an empty state when the range holds no volume", async () => {
    respondWith(payload({ total: { volume: 0, jobs: 0 }, items: [] }));

    render(<VolumeBreakdownSection rangeId="7d" />);

    expect(await screen.findByText("No volume in this period")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("surfaces a failure with a retry, and recovers when the retry succeeds", async () => {
    const user = userEvent.setup();
    respondWith({ error: "Failed to fetch volume breakdown: timeout" }, 500);

    render(<VolumeBreakdownSection rangeId="7d" />);

    const failure = await screen.findByRole("alert");
    expect(failure).toHaveTextContent("Failed to fetch volume breakdown: timeout");
    expect(failure).toHaveTextContent("Volume breakdown unavailable");

    respondWith(payload());
    await user.click(within(failure).getByRole("button", { name: "Retry" }));

    expect(
      await screen.findByText("100 volume · last 7 days · 3 job types"),
    ).toBeInTheDocument();
  });

  it("refetches on demand", async () => {
    const user = userEvent.setup();
    respondWith(payload());

    render(<VolumeBreakdownSection rangeId="7d" />);
    await screen.findByText("100 volume · last 7 days · 3 job types");

    respondWith(payload());
    await user.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
