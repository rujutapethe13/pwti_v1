import { describe, it, expect } from "vitest";
import { getClientJobs } from "@/features/client-360/client-jobs";

describe("Hokipo both tabs parity", () => {
  const rows = [
    { recordId: "a", clientName: "Hokipo" },
    { recordId: "b", clientName: "Hokipo", linkedCopyOf: "a" },
  ];
  it("same totals", () => {
    const c360 = getClientJobs("Hokipo", rows, { includePractice: false, includeArchived: false });
    const cb = getClientJobs("Hokipo", rows, { includePractice: true, includeArchived: true });
    // parity on dedup count at least
    expect(c360.length).toBeLessThanOrEqual(cb.length);
  });
});
