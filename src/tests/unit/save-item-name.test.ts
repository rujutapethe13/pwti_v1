import { describe, it, expect, vi, beforeEach } from "vitest";
import { saveItemName } from "@/features/boards/engine/actions/record-actions";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  createServiceClient: vi.fn(),
}));
vi.mock("@/features/boards/engine/services/record-service", () => ({
  RecordService: {
    rename: vi.fn(),
  },
}));
vi.mock("@/lib/board-data-cache", () => ({
  invalidateDataCache: vi.fn(),
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { RecordService } from "@/features/boards/engine/services/record-service";
import { invalidateDataCache } from "@/lib/board-data-cache";
import { revalidatePath } from "next/cache";

const boardId = "board-1";
const itemId = "rec-1";
const orgId = "org-1";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(RecordService.rename).mockResolvedValue({
    data: { id: itemId, title: "New Client Co", boardId, organizationId: orgId, workspaceId: "ws-1", groupId: null, status: "active", version: 1, archivedAt: null, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", lastEditedAt: null, lastEditedBy: null },
    error: null,
    status: 200,
  });
});

describe("saveItemName — Client / Company name persistence", () => {
  it("updates records.title (not cell_values) via RecordService.rename", async () => {
    const res = await saveItemName({ boardId, itemId, newName: "New Client Co" });

    expect(RecordService.rename).toHaveBeenCalledWith(itemId, "New Client Co", "system");
    expect(res.data?.title).toBe("New Client Co");
    expect(res.error).toBeNull();
  });

  it("rejects empty item id", async () => {
    const res = await saveItemName({ boardId, itemId: "", newName: "x" });
    expect(res.status).toBe(400);
    expect(RecordService.rename).not.toHaveBeenCalled();
  });

  it("rejects pending (unpersisted) item id", async () => {
    const res = await saveItemName({ boardId, itemId: "pending-abc", newName: "x" });
    expect(res.status).toBe(400);
    expect(RecordService.rename).not.toHaveBeenCalled();
  });

  it("invalidates data cache and revalidates board path on success", async () => {
    await saveItemName({ boardId, itemId, newName: "New Client Co" });
    expect(invalidateDataCache).toHaveBeenCalledWith(orgId);
    expect(revalidatePath).toHaveBeenCalledWith(`/${boardId}`);
  });

  it("returns error when rename updates 0 rows", async () => {
    vi.mocked(RecordService.rename).mockResolvedValueOnce({
      data: null,
      error: "rename updated 0 rows",
      status: 500,
    });
    const res = await saveItemName({ boardId, itemId, newName: "New Client Co" });
    expect(res.error).toBe("rename updated 0 rows");
    expect(res.status).toBe(500);
  });
});
