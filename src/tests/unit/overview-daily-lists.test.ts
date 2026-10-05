import { describe, expect, it } from "vitest";

import {
  addDays,
  buildBoardHref,
  businessToday,
  isDailyListPanelId,
  matchPanel,
  matchedDateFields,
  readDayKey,
  sortPanelItems,
  UPCOMING_HORIZON_DAYS,
  type DailyListItem,
  type DailyListSnapshotRow,
} from "@/features/overview/daily-lists";
import { toDateKey } from "@/features/overview/time-range";

const TODAY = "2026-09-24";
const HORIZON = "2026-10-01"; // today + 7

function row(overrides: Partial<DailyListSnapshotRow> = {}): DailyListSnapshotRow {
  return {
    record_id: "rec-1",
    board_id: "board-1",
    workspace_id: "ws-1",
    job_date: null,
    due_date: null,
    status: "In progress",
    is_pending: true,
    ...overrides,
  };
}

function item(
  overrides: Partial<DailyListItem> & Pick<DailyListItem, "record_id">,
): DailyListItem {
  return {
    item_name: overrides.record_id,
    status: null,
    job_date: null,
    due_date: null,
    matched: [],
    board_id: "board-1",
    board_name: "Studio Board",
    board_slug: "studio-board",
    workspace_id: "ws-1",
    workspace_name: "Powerweave",
    href: "/studio-board",
    ...overrides,
  };
}

describe("daily list windows", () => {
  it("puts the upcoming horizon 7 days out, inclusive", () => {
    const today = businessToday(new Date(2026, 8, 24, 15, 30));
    expect(UPCOMING_HORIZON_DAYS).toBe(7);
    expect(toDateKey(addDays(today, UPCOMING_HORIZON_DAYS))).toBe(HORIZON);
  });

  it("anchors to the local calendar day, not the UTC one", () => {
    const late = businessToday(new Date(2026, 8, 24, 23, 59));
    expect(toDateKey(late)).toBe(TODAY);
  });

  it("only accepts real YYYY-MM-DD day keys", () => {
    expect(readDayKey("2026-09-24")).toBe("2026-09-24");
    expect(readDayKey(" 2026-09-24 ")).toBe("2026-09-24");
    expect(readDayKey("24-09-2026")).toBeNull();
    expect(readDayKey("2026-13-01")).toBeNull();
    expect(readDayKey("")).toBeNull();
    expect(readDayKey(null)).toBeNull();
  });
});

describe("matchPanel", () => {
  it("puts a job created today in Today's jobs", () => {
    expect(matchPanel(row({ job_date: TODAY }), TODAY, HORIZON)).toBe("today");
    expect(matchedDateFields(row({ job_date: TODAY }), TODAY)).toEqual(["job_date"]);
  });

  it("puts a job due today in Today's jobs, and reports both reasons", () => {
    const both = row({ job_date: TODAY, due_date: TODAY });
    expect(matchPanel(both, TODAY, HORIZON)).toBe("today");
    expect(matchedDateFields(both, TODAY)).toEqual(["job_date", "due_date"]);
  });

  it("includes completed jobs in Today's jobs, which is not status filtered", () => {
    expect(
      matchPanel(row({ job_date: TODAY, is_pending: false }), TODAY, HORIZON),
    ).toBe("today");
  });

  it("keeps a job that is both due today and still open out of Overdue", () => {
    expect(matchPanel(row({ due_date: TODAY }), TODAY, HORIZON)).toBe("today");
  });

  it("puts a past due date that is not complete in Overdue", () => {
    expect(
      matchPanel(row({ due_date: "2026-09-20" }), TODAY, HORIZON),
    ).toBe("overdue");
  });

  it("excludes a past due date that is complete", () => {
    expect(
      matchPanel(row({ due_date: "2026-09-20", is_pending: false }), TODAY, HORIZON),
    ).toBeNull();
  });

  it("excludes a past due date whose status is unknown", () => {
    expect(matchPanel(row({ due_date: "2026-09-20", is_pending: null }), TODAY, HORIZON)).toBeNull();
  });

  it("includes tomorrow through the 7th day in Upcoming", () => {
    expect(matchPanel(row({ due_date: "2026-09-25" }), TODAY, HORIZON)).toBe("upcoming");
    expect(matchPanel(row({ due_date: HORIZON }), TODAY, HORIZON)).toBe("upcoming");
  });

  it("excludes the 8th day and anything beyond the horizon", () => {
    expect(matchPanel(row({ due_date: "2026-10-02" }), TODAY, HORIZON)).toBeNull();
  });

  it("excludes a job inside the horizon that is complete", () => {
    expect(
      matchPanel(row({ due_date: "2026-09-28", is_pending: false }), TODAY, HORIZON),
    ).toBeNull();
  });

  it("excludes a job with no dates at all", () => {
    expect(matchPanel(row(), TODAY, HORIZON)).toBeNull();
  });

  it("ignores malformed dates rather than treating them as past", () => {
    expect(matchPanel(row({ due_date: "20/09/2026" }), TODAY, HORIZON)).toBeNull();
  });
});

describe("sortPanelItems", () => {
  it("lists the most overdue first", () => {
    const sorted = sortPanelItems(
      [
        item({ record_id: "b", due_date: "2026-09-22" }),
        item({ record_id: "a", due_date: "2026-09-10" }),
        item({ record_id: "c", due_date: "2026-09-18" }),
      ],
      "overdue",
    );
    expect(sorted.map((i) => i.record_id)).toEqual(["a", "c", "b"]);
  });

  it("lists the soonest upcoming first", () => {
    const sorted = sortPanelItems(
      [
        item({ record_id: "late", due_date: HORIZON }),
        item({ record_id: "soon", due_date: "2026-09-25" }),
      ],
      "upcoming",
    );
    expect(sorted.map((i) => i.record_id)).toEqual(["soon", "late"]);
  });

  it("puts jobs due today above jobs merely received today", () => {
    const sorted = sortPanelItems(
      [
        item({ record_id: "received", job_date: TODAY, matched: ["job_date"] }),
        item({ record_id: "due", due_date: TODAY, matched: ["due_date"] }),
      ],
      "today",
    );
    expect(sorted.map((i) => i.record_id)).toEqual(["due", "received"]);
  });

  it("does not mutate the input", () => {
    const input = [item({ record_id: "b", due_date: "2026-09-10" }), item({ record_id: "a", due_date: "2026-09-11" })];
    sortPanelItems(input, "overdue");
    expect(input.map((i) => i.record_id)).toEqual(["b", "a"]);
  });
});

describe("board links", () => {
  it("links by slug and falls back to the board id", () => {
    expect(buildBoardHref("jobs-board", "board-1")).toBe("/jobs-board");
    expect(buildBoardHref("", "board-1")).toBe("/board-1");
  });

  it("escapes a slug that is not URL safe", () => {
    expect(buildBoardHref("my board", "board-1")).toBe("/my%20board");
  });
});

describe("isDailyListPanelId", () => {
  it("accepts only the three panels", () => {
    expect(isDailyListPanelId("today")).toBe(true);
    expect(isDailyListPanelId("overdue")).toBe(true);
    expect(isDailyListPanelId("upcoming")).toBe(true);
    expect(isDailyListPanelId("yesterday")).toBe(false);
    expect(isDailyListPanelId(null)).toBe(false);
    expect(isDailyListPanelId(7)).toBe(false);
  });
});
