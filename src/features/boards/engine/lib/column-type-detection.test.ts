import { describe, expect, it } from "vitest";

import type { ColumnValue } from "@/features/boards/engine/types";
import {
  detectAllColumnTypes,
  detectColumnType,
  formatCellByColumnType,
  formatDateValue,
} from "@/features/boards/engine/lib/column-type-detection";

describe("detectColumnType", () => {
  it("detects ISO date columns as date", () => {
    const values: ColumnValue[] = [
      "2026-01-15",
      "2026-02-20",
      "2026-03-10",
      "2026-04-05",
    ];
    const result = detectColumnType(values);
    expect(result.type).toBe("date");
    expect(result.confidence).toBe("high");
  });

  it("detects dd/mm/yyyy date strings as date", () => {
    const values: ColumnValue[] = ["01/09/2026", "15/03/2026", "25/12/2026"];
    const result = detectColumnType(values);
    expect(result.type).toBe("date");
  });

  it("detects month-name dates as date", () => {
    const values: ColumnValue[] = ["Jan 5 2026", "Feb 10 2026", "Mar 15 2026"];
    const result = detectColumnType(values);
    expect(result.type).toBe("date");
  });

  it("detects pure numeric columns as number", () => {
    const values: ColumnValue[] = [1, 2, 3, 100, 50];
    const result = detectColumnType(values);
    expect(result.type).toBe("number");
  });

  it("detects number strings as number", () => {
    const values: ColumnValue[] = ["42", "17", "8", "100", "3"];
    const result = detectColumnType(values);
    expect(result.type).toBe("number");
  });

  it("detects currency-looking values as currency", () => {
    const values: ColumnValue[] = ["$1,234.50", "$500.00", "$99.99", "$10,000.00"];
    const result = detectColumnType(values);
    expect(result.type).toBe("currency");
  });

  it("detects email columns", () => {
    const values: ColumnValue[] = [
      "alice@example.com",
      "bob@example.com",
      "charlie@example.com",
    ];
    const result = detectColumnType(values);
    expect(result.type).toBe("email");
  });

  it("detects URL columns", () => {
    const values: ColumnValue[] = [
      "https://example.com",
      "https://google.com",
      "https://github.com",
    ];
    const result = detectColumnType(values);
    expect(result.type).toBe("url");
  });

  it("detects phone columns", () => {
    const values: ColumnValue[] = ["+1 555-1234", "+1 555-5678", "+1 555-9012"];
    const result = detectColumnType(values);
    expect(result.type).toBe("phone");
  });

  it("detects boolean-ish columns as checkbox", () => {
    const values: ColumnValue[] = ["yes", "no", "yes", "no", "yes"];
    const result = detectColumnType(values);
    expect(result.type).toBe("checkbox");
  });

  it("detects short repeated values as status", () => {
    const values: ColumnValue[] = [
      "Not Started",
      "Working on it",
      "Done",
      "Not Started",
      "Done",
      "Working on it",
    ];
    const result = detectColumnType(values);
    expect(result.type).toBe("status");
    expect(result.confidence).toBe("medium");
  });

  it("detects tag-like comma-separated values as tags", () => {
    const values: ColumnValue[] = ["red, blue, green", "blue, yellow", "red, green"];
    const result = detectColumnType(values);
    expect(result.type).toBe("tags");
  });

  it("falls back to text for freeform content", () => {
    const values: ColumnValue[] = [
      "The quick brown fox",
      "jumps over the lazy dog",
      "Pack my box with five dozen liquor jugs",
    ];
    const result = detectColumnType(values);
    expect(result.type).toBe("text");
  });

  it("returns text with low confidence for empty values", () => {
    const values: ColumnValue[] = [null, null, null];
    const result = detectColumnType(values);
    expect(result.type).toBe("text");
    expect(result.confidence).toBe("low");
  });

  it("does not misclassify mixed dates and text as date", () => {
    const values: ColumnValue[] = ["2026-01-15", "some text", "2026-03-10", "more text"];
    const result = detectColumnType(values);
    expect(result.type).not.toBe("date");
  });

  it("detects rating columns (1-5 scale)", () => {
    const values: ColumnValue[] = [1, 2, 3, 4, 5, 4, 3, 2, 1];
    const result = detectColumnType(values);
    expect(result.type).toBe("rating");
  });

  it("detects numeric strings with commas", () => {
    const values: ColumnValue[] = ["1,000", "2,500", "10,000", "500"];
    const result = detectColumnType(values);
    expect(result.type).toBe("number");
  });
});

