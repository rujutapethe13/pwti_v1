import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

vi.mock("@/features/boards/engine/actions/record-actions", () => ({
  moveRecord: vi.fn(),
}));

import { useRecord } from "@/features/boards/engine/hooks/use-record";
import { moveRecord } from "@/features/boards/engine/actions/record-actions";

const mockMoveRecord = moveRecord as ReturnType<typeof vi.fn>;

const baseRecord = (overrides: Record<string, unknown> = {}) => ({
  id: "rec-1",
  organizationId: "org-1",
  workspaceId: "ws-1",
  boardId: "board-1",
  groupId: "group-a",
  title: "Record 1",
  status: "active" as const,
  version: 1,
  archivedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

describe("useRecord.moveRecord", () => {
  beforeEach(() => {
    mockMoveRecord.mockReset();
  });

  it("moves a record to another group and persists via the server action", async () => {
    mockMoveRecord.mockResolvedValue({
      data: { ...baseRecord(), groupId: "group-b" },
      error: null,
      status: 200,
    });
    const { result } = renderHook(() => useRecord([baseRecord()]));

    await act(async () => {
      await result.current.moveRecord("rec-1", "group-b");
    });

    expect(mockMoveRecord).toHaveBeenCalledWith("rec-1", "group-b");
    expect(result.current.records.find((r) => r.id === "rec-1")?.groupId).toBe("group-b");
    expect(result.current.error).toBeNull();
  });

  it("rolls back the optimistic update when the server reports the target group is missing", async () => {
    mockMoveRecord.mockResolvedValue({
      data: null,
      error: "Target group not found",
      status: 404,
    });
    const { result } = renderHook(() => useRecord([baseRecord()]));

    await act(async () => {
      await result.current.moveRecord("rec-1", "group-missing");
    });

    expect(mockMoveRecord).toHaveBeenCalledWith("rec-1", "group-missing");
    expect(result.current.records.find((r) => r.id === "rec-1")?.groupId).toBe("group-a");
    expect(result.current.error).toBe("Target group not found");
  });

  it("rolls back when the server action throws", async () => {
    mockMoveRecord.mockRejectedValue(new Error("Network down"));
    const { result } = renderHook(() => useRecord([baseRecord()]));

    await act(async () => {
      await result.current.moveRecord("rec-1", "group-b");
    });

    expect(mockMoveRecord).toHaveBeenCalledWith("rec-1", "group-b");
    expect(result.current.records.find((r) => r.id === "rec-1")?.groupId).toBe("group-a");
    expect(result.current.error).toBe("Network down");
  });
});
