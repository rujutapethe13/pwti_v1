import { describe, expect, it } from "vitest";
import { isEmptyDateValue, isValidDateString, normalizeDateToYmd } from "@/features/automations/date-utils";

describe("date-utils (upload date automation)", () => {
  describe("isEmptyDateValue", () => {
    it("treats null, undefined, blank, whitespace and placeholders as empty", () => {
      expect(isEmptyDateValue(null)).toBe(true);
      expect(isEmptyDateValue(undefined)).toBe(true);
      expect(isEmptyDateValue("")).toBe(true);
      expect(isEmptyDateValue("   ")).toBe(true);
      expect(isEmptyDateValue("dd-mm-yyyy")).toBe(true);
      expect(isEmptyDateValue("yyyy-mm-dd")).toBe(true);
      expect(isEmptyDateValue("DD-MM-YYYY")).toBe(true);
    });
    it("treats a real date as not empty", () => {
      expect(isEmptyDateValue("2026-01-05")).toBe(false);
      expect(isEmptyDateValue("05-01-2026")).toBe(false);
    });
  });

  describe("isValidDateString", () => {
    it("accepts ISO, dash and slash date inputs", () => {
      expect(isValidDateString("2026-01-05")).toBe(true);
      expect(isValidDateString("05-01-2026")).toBe(true);
      expect(isValidDateString("5/1/2026")).toBe(true);
      expect(isValidDateString(" 2026-01-05 ")).toBe(true);
    });
    it("rejects placeholders and invalid input", () => {
      expect(isValidDateString("dd-mm-yyyy")).toBe(false);
      expect(isValidDateString("abc")).toBe(false);
      expect(isValidDateString(null)).toBe(false);
      expect(isValidDateString(undefined)).toBe(false);
      expect(isValidDateString("")).toBe(false);
    });
    it("rejects epoch sentinel years", () => {
      expect(isValidDateString("1970-01-01")).toBe(false);
      expect(isValidDateString("0001-01-01")).toBe(false);
    });
    it("leniently parses rollover dates via JS Date (not Invalid Date)", () => {
      expect(isValidDateString("31 Feb 2026")).toBe(true);
      expect(normalizeDateToYmd("31 Feb 2026")).toBe("2026-03-03");
    });
  });

  describe("normalizeDateToYmd", () => {
    it("normalizes all accepted inputs to canonical ymd", () => {
      expect(normalizeDateToYmd("2026-01-05")).toBe("2026-01-05");
      expect(normalizeDateToYmd("05-01-2026")).toBe("2026-01-05");
      expect(normalizeDateToYmd("5/1/2026")).toBe("2026-01-05");
    });
    it("returns null for empty / invalid values", () => {
      expect(normalizeDateToYmd(null)).toBeNull();
      expect(normalizeDateToYmd("dd-mm-yyyy")).toBeNull();
      expect(normalizeDateToYmd("abc")).toBeNull();
    });
  });
});
