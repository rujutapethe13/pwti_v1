import { describe, it, expect, vi, beforeEach } from "vitest";
import { bulkUpdateCells } from "@/features/boards/engine/actions/cell-actions";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { CellService } from "@/features/boards/engine/services/cell-service";
import { checkChangeTriggers } from "@/features/triggers/engine";
import { canUserAccessBoard } from "@/lib/board-access";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  createServiceClient: vi.fn(),
}));
vi.mock("@/features/boards/engine/services/cell-service", () => ({
  CellService: { bulkUpdate: vi.fn().mockResolvedValue({ data: null, error: null, status: 200 }) },
}));
vi.mock("@/features/triggers/engine", () => ({ checkChangeTriggers: vi.fn() }));
vi.mock("@/lib/board-access", () => ({ canUserAccessBoard: vi.fn() }));

const boardId = "board-1";
const orgId = "org-1";
const wsId = "ws-1";
const recordId1 = "rec-1";
const recordId2 = "rec-2";
const columnId = "col-1";

const mockBoard = { id: boardId, organization_id: orgId, workspace_id: wsId };
const mockRecords = [
  { id: recordId1, board_id: boardId },
  { id: recordId2, board_id: boardId },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let serviceClient: any;

function makeServiceClient(results: Record<string, { data: unknown }>) {
  const updateCalls: Array<{ table: string; patch: unknown }> = [];
  const from = vi.fn((table: string) => {
    const result = results[table] ?? { data: null };
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue(result),
      maybeSingle: vi.fn().mockResolvedValue(result),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn().mockImplementation((patch: unknown) => {
        updateCalls.push({ table, patch });
        return { in: vi.fn().mockResolvedValue({ error: null }) };
      }),
      insert: vi.fn().mockResolvedValue({ error: null }),
    };
  });
  return { from, updateCalls };
}

beforeEach(() => {
  vi.clearAllMocks();
  serviceClient = makeServiceClient({
    boards: { data: mockBoard },
    records: { data: mockRecords },
    columns: { data: [{ id: columnId, board_id: boardId }] },
    cell_values: { data: [
      { id: `${boardId}:${recordId1}:${columnId}`, value_text: "Old 1" },
      { id: `${boardId}:${recordId2}:${columnId}`, value_text: "Old 2" },
    ] },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(createServiceClient).mockResolvedValue(serviceClient as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  vi.mocked(canUserAccessBoard).mockResolvedValue(true);
});

describe("bulk write behavior (triggers, last_edited, version, undo)", () => {
  it("fires checkChangeTriggers once per pasted cell with old + new values", async () => {
    await bulkUpdateCells(orgId, wsId, boardId, [
      { recordId: recordId1, columnId: columnId, value: "New 1" },
      { recordId: recordId2, columnId: columnId, value: "New 2" },
    ]);
    expect(checkChangeTriggers).toHaveBeenCalledTimes(2);
    expect(checkChangeTriggers).toHaveBeenCalledWith(
      expect.objectContaining({ recordId: recordId1, columnId: columnId, oldValue: "Old 1", newValue: "New 1", boardId }),
    );
    expect(checkChangeTriggers).toHaveBeenCalledWith(
      expect.objectContaining({ recordId: recordId2, columnId: columnId, oldValue: "Old 2", newValue: "New 2", boardId }),
    );
  });

  it("stamps last_edited_at / last_edited_by on every touched record (one write)", async () => {
    await bulkUpdateCells(orgId, wsId, boardId, [
      { recordId: recordId1, columnId: columnId, value: "New 1" },
      { recordId: recordId2, columnId: columnId, value: "New 2" },
    ]);
    const recordsUpdate = serviceClient.updateCalls.find((c: { table: string }) => c.table === "records");
    expect(recordsUpdate).toBeDefined();
    expect(recordsUpdate.patch.last_edited_by).toBe("user-1");
    expect(typeof recordsUpdate.patch.last_edited_at).toBe("string");
  });

  it("has no caller-side version/etag check (version:1 is hardcoded inside CellService.bulkUpdate)", async () => {
    await bulkUpdateCells(orgId, wsId, boardId, [
      { recordId: recordId1, columnId: columnId, value: "New 1" },
      { recordId: recordId2, columnId: columnId, value: "New 2" },
    ]);
    expect(CellService.bulkUpdate).toHaveBeenCalledTimes(1);
    const input = vi.mocked(CellService.bulkUpdate).mock.calls[0][0];
    // The caller passes raw updates; version is not part of the input -> no optimistic-concurrency guard.
    expect(input.updates.every((u) => (u as { version?: unknown }).version === undefined)).toBe(true);
    expect(input.updates).toHaveLength(2);
  });

  it("performs exactly one bulk cell write (one undo entry per paste)", async () => {
    await bulkUpdateCells(orgId, wsId, boardId, [
      { recordId: recordId1, columnId: columnId, value: "New 1" },
      { recordId: recordId2, columnId: columnId, value: "New 2" },
    ]);
    expect(CellService.bulkUpdate).toHaveBeenCalledTimes(1);
    const input = vi.mocked(CellService.bulkUpdate).mock.calls[0][0];
    expect(input.updates).toHaveLength(2);
  });
});
