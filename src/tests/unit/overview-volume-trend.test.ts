import { describe, expect, it } from "vitest";

import {
  toVolumeTrendPoints,
  type VolumeTrendPayload,
} from "@/features/overview/volume-trend";

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
      { key: "2026-09-23", label: "Wed", jobs: 2 },
      { key: "2026-09-24", label: "Thu", jobs: 4 },
    ],
    completed: [
      { key: "2026-09-24", label: "Thu", jobs: 1 },
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

describe("volume trend projection", () => {
  it("joins the two series on the bucket key", () => {
    const result = toVolumeTrendPoints(payload(), "received");

    expect(result.points).toHaveLength(2);
    expect(result.points[0]).toMatchObject({
      key: "2026-09-23",
      received: 2,
      completed: 0,
    });
    expect(result.points[1]).toMatchObject({
      key: "2026-09-24",
      received: 4,
      completed: 1,
    });
  });

  it("keeps a bucket that only has completions", () => {
    const result = toVolumeTrendPoints(
      payload({
        received: [{ key: "2026-09-24", label: "Thu", jobs: 0 }],
        completed: [{ key: "2026-09-24", label: "Thu", jobs: 3 }],
      }),
      "completed",
    );

    expect(result.points).toHaveLength(1);
    expect(result.points[0]).toMatchObject({ received: 0, completed: 3 });
  });

  it("passes through the range metadata the chart needs", () => {
    const result = toVolumeTrendPoints(payload(), "received");

    expect(result.metric).toBe("received");
    expect(result.granularity).toBe("day");
    expect(result.todayKey).toBe("2026-09-24");
    expect(result.completedDateAvailable).toBe(true);
  });

  it("reports emptiness only when both series are flat", () => {
    expect(toVolumeTrendPoints(payload(), "received").isEmpty).toBe(false);

    const flat = toVolumeTrendPoints(
      payload({
        received: [{ key: "2026-09-24", label: "Thu", jobs: 0 }],
        completed: [{ key: "2026-09-24", label: "Thu", jobs: 0 }],
      }),
      "received",
    );
    expect(flat.isEmpty).toBe(true);
  });

  it("reports a range as non-empty when either series holds a job", () => {
    const result = toVolumeTrendPoints(
      payload({
        range: { id: "7d", label: "Last 7 days", from: "2026-09-18", to: "2026-09-24", days: 7, granularity: "day", today: null },
        received: [{ key: "2026-09-18", label: "Fri", jobs: 2 }],
        completed: [{ key: "2026-09-18", label: "Fri", jobs: 0 }],
      }),
      "received",
    );
    expect(result.isEmpty).toBe(false);
  });
});
