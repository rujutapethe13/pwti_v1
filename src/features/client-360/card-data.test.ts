import { describe, expect, it } from "vitest";

import {
  DELIVERY_TARGET_DAYS,
  formatDateUI,
  isPracticeBoard,
  normalizeLabel,
  parseNumber,
  parseStatus,
  statusBucket,
} from "./card-types";

describe("statusBucket", () => {
  it("maps done-like statuses to Done", () => {
    expect(statusBucket("Done")).toBe("Done");
    expect(statusBucket("Completed")).toBe("Done");
    expect(statusBucket("Delivered")).toBe("Done");
    expect(statusBucket("Approved")).toBe("Done");
  });

  it("maps in-progress-like statuses to In progress", () => {
    expect(statusBucket("In progress")).toBe("In progress");
    expect(statusBucket("Active")).toBe("In progress");
    expect(statusBucket("Started")).toBe("In progress");
  });

  it("maps waiting-like statuses to Waiting", () => {
    expect(statusBucket("Pending")).toBe("Waiting");
    expect(statusBucket("Not started")).toBe("Waiting");
    expect(statusBucket("Todo")).toBe("Waiting");
  });

  it("treats empty and unknown as Unknown", () => {
    expect(statusBucket("")).toBe("Unknown");
    expect(statusBucket("Unspecified")).toBe("Unknown");
    expect(statusBucket("Weird status")).toBe("Unknown");
  });
});

describe("formatDateUI", () => {
  it("formats as '17 Nov 2026'", () => {
    expect(formatDateUI("2026-11-17")).toBe("17 Nov 2026");
  });

  it("returns empty for null/undefined/bad input", () => {
    expect(formatDateUI(null)).toBe("");
    expect(formatDateUI(undefined)).toBe("");
    expect(formatDateUI("")).toBe("");
    expect(formatDateUI("not-a-date")).toBe("");
  });
});

describe("isPracticeBoard", () => {
  it("detects practice boards case-insensitively", () => {
    expect(isPracticeBoard("Practice")).toBe(true);
    expect(isPracticeBoard("practice board")).toBe(true);
    expect(isPracticeBoard("PRACTICE")).toBe(true);
  });

  it("does not flag real boards", () => {
    expect(isPracticeBoard("Levis June")).toBe(false);
    expect(isPracticeBoard("Safari")).toBe(false);
  });
});

describe("normalizeLabel", () => {
  it("collapses whitespace and lowercases", () => {
    expect(normalizeLabel("No. of  SKUS")).toBe("no. of skus");
    expect(normalizeLabel("  Receive Date  ")).toBe("receive date");
    expect(normalizeLabel("Batch Job ID")).toBe("batch job id");
  });
});

describe("parseNumber", () => {
  it("parses plain numbers and strings", () => {
    expect(parseNumber(5, null)).toBe(5);
    expect(parseNumber("12", null)).toBe(12);
    expect(parseNumber("1,234.50", null)).toBe(1234.5);
  });

  it("returns null for missing/unparseable", () => {
    expect(parseNumber(null, null)).toBe(null);
    expect(parseNumber(undefined, null)).toBe(null);
    expect(parseNumber("", null)).toBe(null);
    expect(parseNumber("n/a", null)).toBe(null);
  });
});

describe("parseStatus", () => {
  it("returns trimmed text, defaulting missing to 'Unspecified'", () => {
    expect(parseStatus(" Done ", null)).toBe("Done");
    expect(parseStatus(null, null)).toBe("Unspecified");
    expect(parseStatus(undefined, null)).toBe("Unspecified");
  });
});

describe("DELIVERY_TARGET_DAYS", () => {
  it("defaults to 2 days", () => {
    expect(DELIVERY_TARGET_DAYS).toBe(2);
  });
});
