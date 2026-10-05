import { describe, expect, it } from "vitest";

import {
  DEFAULT_TIME_RANGE_ID,
  TIME_RANGE_IDS,
  countOutsideRange,
  daysInclusive,
  isDateKey,
  isTimeRangeId,
  narrowAllTimeRange,
  parseTimeRangeQuery,
  resolveSelectedTimeRange,
  resolveTimeRange,
  timeRangeQueryString,
  toTimestampBounds,
} from "@/features/overview/time-range";
import {
  buildVolumeBuckets,
  pickVolumeGranularity,
} from "@/features/overview/volume-buckets";

const TODAY = new Date(2026, 8, 24); // 2026-09-24, local midnight

describe("time range presets", () => {
  it("exposes exactly the requested presets", () => {
    expect([...TIME_RANGE_IDS]).toEqual([
      "today",
      "7d",
      "15d",
      "30d",
      "90d",
      "6m",
      "1y",
      "all",
      "custom",
    ]);
  });

  it("resolves day-based presets to inclusive windows", () => {
    expect(resolveTimeRange("today", TODAY)).toMatchObject({
      from: "2026-09-24",
      to: "2026-09-24",
      days: 1,
    });
    expect(resolveTimeRange("7d", TODAY)).toMatchObject({
      from: "2026-09-18",
      to: "2026-09-24",
      days: 7,
    });
    expect(resolveTimeRange("15d", TODAY)).toMatchObject({
      from: "2026-09-10",
      to: "2026-09-24",
      days: 15,
    });
    expect(resolveTimeRange("30d", TODAY)).toMatchObject({
      from: "2026-08-26",
      to: "2026-09-24",
      days: 30,
    });
    expect(resolveTimeRange("90d", TODAY)).toMatchObject({
      from: "2026-06-27",
      to: "2026-09-24",
      days: 90,
    });
  });

  it("resolves month-based presets", () => {
    expect(resolveTimeRange("6m", TODAY)).toMatchObject({
      from: "2026-03-24",
      to: "2026-09-24",
      days: 185,
    });
    expect(resolveTimeRange("1y", TODAY)).toMatchObject({
      from: "2025-09-24",
      to: "2026-09-24",
      days: 366,
    });
  });

  it("clamps month arithmetic to short months", () => {
    const endOfMarch = new Date(2026, 2, 31);
    expect(resolveTimeRange("1y", endOfMarch).from).toBe("2025-03-31");
    const aug31 = new Date(2026, 7, 31);
    expect(resolveTimeRange("6m", aug31).from).toBe("2026-02-28");
  });

  it("counts inclusive days across a DST boundary", () => {
    expect(
      daysInclusive(new Date(2026, 2, 7), new Date(2026, 2, 10)),
    ).toBe(4);
  });

  it("validates ids", () => {
    expect(isTimeRangeId("30d")).toBe(true);
    expect(isTimeRangeId("all")).toBe(true);
    expect(isTimeRangeId("custom")).toBe(true);
    expect(isTimeRangeId("last-30-days")).toBe(false);
    expect(isTimeRangeId(null)).toBe(false);
  });
});

describe("all time", () => {
  it("narrows to the bounds the data actually occupies", () => {
    const narrowed = narrowAllTimeRange(resolveTimeRange("all", TODAY), {
      earliest: "2025-06-11",
      latest: "2025-12-21",
    });
    expect(narrowed).toMatchObject({ from: "2025-06-11", to: "2025-12-21" });
    expect(narrowed.days).toBe(194);
  });

  it("keeps the sentinel window when there is no dated data", () => {
    const range = resolveTimeRange("all", TODAY);
    expect(narrowAllTimeRange(range, { earliest: null, latest: null })).toEqual(range);
  });

  it("leaves an explicit selection alone", () => {
    const range = resolveTimeRange("30d", TODAY);
    expect(
      narrowAllTimeRange(range, { earliest: "2020-01-01", latest: "2020-12-31" }),
    ).toEqual(range);
  });
});

describe("custom range", () => {
  it("uses the picked bounds and reports their real day count", () => {
    expect(
      resolveSelectedTimeRange("custom", { from: "2026-03-01", to: "2026-03-31" }),
    ).toMatchObject({ id: "custom", from: "2026-03-01", to: "2026-03-31", days: 31 });
  });

  it("orders inverted bounds rather than rejecting them", () => {
    expect(
      resolveSelectedTimeRange("custom", { from: "2026-03-31", to: "2026-03-01" }),
    ).toMatchObject({ from: "2026-03-01", to: "2026-03-31" });
  });

  it("falls back to a preset when the bounds are missing or malformed", () => {
    expect(resolveSelectedTimeRange("custom", null).id).toBe("custom");
    expect(resolveSelectedTimeRange("custom", { from: "", to: "" }).days).toBe(1);
    expect(
      resolveSelectedTimeRange("custom", { from: "2026-02-30", to: "2026-03-01" }).days,
    ).toBe(1);
  });

  it("survives the query string round trip with its bounds intact", () => {
    const resolved = resolveSelectedTimeRange("custom", {
      from: "2026-03-01",
      to: "2026-03-31",
    });
    const parsed = parseTimeRangeQuery(
      new URLSearchParams(`${timeRangeQueryString(resolved)}&range=custom`),
    );
    expect(parsed).toMatchObject({ from: "2026-03-01", to: "2026-03-31", days: 31 });
  });
});

