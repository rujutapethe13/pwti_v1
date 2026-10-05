import { describe, expect, it, beforeEach } from "vitest";
import { applyTwoWaySync, type ApplyTwoWaySyncParams } from "./two-way-sync-core";
import { demoBoardStore } from "./two-way-sync";

describe("Two-way sync: board isolation", () => {
  beforeEach(() => {
    demoBoardStore.beginTransaction();
  });

  it("creates a reciprocal column ONLY on the target board, not on all boards", () => {
    const params: ApplyTwoWaySyncParams = {
      sourceBoardId: "production",
      sourceColumnId: "production-status",
      sourceRecordId: "record-1",
      added: [{ board_id: "analytics", item_id: "analytics-1", workspace_id: "ws-main" }],
      removed: [],
      sourceAllowMultiple: false,
    };

    applyTwoWaySync(demoBoardStore, params);

    // The source board should still have its original column
    const sourceCol = demoBoardStore.getColumn("production", "production-status");
    expect(sourceCol).toBeDefined();

    // The target board should have the new reciprocal column
    const reciprocal = demoBoardStore.findReciprocalColumn("analytics", "production-status");
    expect(reciprocal).toBeDefined();
    expect(reciprocal?.boardId).toBe("analytics");

    // A completely unrelated board (cgi) should NOT have the reciprocal column
    const cgiCols = demoBoardStore.getColumns("cgi");
    const hasReciprocalOnCgi = cgiCols.some((c) => c.id.startsWith("col-reciprocal"));
    expect(hasReciprocalOnCgi).toBe(false);
  });

  it("does not mutate the global demoBoardPageData columns array", async () => {
    const { demoBoardPageData } = await import("@/features/boards/engine/demo-data");
    const productionColumnsBefore = demoBoardPageData["production"]?.columns.map((c) => c.id) ?? [];

    const params: ApplyTwoWaySyncParams = {
      sourceBoardId: "production",
      sourceColumnId: "production-status",
      sourceRecordId: "record-1",
      added: [{ board_id: "analytics", item_id: "analytics-1", workspace_id: "ws-main" }],
      removed: [],
      sourceAllowMultiple: false,
    };

    applyTwoWaySync(demoBoardStore, params);

    const productionColumnsAfter = demoBoardPageData["production"]?.columns.map((c) => c.id) ?? [];
    expect(productionColumnsAfter).toEqual(productionColumnsBefore);
  });

  it("rollback removes session-only columns without touching demo data", () => {
    const params: ApplyTwoWaySyncParams = {
      sourceBoardId: "production",
      sourceColumnId: "production-status",
      sourceRecordId: "record-1",
      added: [{ board_id: "analytics", item_id: "analytics-1", workspace_id: "ws-main" }],
      removed: [],
      sourceAllowMultiple: false,
    };

    applyTwoWaySync(demoBoardStore, params);
    expect(demoBoardStore.findReciprocalColumn("analytics", "production-status")).toBeDefined();

    demoBoardStore.rollback();
    expect(demoBoardStore.findReciprocalColumn("analytics", "production-status")).toBeUndefined();
  });
});
