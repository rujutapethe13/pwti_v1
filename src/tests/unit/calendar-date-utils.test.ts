import { describe, it, expect } from "vitest";
import {
  parseCalendarDate,
  startOfLocalDay,
  toDayKey,
} from "@/features/boards/engine/view-engine/views/calendar-date-utils";

/**
 * The calendar renders LOCAL dates. A row dated 2026-01-29 must never
 * drift onto 2026-01-30 because of a UTC offset, so these tests assert
 * the calendar day, not the instant.
 */
describe("parseCalendarDate", () => {
  it("parses an ISO date as a local calendar day", () => {
    const parsed = parseCalendarDate("2026-01-29");
    expect(parsed).not.toBeNull();
    expect(parsed?.getFullYear()).toBe(2026);
    expect(parsed?.getMonth()).toBe(0);
    expect(parsed?.getDate()).toBe(29);
    expect(parsed?.getHours()).toBe(0);
  });

  it("ignores the time part of an ISO timestamp", () => {
    const parsed = parseCalendarDate("2026-01-29T23:30:00.000Z");
    expect(toDayKey(parsed!)).toBe("2026-01-29");
  });

  it("parses DD/MM/YYYY", () => {
    const parsed = parseCalendarDate("29/01/2026");
    expect(toDayKey(parsed!)).toBe("2026-01-29");
  });

  it("parses DD-MM-YYYY and DD.MM.YYYY", () => {
    expect(toDayKey(parseCalendarDate("29-01-2026")!)).toBe("2026-01-29");
    expect(toDayKey(parseCalendarDate("29.01.2026")!)).toBe("2026-01-29");
  });

  it("parses a Date object as a local day", () => {
    const parsed = parseCalendarDate(new Date(2026, 0, 29, 18, 45));
    expect(toDayKey(parsed!)).toBe("2026-01-29");
  });

  it("parses an epoch number as a local day", () => {
    const parsed = parseCalendarDate(new Date(2026, 0, 29).getTime());
    expect(toDayKey(parsed!)).toBe("2026-01-29");
  });

  it("returns null for empty values", () => {
    expect(parseCalendarDate(null)).toBeNull();
    expect(parseCalendarDate(undefined)).toBeNull();
    expect(parseCalendarDate("")).toBeNull();
    expect(parseCalendarDate("   ")).toBeNull();
  });

  it("returns null for impossible calendar dates", () => {
    expect(parseCalendarDate("2026-02-31")).toBeNull();
    expect(parseCalendarDate("2026-13-01")).toBeNull();
    expect(parseCalendarDate("31/02/2026")).toBeNull();
  });

  it("returns null instead of throwing on garbage input", () => {
    expect(parseCalendarDate("not a date")).toBeNull();
    expect(parseCalendarDate(new Date("nope"))).toBeNull();
    expect(parseCalendarDate({})).toBeNull();
    expect(parseCalendarDate(Number.NaN)).toBeNull();
  });

  it("does not roll a date into the next day near midnight", () => {
    // 2026-01-29T23:30Z in a UTC+2 timezone is already the 30th locally,
    // but the calendar shows the day the user typed, so the ISO date
    // part always wins.
    expect(toDayKey(parseCalendarDate("2026-01-29T23:30:00.000Z")!)).toBe("2026-01-29");
  });
});

describe("toDayKey", () => {
  it("pads month and day", () => {
    expect(toDayKey(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("round-trips through parseCalendarDate", () => {
    const key = "2026-10-21";
    expect(toDayKey(parseCalendarDate(key)!)).toBe(key);
  });
});

describe("startOfLocalDay", () => {
  it("clears the time component", () => {
    const result = startOfLocalDay(new Date(2026, 9, 21, 23, 59, 59, 999));
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
    expect(result.getSeconds()).toBe(0);
    expect(result.getMilliseconds()).toBe(0);
  });
});