describe("out-of-range reporting", () => {
  const coverage = {
    totalRows: 4203,
    datedRows: 3987,
    inRange: 0,
    beforeRange: 3000,
    afterRange: 987,
    undated: 216,
    earliest: "2025-06-11",
    latest: "2025-12-21",
  };

  it("counts dated and undated items the window cannot show", () => {
    expect(countOutsideRange(coverage)).toEqual({
      total: 4203,
      dated: 3987,
      undated: 216,
    });
  });

  it("reports nothing outside the range when the window holds everything", () => {
    expect(
      countOutsideRange({ ...coverage, beforeRange: 0, afterRange: 0, undated: 0 }),
    ).toEqual({ total: 0, dated: 0, undated: 0 });
  });
});

describe("parseTimeRangeQuery", () => {
  const params = (query: string) => new URLSearchParams(query);

  it("uses the supplied bounds and echoes the preset id", () => {
    const range = parseTimeRangeQuery(
      params("from=2026-01-01&to=2026-03-31&range=90d"),
    );
    expect(range).toMatchObject({
      id: "90d",
      from: "2026-01-01",
      to: "2026-03-31",
      days: 90,
    });
  });

  it("derives the day count from the bounds", () => {
    expect(parseTimeRangeQuery(params("from=2026-09-01&to=2026-09-07")).days).toBe(7);
  });

  it("falls back to the default preset when bounds are missing", () => {
    const range = parseTimeRangeQuery(params(""));
    expect(range.id).toBe(DEFAULT_TIME_RANGE_ID);
    expect(range.days).toBe(7);
  });

  it("rejects malformed or inverted bounds instead of widening the scan", () => {
    const fallback = resolveTimeRange(DEFAULT_TIME_RANGE_ID, new Date());
    for (const query of [
      "from=nope&to=2026-09-07",
      "from=2026-09-07",
      "from=2026-02-30&to=2026-09-07",
      "from=2026-09-07&to=2026-09-01",
    ]) {
      const range = parseTimeRangeQuery(params(query));
      expect(range.days).toBe(7);
      expect(range.to).toBe(fallback.to);
    }
  });

  it("ignores an unknown range id but keeps valid bounds", () => {
    const range = parseTimeRangeQuery(
      params("from=2026-09-01&to=2026-09-07&range=quarter"),
    );
    expect(range.id).toBe(DEFAULT_TIME_RANGE_ID);
    expect(range.from).toBe("2026-09-01");
  });

  it("round-trips through the query string it produces", () => {
    const resolved = resolveTimeRange("30d", TODAY);
    const query = timeRangeQueryString(resolved);
    expect(parseTimeRangeQuery(params(`${query}&range=30d`))).toEqual(resolved);
  });
});

describe("date keys and timestamp bounds", () => {
  it("validates date keys", () => {
    expect(isDateKey("2026-09-24")).toBe(true);
    expect(isDateKey("2026-9-24")).toBe(false);
    expect(isDateKey("2026-02-30")).toBe(false);
    expect(isDateKey(undefined)).toBe(false);
  });

  it("builds inclusive UTC bounds for timestamp columns", () => {
    expect(
      toTimestampBounds({ from: "2026-09-01", to: "2026-09-07" }),
    ).toEqual({
      fromIso: "2026-09-01T00:00:00.000Z",
      toIso: "2026-09-07T23:59:59.999Z",
    });
  });
});

describe("volume buckets", () => {
  it("widens granularity with the window", () => {
    expect(pickVolumeGranularity(1)).toBe("day");
    expect(pickVolumeGranularity(30)).toBe("day");
    expect(pickVolumeGranularity(90)).toBe("week");
    expect(pickVolumeGranularity(120)).toBe("week");
    expect(pickVolumeGranularity(185)).toBe("month");
    expect(pickVolumeGranularity(366)).toBe("month");
  });

  it("zero-fills every day in a short range", () => {
    const buckets = buildVolumeBuckets(
      new Date(2026, 8, 18),
      new Date(2026, 8, 24),
      "day",
    );
    expect(buckets.size).toBe(7);
    expect([...buckets.keys()]).toEqual([
      "2026-09-18",
      "2026-09-19",
      "2026-09-20",
      "2026-09-21",
      "2026-09-22",
      "2026-09-23",
      "2026-09-24",
    ]);
  });

  it("groups a 90 day range into week buckets", () => {
    const buckets = buildVolumeBuckets(
      new Date(2026, 5, 27),
      new Date(2026, 8, 24),
      "week",
    );
    expect(buckets.size).toBe(14);
    expect([...buckets.values()][0].label).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/);
  });

  /**
   * Weeks start on SUNDAY here. The SQL migration subtracts a day from
   * date_trunc('week', ...) precisely because Postgres returns the ISO Monday,
   * and if these two ever disagree again every weekly bucket renders as zero.
   */
  it("anchors week buckets to Sunday, matching the SQL side", () => {
    const buckets = buildVolumeBuckets(
      new Date(2026, 5, 27),
      new Date(2026, 8, 24),
      "week",
    );
    const keys = [...buckets.keys()];
    for (const key of keys) {
      // getDay() === 0 is Sunday.
      expect(new Date(`${key}T00:00:00`).getDay()).toBe(0);
    }
    expect(keys[0]).toBe("2026-06-21");
  });

  it("groups a 1 year range into month buckets", () => {
    const buckets = buildVolumeBuckets(
      new Date(2025, 8, 24),
      new Date(2026, 8, 24),
      "month",
    );
    const values = [...buckets.values()];
    expect(values).toHaveLength(13);
    expect(values[0].key).toBe("2025-09");
    expect(values[12].key).toBe("2026-09");
  });

  it("does not create stray buckets for rows outside the window", () => {
    const buckets = buildVolumeBuckets(
      new Date(2026, 8, 20),
      new Date(2026, 8, 24),
      "day",
    );
    expect(buckets.size).toBe(5);
    expect([...buckets.values()].every((b) => b.jobs === 0)).toBe(true);
  });
});
