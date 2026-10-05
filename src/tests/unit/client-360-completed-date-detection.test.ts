import { describe, expect, it } from "vitest";

import {
  isCompletedDateColumn,
  isDueDateColumn,
  isJobDateColumn,
} from "@/features/client-360/constants";

const dateCol = (label: string) => ({ label, type: "date" });

describe("completed-date column detection", () => {
  it("accepts labels that unambiguously record a finished job", () => {
    for (const label of [
      "Completed",
      "Completed Date",
      "Date Completed",
      "Complete Date",
      "Finished",
      "Finished Date",
      "Closure Date",
      "Closed Date",
    ]) {
      expect(isCompletedDateColumn(dateCol(label))).toBe(true);
    }
  });

  it("rejects planned, requested and received dates", () => {
    for (const label of [
      "Due Date",
      "Deadline",
      "Delivery Date",
      "Delivered Date",
      "Expected Completion",
      "Estimated Completion",
      "Target Date",
      "Planned Finish",
      "Upload Date",
      "Date Requested",
      "Date Received",
      "Date Created",
      "Reshoot Date",
      "Rework Date",
    ]) {
      expect(isCompletedDateColumn(dateCol(label))).toBe(false);
    }
  });

  it("only considers date and timeline columns", () => {
    expect(isCompletedDateColumn({ label: "Completed", type: "text" })).toBe(false);
    expect(isCompletedDateColumn({ label: "Completed", type: "status" })).toBe(false);
    expect(isCompletedDateColumn({ label: "Completed", type: "timeline" })).toBe(true);
  });

  it("never claims a plain job-date column as a completion date", () => {
    expect(isCompletedDateColumn(dateCol("Date Received"))).toBe(false);
    expect(isCompletedDateColumn(dateCol("Job Date"))).toBe(false);
  });
});

describe("job-date and completed-date detection do not overlap", () => {
  const ambiguous = [
    "Completion Date",
    "Date Completed",
    "Complete Date",
    "Finished Date",
    "Closed Date",
  ];

  it("assigns each ambiguous label to exactly one role", () => {
    for (const label of ambiguous) {
      expect({
        label,
        jobDate: isJobDateColumn(dateCol(label)),
        completedDate: isCompletedDateColumn(dateCol(label)),
        dueDate: isDueDateColumn(dateCol(label)),
      }).toEqual({
        label,
        jobDate: false,
        completedDate: true,
        dueDate: false,
      });
    }
  });

  it("keeps received dates and due dates on their own columns", () => {
    expect({
      jobDate: isJobDateColumn(dateCol("Date Received")),
      completedDate: isCompletedDateColumn(dateCol("Date Received")),
    }).toEqual({ jobDate: true, completedDate: false });

    expect({
      jobDate: isJobDateColumn(dateCol("Due Date")),
      dueDate: isDueDateColumn(dateCol("Due Date")),
      completedDate: isCompletedDateColumn(dateCol("Due Date")),
    }).toEqual({ jobDate: false, dueDate: true, completedDate: false });
  });
});
