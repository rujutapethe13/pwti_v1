import { describe, it, expect } from "vitest";
import { parseDateInput } from "./daily-activity-service";

function expectDate(result: Date | null, year: number, month: number, day: number) {
	expect(result).not.toBeNull();
	expect(result!.getFullYear()).toBe(year);
	expect(result!.getMonth()).toBe(month - 1);
	expect(result!.getDate()).toBe(day);
}

describe("parseDateInput", () => {
	it("parses ISO 8601 date (YYYY-MM-DD)", () => {
		expectDate(parseDateInput("2026-09-23"), 2026, 9, 23);
	});

	it("parses DD-MM-YYYY with dashes", () => {
		expectDate(parseDateInput("23-09-2026"), 2026, 9, 23);
	});

	it("parses DD/MM/YYYY with slashes", () => {
		expectDate(parseDateInput("23/09/2026"), 2026, 9, 23);
	});

	it("parses MM/DD/YYYY US-style with slashes", () => {
		expectDate(parseDateInput("09/23/2026"), 2026, 9, 23);
	});

	it("parses ISO timestamp", () => {
		const result = parseDateInput("2026-09-23T10:30:00Z");
		expect(result).not.toBeNull();
		expect(result!.getFullYear()).toBe(2026);
		expect(result!.getMonth()).toBe(8);
		expect(result!.getDate()).toBe(23);
	});

	it("parses DD.MM.YYYY with dots", () => {
		expectDate(parseDateInput("23.09.2026"), 2026, 9, 23);
	});

	it("returns null for null input", () => {
		expect(parseDateInput(null)).toBeNull();
	});

	it("returns null for undefined input", () => {
		expect(parseDateInput(undefined)).toBeNull();
	});

	it("returns null for empty string", () => {
		expect(parseDateInput("")).toBeNull();
	});

	it("returns null for invalid date", () => {
		expect(parseDateInput("not-a-date")).toBeNull();
	});
});
