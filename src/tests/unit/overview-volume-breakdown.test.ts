import { describe, expect, it } from "vitest";

import type { ResolvedTimeRange } from "@/features/overview/time-range";
import {
  formatPercent,
  normalizeJobType,
  isWithinInclusiveDateWindow,
  turnaroundDays,
  toBreakdownSlices,
  type BreakdownItem,
  type BreakdownPayload,
} from "@/features/overview/volume-breakdown";

const RANGE: ResolvedTimeRange = {
  id: "7d",
  label: "Last 7 days",
  from: "2026-09-18",
  to: "2026-09-24",
  days: 7,
};

function payload(
  items: BreakdownItem[],
  overrides: Partial<BreakdownPayload> = {},
): BreakdownPayload {
  return {
    range: RANGE,
    grouping: { field: "job_type", label: "Job type", available: true },
    total: {
      volume: items.reduce((sum, item) => sum + item.volume, 0),
      jobs: items.reduce((sum, item) => sum + item.jobs, 0),
    },
    items,
    ...overrides,
  };
}

describe("toBreakdownSlices", () => {
  it("normalizes aliases before counting", () => {
    expect(normalizeJobType("  Genie Backpack ")).toBe("Backpack");
    expect(normalizeJobType("APPERALS")).toBe("Apparel");
    expect(normalizeJobType("  Socks ")).toBe("Socks");
  });

  it("keeps header, chart and table totals consistent", () => {
    const result = toBreakdownSlices(
      payload([
        { key: "Backpack", volume: 2, jobs: 2 },
        { key: "Genie Backpack", volume: 1, jobs: 1 },
        { key: "Socks", volume: 1, jobs: 1 },
      ]),
    );
    expect(result.categoryCount).toBe(2);
    expect(result.totalJobs).toBe(4);
    expect(result.slices.reduce((sum, slice) => sum + slice.jobs, 0)).toBe(4);
  });

  it("uses an inclusive 30-day window", () => {
    expect(isWithinInclusiveDateWindow("2026-09-01", "2026-09-01", "2026-09-30")).toBe(true);
    expect(isWithinInclusiveDateWindow("2026-09-30", "2026-09-01", "2026-09-30")).toBe(true);
    expect(isWithinInclusiveDateWindow("2026-08-31", "2026-09-01", "2026-09-30")).toBe(false);
  });

  it("excludes missing uploaded dates from turnaround", () => {
    expect(turnaroundDays("2026-09-01", null)).toBeNull();
    expect(turnaroundDays("2026-09-01", "2026-09-03")).toBe(2);
  });
  it("computes each share from the real counts in the range", () => {
    const result = toBreakdownSlices(
      payload([
        { key: "Retouching", volume: 60, jobs: 6 },
        { key: "Delivery", volume: 30, jobs: 3 },
        { key: "Color Grade", volume: 10, jobs: 1 },
      ]),
    );

    expect(result.slices.map((s) => [s.label, s.percentage])).toEqual([
      ["Retouching", 60],
      ["Delivery", 30],
      ["Color Grade", 10],
    ]);
    expect(result.totalVolume).toBe(100);
    expect(result.totalJobs).toBe(10);
    expect(result.isEmpty).toBe(false);
  });

  it("sums the legend percentages to the total", () => {
    const result = toBreakdownSlices(
      payload([
        { key: "Retouching", volume: 1, jobs: 1 },
        { key: "Delivery", volume: 1, jobs: 1 },
        { key: "Color Grade", volume: 1, jobs: 1 },
      ]),
    );

    // Rounding each share independently would give 33.3% x 3 = 99.9%. The
    // allocator hands the leftover tenth to one slice so the legend adds up.
    // Compared in tenths, because 1/10 is not exact in binary floating point.
    const tenths = result.slices.reduce(
      (acc, s) => acc + Math.round(s.percentage * 10),
      0,
    );
    expect(tenths).toBe(1000);
    expect(result.slices.map((s) => s.percentage)).toEqual([33.4, 33.3, 33.3]);
  });

  it("keeps the shares exact to one decimal for a range of splits", () => {
    const splits: number[][] = [
      [1, 1, 1],
      [1, 1, 1, 1, 1, 1, 1],
      [7, 7, 7],
      [1, 2, 3, 4, 5, 6, 7, 8, 9],
      [997, 3],
    ];

    for (const volumes of splits) {
      const result = toBreakdownSlices(
        payload(
          volumes.map((volume, i) => ({ key: `Type ${i}`, volume, jobs: 1 })),
        ),
      );
      const tenths = result.slices.reduce(
        (acc, s) => acc + Math.round(s.percentage * 10),
        0,
      );
      expect(tenths).toBe(1000);
    }
  });

  it("orders slices by volume, then by label for ties", () => {
    const result = toBreakdownSlices(
      payload([
        { key: "Delivery", volume: 5, jobs: 1 },
        { key: "Color Grade", volume: 5, jobs: 1 },
        { key: "Retouching", volume: 9, jobs: 1 },
      ]),
    );

    expect(result.slices.map((s) => s.label)).toEqual([
      "Retouching",
      "Color Grade",
      "Delivery",
    ]);
  });

  it("drops categories with no volume instead of showing 0% rows", () => {
    const result = toBreakdownSlices(
      payload([
        { key: "Retouching", volume: 10, jobs: 2 },
        { key: "Compositing", volume: 0, jobs: 0 },
      ]),
    );

    expect(result.slices).toHaveLength(1);
    expect(result.slices[0].label).toBe("Retouching");
    expect(result.slices[0].percentage).toBe(100);
  });

  it("keeps untyped records visible as their own slice", () => {
    const result = toBreakdownSlices(
      payload([
        { key: "Retouching", volume: 75, jobs: 3 },
        { key: "", volume: 25, jobs: 2 },
      ]),
    );

    const unclassified = result.slices.find((s) => s.isUnclassified);
    expect(unclassified).toBeDefined();
    expect(unclassified?.label).toBe("Unclassified");
    expect(unclassified?.percentage).toBe(25);
    // The untyped volume is counted, not discarded.
    expect(result.totalVolume).toBe(100);
    expect(result.categoryCount).toBe(1);
  });

  it("shows every type when there are six or fewer types", () => {
    const items: BreakdownItem[] = [
      { key: "Retouching", volume: 50, jobs: 5 },
      { key: "Delivery", volume: 20, jobs: 2 },
      { key: "Compositing", volume: 15, jobs: 1 },
      { key: "Color Grade", volume: 10, jobs: 1 },
      { key: "Proofing", volume: 5, jobs: 1 },
    ];
    const result = toBreakdownSlices(payload(items));

    expect(result.rolledUp).toBe(false);
    expect(result.categoryCount).toBe(items.length);
    expect(result.slices).toHaveLength(items.length);
    expect(result.slices.map((s) => s.label)).toEqual([
      "Retouching",
      "Delivery",
      "Compositing",
      "Color Grade",
      "Proofing",
    ]);

    // Shares stay of the real total.
    expect(result.slices.find((s) => s.label === "Retouching")?.percentage).toBe(50);
  });

  it("rolls only sub-five-percent types into Other when there are more than six", () => {
    const result = toBreakdownSlices(
      payload([
        { key: "Retouching", volume: 60, jobs: 6 },
        { key: "Delivery", volume: 20, jobs: 2 },
        { key: "Compositing", volume: 10, jobs: 1 },
        { key: "Color Grade", volume: 5, jobs: 1 },
        { key: "Proofing", volume: 3, jobs: 1 },
        { key: "Retain", volume: 1, jobs: 1 },
        { key: "Extra", volume: 1, jobs: 1 },
      ]),
    );

    // The 5% type remains visible; smaller types are rolled up.
    const other = result.slices.find((s) => s.isOther);
    expect(other?.volume).toBe(5);
    expect(other?.jobs).toBe(3);
    expect(other?.percentage).toBe(5);
    expect(result.totalVolume).toBe(100);
  });

  it("reports emptiness when the range holds no volume", () => {
    const result = toBreakdownSlices(payload([]));

    expect(result.isEmpty).toBe(true);
    expect(result.slices).toEqual([]);
    expect(result.totalVolume).toBe(0);
  });

  it("gives every slice a distinct color and never NaN a percentage", () => {
    const result = toBreakdownSlices(
      payload([
        { key: "Retouching", volume: 1, jobs: 1 },
        { key: "Delivery", volume: 2, jobs: 1 },
        { key: "Color Grade", volume: 3, jobs: 1 },
        { key: "Compositing", volume: 4, jobs: 1 },
        { key: "Proofing", volume: 5, jobs: 1 },
      ]),
    );

    const colors = result.slices.map((s) => s.color);
    expect(new Set(colors).size).toBe(colors.length);
    for (const slice of result.slices) {
      expect(Number.isNaN(slice.percentage)).toBe(false);
      expect(slice.percentage).toBeGreaterThanOrEqual(0);
      expect(slice.percentage).toBeLessThanOrEqual(100);
    }
  });

  it("passes the grouping availability flag through for the empty-column case", () => {
    const result = toBreakdownSlices(
      payload([{ key: "", volume: 10, jobs: 2 }], {
        grouping: { field: "job_type", label: "Job type", available: false },
      }),
    );

    expect(result.grouping.available).toBe(false);
    expect(result.slices).toHaveLength(1);
    expect(result.slices[0].isUnclassified).toBe(true);
  });

  it("treats a blank-but-not-empty key as unclassified", () => {
    const result = toBreakdownSlices(payload([{ key: "   ", volume: 4, jobs: 1 }]));

    expect(result.slices[0].isUnclassified).toBe(true);
    expect(result.categoryCount).toBe(0);
  });
});

describe("formatPercent", () => {
  it("drops a trailing zero so whole shares read as whole numbers", () => {
    expect(formatPercent(40)).toBe("40%");
    expect(formatPercent(40.0)).toBe("40%");
  });

  it("keeps a decimal for small shares", () => {
    expect(formatPercent(4.3)).toBe("4.3%");
  });

  it("never renders NaN", () => {
    expect(formatPercent(Number.NaN)).toBe("0%");
  });
});
