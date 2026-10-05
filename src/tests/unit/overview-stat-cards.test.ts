import { describe, expect, it } from "vitest";

import {
  NO_COMPLETED_DATE_REASON,
  buildCountTrend,
  buildStatCards,
  type PeriodAggregate,
  type PeriodComparison,
  type StatCardsResult,
} from "@/features/overview/stat-cards";
import { priorPeriod, resolveTimeRange } from "@/features/overview/time-range";

const RANGE: StatCardsResult["range"] = {
  id: "7d",
  label: "Last 7 days",
  from: "2026-09-18",
  to: "2026-09-24",
  days: 7,
  priorFrom: "2026-09-11",
  priorTo: "2026-09-17",
};

function window(overrides: Partial<PeriodAggregate> = {}): PeriodAggregate {
  return {
    recordsInWindow: 0,
    jobsReceived: 0,
    clientsActive: 0,
    boardsTouched: 0,
    completedByStatus: 0,
    jobsCompleted: 0,
    receivedTimestamps: 0,
    completedTimestamps: 0,
    turnaroundSample: 0,
    turnaroundAvgDays: null,
    completedDateAvailable: false,
    busiestClient: null,
    ...overrides,
  };
}

function comparison(
  current: Partial<PeriodAggregate>,
  prior: Partial<PeriodAggregate> = {},
  currentTopClientPriorCount = 0,
): PeriodComparison {
  return {
    current: window(current),
    prior: window(prior),
    currentTopClientPriorCount,
  };
}

function card(result: StatCardsResult, id: string) {
  const found = result.cards.find((c) => c.id === id);
  if (!found) throw new Error(`card ${id} missing`);
  return found;
}

describe("prior period", () => {
  it("is the equal-length window immediately before the selection", () => {
    expect(priorPeriod({ from: "2026-09-18", days: 7 })).toEqual({
      from: "2026-09-11",
      to: "2026-09-17",
    });
    expect(priorPeriod({ from: "2026-09-24", days: 1 })).toEqual({
      from: "2026-09-23",
      to: "2026-09-23",
    });
    expect(priorPeriod({ from: "2026-03-01", days: 31 })).toEqual({
      from: "2026-01-29",
      to: "2026-02-28",
    });
  });

  it("never overlaps the selected window", () => {
    const range = resolveTimeRange("30d", new Date(2026, 8, 24));
    const prior = priorPeriod(range);
    expect(prior.to < range.from).toBe(true);
    expect(range.days).toBe(30);
  });
});

describe("buildCountTrend", () => {
  it("reports a real percentage when a prior baseline exists", () => {
    const trend = buildCountTrend(12, 8, { days: 7 });
    expect(trend.direction).toBe("up");
    expect(trend.sentiment).toBe("good");
    expect(trend.percentChange).toBe(50);
    expect(trend.absoluteChange).toBe(4);
    expect(trend.label).toBe("↑ 12 vs 8 in the prior 7 days");
  });

  it("never fabricates a percentage when the prior window is zero", () => {
    const trend = buildCountTrend(5, 0, { days: 7 });
    expect(trend.percentChange).toBeNull();
    expect(trend.direction).toBe("up");
    // The comparison is still stated, using the real prior count of 0.
    expect(trend.label).toBe("↑ 5 vs 0 in the prior 7 days");
  });

  it("reports zero in both windows as flat, not as a missing comparison", () => {
    const trend = buildCountTrend(0, 0, { days: 30 });
    expect(trend.direction).toBe("flat");
    expect(trend.sentiment).toBe("neutral");
    expect(trend.percentChange).toBeNull();
    expect(trend.label).toBe("0 vs 0 in the prior 30 days");
  });

  it("marks a decrease as bad by default and as good when lower is better", () => {
    expect(buildCountTrend(3, 9, { days: 7 }).sentiment).toBe("bad");
    expect(
      buildCountTrend(3, 9, { days: 7, lowerIsBetter: true }).sentiment,
    ).toBe("good");
  });

  it("marks a structurally absent baseline as unavailable", () => {
    const trend = buildCountTrend(4, null, { days: 7 });
    expect(trend.direction).toBe("unavailable");
    expect(trend.sentiment).toBe("neutral");
    expect(trend.percentChange).toBeNull();
  });

  it("uses singular wording for a single day", () => {
    expect(buildCountTrend(2, 1, { days: 1 }).label).toContain("prior 1 day");
  });
});