describe("formatCellByColumnType", () => {
  it("formats dates as 'Jul 31'", () => {
    expect(formatDateValue("2026-07-31")).toBe("Jul 31");
    expect(formatCellByColumnType("2026-07-31", "date")).toBe("Jul 31");
  });

  it("formats dd/mm/yyyy dates", () => {
    expect(formatCellByColumnType("31/07/2026", "date")).toBe("Jul 31");
  });

  it("formats numbers with locale separators", () => {
    expect(formatCellByColumnType(1234567, "number")).toBe("1,234,567");
    expect(formatCellByColumnType("$1,234.50", "number")).toBe("1,234.5");
  });

  it("formats currency values", () => {
    const formatted = formatCellByColumnType(1234.5, "currency");
    expect(formatted).toContain("1,234.50");
  });

  it("formats checkbox values as checkmarks", () => {
    expect(formatCellByColumnType(true, "checkbox")).toBe("✓");
    expect(formatCellByColumnType(false, "checkbox")).toBe("✗");
    expect(formatCellByColumnType("yes", "checkbox")).toBe("✓");
    expect(formatCellByColumnType("no", "checkbox")).toBe("✗");
  });

  it("formats tags as comma-separated", () => {
    expect(formatCellByColumnType("red, blue, green", "tags")).toBe("red, blue, green");
    expect(formatCellByColumnType(["red", "blue"], "tags")).toBe("red, blue");
  });

  it("formats rating as star display", () => {
    expect(formatCellByColumnType(4, "rating")).toBe("★★★★○");
    expect(formatCellByColumnType(3, "rating")).toBe("★★★○○");
    expect(formatCellByColumnType(5, "rating")).toBe("★★★★★");
  });

  it("returns — for empty values", () => {
    expect(formatCellByColumnType(null, "text")).toBe("—");
    expect(formatCellByColumnType("", "number")).toBe("—");
    expect(formatCellByColumnType(null, "date")).toBe("—");
  });

  it("formats status/text values as-is", () => {
    expect(formatCellByColumnType("Working on it", "status")).toBe("Working on it");
    expect(formatCellByColumnType("Acme Corp", "text")).toBe("Acme Corp");
  });
});

describe("detectAllColumnTypes", () => {
  it("detects types for all columns in a dataset", () => {
    const rows = [
      { Client: "Acme", Date: "2026-01-15", Amount: 100, Status: "Done" },
      { Client: "Beta", Date: "2026-02-20", Amount: 250, Status: "Working on it" },
      { Client: "Gamma", Date: "2026-03-10", Amount: 50, Status: "Done" },
    ];
    const headers = ["Client", "Date", "Amount", "Status"];
    const result = detectAllColumnTypes(rows, headers);

    expect(result).toHaveLength(4);
    expect(result.find((r) => r.header === "Date")?.type).toBe("date");
    expect(result.find((r) => r.header === "Amount")?.type).toBe("number");
    expect(result.find((r) => r.header === "Status")?.type).toBe("status");
    expect(result.find((r) => r.header === "Client")?.type).toBe("text");
  });

  it("handles columns with all-null values", () => {
    const rows = [{ Foo: null, Bar: "hello" }];
    const result = detectAllColumnTypes(rows, ["Foo", "Bar"]);
    expect(result.find((r) => r.header === "Foo")?.type).toBe("text");
    expect(result.find((r) => r.header === "Bar")?.type).toBe("text");
  });
});
