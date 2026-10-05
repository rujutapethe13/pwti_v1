import { describe, expect, it } from "vitest";
import type { ColumnValue } from "@/features/boards/engine/types";
import {
  aggregateValues,
  defaultAggregationForType,
  isNumberAggregation,
  isDateAggregation,
  isTextAggregation,
  toNumber,
  type AggregationMode,
} from "@/features/boards/engine/connected-data/mirror-format";

describe("mirror-format: type guards", () => {
  it("classifies number aggregations", () => {
    expect(isNumberAggregation("sum")).toBe(true);
    expect(isNumberAggregation("median")).toBe(true);
    expect(isNumberAggregation("latest")).toBe(false);
    expect(isNumberAggregation("list")).toBe(false);
  });

  it("classifies date aggregations", () => {
    expect(isDateAggregation("earliest")).toBe(true);
    expect(isDateAggregation("range")).toBe(true);
    expect(isDateAggregation("sum")).toBe(false);
  });

  it("classifies text aggregations", () => {
    expect(isTextAggregation("list")).toBe(true);
    expect(isTextAggregation("filter")).toBe(true);
    expect(isTextAggregation("count")).toBe(true);
    expect(isTextAggregation("sum")).toBe(false);
  });
});

describe("mirror-format: toNumber", () => {
  it("passes through numbers", () => {
    expect(toNumber(42)).toBe(42);
    expect(toNumber(3.5)).toBe(3.5);
  });

  it("parses numeric strings", () => {
    expect(toNumber("100")).toBe(100);
    expect(toNumber("  3.14  ")).toBeCloseTo(3.14);
  });

  it("returns NaN for non-numeric values", () => {
    expect(toNumber("Done")).toBeNaN();
    expect(toNumber(null as unknown as ColumnValue)).toBeNaN();
    expect(toNumber(undefined as unknown as ColumnValue)).toBeNaN();
  });
});

describe("mirror-format: defaultAggregationForType", () => {
  it("defaults number-like types to sum", () => {
    expect(defaultAggregationForType("number")).toBe("sum");
    expect(defaultAggregationForType("currency")).toBe("sum");
    expect(defaultAggregationForType("rating")).toBe("sum");
  });

  it("defaults date-like types to latest", () => {
    expect(defaultAggregationForType("date")).toBe("latest");
    expect(defaultAggregationForType("timeline")).toBe("latest");
  });

  it("defaults everything else to list", () => {
    expect(defaultAggregationForType("status")).toBe("list");
    expect(defaultAggregationForType("text")).toBe("list");
    expect(defaultAggregationForType(undefined)).toBe("list");
  });
});

describe("mirror-format: number aggregations", () => {
  const nums = [10, 20, 30, 40];

  it("sum", () => {
    expect(aggregateValues(nums, "sum")).toEqual({ display: 100, detail: "Sum" });
  });

  it("average", () => {
    expect(aggregateValues(nums, "average")).toEqual({ display: 25, detail: "Average" });
  });

  it("min", () => {
    expect(aggregateValues(nums, "min")).toEqual({ display: 10, detail: "Min" });
  });

  it("max", () => {
    expect(aggregateValues(nums, "max")).toEqual({ display: 40, detail: "Max" });
  });

  it("median (even count)", () => {
    expect(aggregateValues(nums, "median")).toEqual({ display: 25, detail: "Median" });
  });

  it("median (odd count)", () => {
    expect(aggregateValues([10, 20, 30], "median")).toEqual({ display: 20, detail: "Median" });
  });

  it("count", () => {
    expect(aggregateValues(nums, "count")).toEqual({ display: 4, detail: "4 items" });
  });

  it("ignores non-numeric values in the list", () => {
    const mixed = aggregateValues(
      [10, "Done", 20, null, "In Progress"] as unknown as ColumnValue[],
      "sum",
    );
    expect(mixed.display).toBe(30);
  });

  it("returns null display for an empty list", () => {
    expect(aggregateValues([], "sum")).toEqual({ display: null, detail: "—" });
  });

  it("average rounds sensibly", () => {
    const r = aggregateValues([1, 2], "average");
    expect(r.display).toBe(1.5);
  });
});

describe("mirror-format: date aggregations", () => {
  const dates = ["2026-07-30", "2026-07-28", "2026-08-02"];

  it("earliest", () => {
    expect(aggregateValues(dates, "earliest")).toEqual({
      display: "2026-07-28",
      detail: "Earliest",
    });
  });

  it("latest", () => {
    expect(aggregateValues(dates, "latest")).toEqual({
      display: "2026-08-02",
      detail: "Latest",
    });
  });

  it("range with multiple dates", () => {
    const r = aggregateValues(dates, "range");
    expect(r.display).toBe("2026-07-28 – 2026-08-02");
    expect(r.detail).toBe("Range");
  });

  it("range with a single date returns that date", () => {
    expect(aggregateValues(["2026-07-30"], "range")).toEqual({
      display: "2026-07-30",
      detail: "Range",
    });
  });

  it("returns null display for an empty list", () => {
    expect(aggregateValues([], "latest")).toEqual({ display: null, detail: "—" });
  });
});

describe("mirror-format: text/status aggregations", () => {
  const statuses = ["Done", "In Progress", "Done", "QA"];

  it("list (default) shows unique values", () => {
    const r = aggregateValues(statuses, "list");
    expect(r.display).toBe("Done, In Progress, QA");
    expect(r.detail).toBe("3 values");
  });

  it("count returns the number of values", () => {
    const r = aggregateValues(statuses, "count");
    expect(r.display).toBe(4);
    expect(r.detail).toBe("4 items");
  });

  it("filter counts values matching the target", () => {
    const r = aggregateValues(statuses, "filter", "Done");
    expect(r.display).toBe(2);
    expect(r.detail).toBe("2 of 4 = Done");
  });

  it("filter with no matches returns 0", () => {
    const r = aggregateValues(statuses, "filter", "Blocked");
    expect(r.display).toBe(0);
  });

  it("list dedupes while preserving first-seen order", () => {
    const r = aggregateValues(["B", "A", "B", "C", "A"], "list");
    expect(r.display).toBe("B, A, C");
  });

  it("returns null when a number mode is applied to non-numeric values", () => {
    // The pure function does what the mode says; the renderer is responsible
    // for coercing the mode to one valid for the column type.
    const r = aggregateValues(statuses, "sum" as AggregationMode);
    expect(r.display).toBeNull();
    expect(r.detail).toBe("—");
  });

  it("count is type-agnostic (counts non-null values regardless of shape)", () => {
    expect(aggregateValues([10, 20, 30], "count")).toEqual({ display: 3, detail: "3 items" });
    expect(aggregateValues(["a", "b", "c"], "count")).toEqual({ display: 3, detail: "3 items" });
    expect(aggregateValues([1, "x", null, 2], "count")).toEqual({ display: 3, detail: "3 items" });
  });
});