describe("buildStatCards", () => {
  it("builds all six cards from the two windows", () => {
    const result = buildStatCards(
      comparison(
        {
          recordsInWindow: 40,
          jobsReceived: 40,
          clientsActive: 6,
          boardsTouched: 3,
          completedByStatus: 12,
          jobsCompleted: 10,
          receivedTimestamps: 40,
          completedTimestamps: 10,
          turnaroundSample: 10,
          turnaroundAvgDays: 3.25,
          completedDateAvailable: true,
          busiestClient: { clientId: "c1", name: "Acme", count: 14 },
        },
        {
          recordsInWindow: 30,
          jobsReceived: 30,
          clientsActive: 5,
          boardsTouched: 2,
          completedByStatus: 8,
          jobsCompleted: 6,
          receivedTimestamps: 30,
          completedTimestamps: 6,
          turnaroundSample: 6,
          turnaroundAvgDays: 4,
          completedDateAvailable: true,
        },
        11,
      ),
      RANGE,
    );

    expect(result.cards.map((c) => c.id)).toEqual([
      "jobsReceived",
      "jobsCompleted",
      "clientsActive",
      "boardsTouched",
      "busiestClient",
      "avgTurnaround",
    ]);
    expect(result.isEmpty).toBe(false);

    expect(card(result, "jobsReceived").value).toBe("40");
    expect(card(result, "jobsReceived").trend.label).toBe(
      "↑ 40 vs 30 in the prior 7 days",
    );
    expect(card(result, "jobsCompleted").value).toBe("10");
    expect(card(result, "clientsActive").value).toBe("6");
    expect(card(result, "boardsTouched").value).toBe("3");
    expect(card(result, "busiestClient").value).toBe("14");
    expect(card(result, "busiestClient").detail).toBe("Acme");
    expect(card(result, "busiestClient").trend.label).toBe(
      "↑ 14 vs 11 in the prior 7 days",
    );
    expect(card(result, "avgTurnaround").value).toBe("3.3d");
    expect(card(result, "avgTurnaround").caption).toContain("10 jobs");
  });

  it("marks the window empty only when it holds no records at all", () => {
    expect(
      buildStatCards(comparison({ recordsInWindow: 0 }), RANGE).isEmpty,
    ).toBe(true);
    expect(
      buildStatCards(
        comparison({ recordsInWindow: 1, jobsReceived: 1 }),
        RANGE,
      ).isEmpty,
    ).toBe(false);
  });

  describe("jobs completed", () => {
    it("counts completion dates when the board supplies them", () => {
      const result = buildStatCards(
        comparison(
          {
            recordsInWindow: 10,
            jobsReceived: 10,
            jobsCompleted: 4,
            completedByStatus: 9,
            completedDateAvailable: true,
          },
          { recordsInWindow: 5, jobsReceived: 5, jobsCompleted: 2, completedByStatus: 4, completedDateAvailable: true },
        ),
        RANGE,
      );
      const completed = card(result, "jobsCompleted");
      expect(completed.value).toBe("4");
      expect(completed.caption).toBe("Jobs with a completion date in this period");
      expect(completed.trend.label).toBe("↑ 4 vs 2 in the prior 7 days");
    });

    it("falls back to completed status and says so when no completion dates exist", () => {
      const result = buildStatCards(
        comparison(
          { recordsInWindow: 10, jobsReceived: 10, completedByStatus: 9 },
          { recordsInWindow: 5, jobsReceived: 5, completedByStatus: 4 },
        ),
        RANGE,
      );
      const completed = card(result, "jobsCompleted");
      expect(completed.value).toBe("9");
      expect(completed.caption).toContain("no completion dates exist");
      expect(completed.trend.label).toBe("↑ 9 vs 4 in the prior 7 days");
    });
  });

  describe("busiest client", () => {
    it("falls back to an id fragment when the canonical name is missing", () => {
      const result = buildStatCards(
        comparison({
          recordsInWindow: 1,
          jobsReceived: 1,
          busiestClient: { clientId: "abcdef123456", name: null, count: 1 },
        }),
        RANGE,
      );
      expect(card(result, "busiestClient").detail).toBe("Client abcdef12");
    });

    it("reports unavailable rather than inventing a client", () => {
      const result = buildStatCards(
        comparison({ recordsInWindow: 3, jobsReceived: 3 }),
        RANGE,
      );
      const busiest = card(result, "busiestClient");
      expect(busiest.unavailable).toBe(true);
      expect(busiest.value).toBe("");
      expect(busiest.unavailableReason).toBe(
        "No job in this period is attributed to a client.",
      );
    });
  });

  describe("avg. turnaround", () => {
    it("is skipped with a reason when no completion timestamps exist", () => {
      const result = buildStatCards(
        comparison({ recordsInWindow: 8, jobsReceived: 8, completedByStatus: 3 }),
        RANGE,
      );
      const turnaround = card(result, "avgTurnaround");
      expect(turnaround.unavailable).toBe(true);
      expect(turnaround.value).toBe("");
      expect(turnaround.unavailableReason).toBe(NO_COMPLETED_DATE_REASON);
      expect(turnaround.trend.direction).toBe("unavailable");
      expect(turnaround.trend.label).toBe("Turnaround not measurable");
    });

    it("is skipped when completion dates exist but no job in the window has both", () => {
      const result = buildStatCards(
        comparison({
          recordsInWindow: 8,
          jobsReceived: 8,
          completedDateAvailable: true,
          completedTimestamps: 0,
          turnaroundSample: 0,
        }),
        RANGE,
      );
      const turnaround = card(result, "avgTurnaround");
      expect(turnaround.unavailable).toBe(true);
      expect(turnaround.unavailableReason).toBe(
        "No job in this period has both a received and a completion date.",
      );
    });

    it("shows the value but no trend when the prior window has no comparable job", () => {
      const result = buildStatCards(
        comparison(
          {
            recordsInWindow: 8,
            jobsReceived: 8,
            completedDateAvailable: true,
            completedTimestamps: 4,
            turnaroundSample: 4,
            turnaroundAvgDays: 2.5,
          },
          { recordsInWindow: 6, jobsReceived: 6, completedDateAvailable: true, turnaroundSample: 0 },
        ),
        RANGE,
      );
      const turnaround = card(result, "avgTurnaround");
      expect(turnaround.unavailable).toBe(false);
      expect(turnaround.value).toBe("2.5d");
      expect(turnaround.trend.direction).toBe("unavailable");
      expect(turnaround.trend.label).toBe(
        "No job in the prior period has both dates, so there is nothing to compare against.",
      );
      expect(turnaround.trend.percentChange).toBeNull();
    });

    it("treats a shorter turnaround as an improvement", () => {
      const result = buildStatCards(
        comparison(
          {
            recordsInWindow: 8,
            jobsReceived: 8,
            completedDateAvailable: true,
            turnaroundSample: 4,
            turnaroundAvgDays: 2.5,
          },
          {
            recordsInWindow: 8,
            jobsReceived: 8,
            completedDateAvailable: true,
            turnaroundSample: 4,
            turnaroundAvgDays: 4,
          },
        ),
        RANGE,
      );
      const trend = card(result, "avgTurnaround").trend;
      expect(trend.direction).toBe("down");
      expect(trend.sentiment).toBe("good");
      expect(trend.absoluteChange).toBe(-1.5);
      expect(trend.label).toBe("↓ 2.5 vs 4 in the prior 7 days");
    });

    it("never reports a percentage for turnaround when the prior average is zero", () => {
      const result = buildStatCards(
        comparison(
          {
            recordsInWindow: 8,
            jobsReceived: 8,
            completedDateAvailable: true,
            turnaroundSample: 4,
            turnaroundAvgDays: 0,
          },
          {
            recordsInWindow: 8,
            jobsReceived: 8,
            completedDateAvailable: true,
            turnaroundSample: 4,
            turnaroundAvgDays: 0,
          },
        ),
        RANGE,
      );
      expect(card(result, "avgTurnaround").trend.percentChange).toBeNull();
    });
  });
});
