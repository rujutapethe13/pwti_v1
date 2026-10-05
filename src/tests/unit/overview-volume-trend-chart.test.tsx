import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cloneElement } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import type * as Recharts from "recharts";

/**
 * Recharts measures its container, and the test DOM has no size, so the real
 * ResponsiveContainer never renders anything. Sizing the child chart directly
 * lets these tests assert on the geometry the component actually produces.
 */
vi.mock("recharts", async () => {
  const actual = await vi.importActual<typeof Recharts>("recharts");
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactElement }) =>
      cloneElement(children as React.ReactElement<{ width?: number; height?: number }>, {
        width: 800,
        height: 240,
      }),
  };
});

import { VolumeTrendSection } from "@/features/overview/volume-trend-section";
import type { VolumeTrendPayload } from "@/features/overview/volume-trend";
import type { TimeRangeId } from "@/features/overview/time-range";

const fetchMock = vi.fn();

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
      { key: "2026-09-22", label: "Tue", jobs: 1 },
      { key: "2026-09-23", label: "Wed", jobs: 2 },
      { key: "2026-09-24", label: "Thu", jobs: 4 },
    ],
    completed: [{ key: "2026-09-24", label: "Thu", jobs: 1 }],
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

async function renderSection(rangeId: TimeRangeId, body: VolumeTrendPayload) {
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  } as Response);

  const utils = render(<VolumeTrendSection rangeId={rangeId} />);
  await waitFor(() =>
    expect(utils.container.querySelector(".recharts-surface")).not.toBeNull(),
  );
  return utils;
}

describe("VolumeTrendSection chart", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("draws one area and a today marker on a daily axis", async () => {
    const { container } = await renderSection("7d", payload());

    expect(container.querySelectorAll(".recharts-area-area")).toHaveLength(1);
    expect(
      container.querySelectorAll(".recharts-reference-line"),
    ).toHaveLength(1);
    expect(screen.getByText("Today")).toBeInTheDocument();
  });

  it("drops the today marker when the axis is not days", async () => {
    const { container } = await renderSection(
      "90d",
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

    expect(container.querySelectorAll(".recharts-area-area")).toHaveLength(1);
    expect(container.querySelectorAll(".recharts-reference-line")).toHaveLength(0);
  });

  it("drops the today marker when today falls outside the window", async () => {
    const { container } = await renderSection(
      "7d",
      payload({
        range: {
          id: "7d",
          label: "Last 7 days",
          from: "2026-09-18",
          to: "2026-09-20",
          days: 3,
          granularity: "day",
          today: "2026-09-24",
        },
      }),
    );

    expect(container.querySelectorAll(".recharts-reference-line")).toHaveLength(0);
  });

  it("labels the axis with the short bucket label, not the raw key", async () => {
    const { container } = await renderSection("7d", payload());

    const ticks = [...container.querySelectorAll(".recharts-cartesian-axis-tick-value")]
      .map((node) => node.textContent)
      .filter((text): text is string => Boolean(text));
    expect(ticks).toEqual(expect.arrayContaining(["Tue", "Wed", "Thu"]));
    // No raw bucket key leaks onto the axis.
    expect(ticks.some((tick) => tick.includes("2026-09"))).toBe(false);
  });
});
