import { describe, it, expect, vi, beforeEach } from "vitest";
import { bulkUpdateCells, bulkUpdateRecordTitles } from "@/features/boards/engine/actions/cell-actions";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { canUserAccessBoard } from "@/lib/board-access";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  createServiceClient: vi.fn(),
}));
vi.mock("@/lib/board-access", () => ({ canUserAccessBoard: vi.fn() }));
vi.mock("@/features/boards/engine/services/cell-service", () => ({
  CellService: { bulkUpdate: vi.fn().mockResolvedValue({ data: null, error: null, status: 200 }) },
}));

const boardId = "board-1";
const orgId = "org-1";
const wsId = "ws-1";
const recordId = "rec-1";
const columnId = "col-1";

const mockBoard = { id: boardId, organization_id: orgId, workspace_id: wsId };
const mockRecords = [{ id: recordId, board_id: boardId }];
const mockColumns = [{ id: columnId, board_id: boardId }];

function makeServiceClient(tableResults: Record<string, { data: unknown }>) {
  const from = vi.fn((table: string) => {
    const result = tableResults[table] ?? { data: null };
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue(result),
      maybeSingle: vi.fn().mockResolvedValue(result),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn().mockResolvedValue({ error: null }),
    };
  });
  return { from };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createServiceClient).mockResolvedValue(makeServiceClient({
    boards: { data: mockBoard },
    records: { data: mockRecords },
    columns: { data: mockColumns },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any);
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  vi.mocked(canUserAccessBoard).mockResolvedValue(true);
});

describe("bulk write scope (board ownership + membership)", () => {
  it("bulkUpdateCells rejects a cross-board record id", async () => {
    vi.mocked(createServiceClient).mockResolvedValue(makeServiceClient({
      boards: { data: mockBoard },
      records: { data: [] },
      columns: { data: mockColumns },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any);
    const res = await bulkUpdateCells(orgId, wsId, boardId, [
      { recordId: "rec-other", columnId: columnId, value: "x" },
    ]);
    expect(res.error).toBe("Record(s) do not belong to this board");
    expect(res.status).toBe(400);
  });

  it("bulkUpdateCells rejects a cross-board column id", async () => {
    vi.mocked(createServiceClient).mockResolvedValue(makeServiceClient({
      boards: { data: mockBoard },
      records: { data: mockRecords },
      columns: { data: [] },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any);
    const res = await bulkUpdateCells(orgId, wsId, boardId, [
      { recordId: recordId, columnId: "col-other", value: "x" },
    ]);
    expect(res.error).toBe("Column(s) do not belong to this board");
    expect(res.status).toBe(400);
  });

  it("bulkUpdateRecordTitles rejects a cross-board record id", async () => {
    vi.mocked(createServiceClient).mockResolvedValue(makeServiceClient({
      boards: { data: mockBoard },
      records: { data: [] },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any);
    const res = await bulkUpdateRecordTitles(boardId, orgId, wsId, [
      { recordId: "rec-other", title: "New" },
    ]);
    expect(res.error).toBe("Record(s) do not belong to this board");
    expect(res.status).toBe(400);
  });

  it("bulkUpdateCells rejects when board does not belong to org/workspace", async () => {
    vi.mocked(createServiceClient).mockResolvedValue(makeServiceClient({
      boards: { data: { ...mockBoard, organization_id: "other-org" } },
      records: { data: mockRecords },
      columns: { data: mockColumns },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any);
    const res = await bulkUpdateCells(orgId, wsId, boardId, [
      { recordId: recordId, columnId: columnId, value: "x" },
    ]);
    expect(res.status).toBe(403);
  });

  it("bulkUpdateCells accepts valid in-board ids", async () => {
    const res = await bulkUpdateCells(orgId, wsId, boardId, [
      { recordId: recordId, columnId: columnId, value: "x" },
    ]);
    expect(res.error).toBeNull();
    expect(res.status).toBe(200);
  });

  it("bulkUpdateRecordTitles accepts valid in-board ids", async () => {
    const res = await bulkUpdateRecordTitles(boardId, orgId, wsId, [
      { recordId: recordId, title: "New Title" },
    ]);
    expect(res.error).toBeNull();
    expect(res.status).toBe(200);
  });
});
