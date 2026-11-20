import { describe, it, expect } from "vitest";
import { mapStatus } from "@/features/client-360/status-mapping";

describe("status-mapping", () => {
  const cases: [string, string][] = [
    ["Done", "Completed"],
    ["Completed", "Completed"],
    ["Complete", "Completed"],
    ["Finished", "Completed"],
    ["Closed", "Completed"],
    ["Resolved", "Completed"],
    ["Delivered", "Completed"],
    ["Overdue", "Overdue"],
    ["Blocked", "Overdue"],
    ["Stuck", "Overdue"],
    ["Delayed", "Overdue"],
    ["At risk", "Overdue"],
    ["In progress", "In progress"],
    ["Working on it", "In progress"],
    ["Started", "In progress"],
    ["Active", "In progress"],
    ["Queued", "In progress"],
    ["Not started", "Not started"],
    ["Todo", "Not started"],
    ["Backlog", "Not started"],
    ["Pending", "Not started"],
    ["Open", "Not started"],
    ["QA", "QA"],
    ["Testing", "QA"],
    ["Review", "Review"],
    ["In review", "Review"],
    ["Unknown", "Other"],
    [null, "Other"],
  ];
  for (const [raw, expected] of cases) {
    it(`maps ${raw} -> ${expected}`, () => {
      expect(mapStatus(raw)).toBe(expected);
    });
  }
  it("Hokipo Done is not 0", () => {
    expect(mapStatus("Done")).toBe("Completed");
  });
});
