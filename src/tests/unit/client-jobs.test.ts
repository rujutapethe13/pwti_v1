import { describe, it, expect } from "vitest";
import { getClientJobs } from "@/features/client-360/client-jobs";

describe("getClientJobs", () => {
  const rows = [
    { recordId: "1", clientName: "HOKIPO" },
    { recordId: "2", clientName: "Hokipo" },
    { recordId: "3", clientName: " " },
    { recordId: "4", clientName: "Hokipo", isPractice: true },
    { recordId: "5", clientName: "Hokipo", linkedCopyOf: "1" },
  ];
  it("matches HOKIPO/Hokipo case-insensitively and dedups", () => {
    const res = getClientJobs("Hokipo", rows);
    const ids = res.map((r) => r.recordId);
    expect(ids).toContain("1");
    expect(ids).toContain("2");
  });
  it("excludes blank client by default unless matched", () => {
    const res = getClientJobs("Hokipo", rows);
    expect(res.find((r) => r.recordId === "3")).toBeUndefined();
  });
  it("includes practice when option set", () => {
    const res = getClientJobs("Hokipo", rows, { includePractice: true });
    expect(res.find((r) => r.recordId === "4")).toBeDefined();
  });
  it("dedups linked copy", () => {
    const res = getClientJobs("Hokipo", rows);
    expect(res.find((r) => r.recordId === "5")).toBeUndefined();
  });
});
