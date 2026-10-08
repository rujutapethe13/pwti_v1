/**
 * Delete persistence tests.
 *
 * Regression coverage for the bug where deleting a workspace or
 * board disappeared from the UI but came back after a refresh:
 * the server treated "no PostgrestError" as success even when
 * the database deleted 0 rows or refused the statement, and the
 * client removed the item optimistically.
 *
 * These tests pin the fixed contract:
 *   - the server action / service resolves the real caller and
 *     makes the database decide (delete_workspace / delete_board
 *     security-definer RPCs),
 *   - a 42501 (insufficient permission) becomes a clear 403
 *     message, never a silent success,
 *   - a zero-row delete is reported as a failure,
 *   - the client only updates its local state after a confirmed
 *     success, so a refused delete rolls back with no UI change.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

// ── Shared mocks ──────────────────────────────────────────────

type RpcResult = { data: unknown; error: { code: string; message: string } | null };
type MaybeSingleResult = {
  data: Record<string, unknown> | null;
  error: { message: string } | null;
};
type MockUser = { id: string; email: string } | null;

const rpcResults: Array<RpcResult> = [];
const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];

const queryChain = {
  select: vi.fn(() => queryChain),
  eq: vi.fn(() => queryChain),
  neq: vi.fn(() => queryChain),
  in: vi.fn(() => queryChain),
  order: vi.fn(() => queryChain),
  maybeSingle: vi.fn(async (): Promise<MaybeSingleResult> => ({
    data: null,
    error: null,
  })),
  single: vi.fn(async (): Promise<MaybeSingleResult> => ({
    data: null,
    error: null,
  })),
};

const makeClientMock = () => ({
  from: vi.fn(() => queryChain),
  rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
    rpcCalls.push({ fn, args });
    const next = rpcResults.shift();
    return next ?? { data: null, error: null };
  }),
  auth: {
    getUser: vi.fn(async (): Promise<{ data: { user: MockUser } }> => ({
      data: { user: { id: "user-1", email: "owner@example.com" } },
    })),
  },
});

const clientMock = makeClientMock();
const serviceClientMock = makeClientMock();

vi.mock("next/headers", () => ({
  cookies: async () => new Map(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => clientMock,
  createServiceClient: async () => serviceClientMock,
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

// ── 1. deleteWorkspaceInDb server action ─────────────────────

import { deleteWorkspaceInDb } from "@/features/boards/engine/actions/workspace-actions";

describe("deleteWorkspaceInDb — server-side authorization and row verification", () => {
  beforeEach(() => {
    rpcCalls.length = 0;
    rpcResults.length = 0;
    vi.clearAllMocks();
    clientMock.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "owner@example.com" } },
    });
  });

  afterEach(() => {
    rpcResults.length = 0;
  });

  it("calls the delete_workspace RPC with the caller's session and reports success when a row was deleted", async () => {
    rpcResults.push({ data: true, error: null });

    const result = await deleteWorkspaceInDb("ws-1");

    expect(result).toEqual({ success: true });
    expect(rpcCalls).toEqual([
      { fn: "delete_workspace", args: { p_workspace_id: "ws-1" } },
    ]);
  });

  it("returns a clear permission error when the database denies the delete (regular member)", async () => {
    rpcResults.push({
      data: null,
      error: {
        code: "42501",
        message: "rbac: you do not have permission to delete this workspace",
      },
    });

    const result = await deleteWorkspaceInDb("ws-1");

    expect(result.success).toBe(false);
    expect(result.error).toBe("You don't have permission to delete this workspace.");
  });

  it("reports a zero-row delete as a failure instead of a silent success", async () => {
    rpcResults.push({ data: false, error: null });

    const result = await deleteWorkspaceInDb("ws-gone");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Workspace not found or already deleted.");
  });

  it("refuses to delete when there is no authenticated user", async () => {
    clientMock.auth.getUser.mockResolvedValue({ data: { user: null } });

    const result = await deleteWorkspaceInDb("ws-1");

    expect(result.success).toBe(false);
    expect(result.error).toBe("You must be signed in to delete a workspace.");
    expect(rpcCalls).toEqual([]);
  });

  it("surfaces an unexpected RPC failure as an error", async () => {
    rpcResults.push({
      data: null,
      error: { code: "42P01", message: "relation does not exist" },
    });

    const result = await deleteWorkspaceInDb("ws-1");

    expect(result.success).toBe(false);
    expect(result.error).toContain("Failed to delete workspace");
  });
});

// ── 2. BoardService.delete ───────────────────────────────────

vi.mock("@/features/boards/engine/actions/create", () => ({
  createBoardWithDefaults: vi.fn(async () => ({ board: null })),
}));

vi.mock("@/features/boards/engine/events/event-bus", () => ({
  eventBus: { publish: vi.fn(async () => {}) },
}));

import { BoardService } from "@/features/boards/engine/services/board-service";

const findByIdResult = { data: null, error: null };

describe("BoardService.delete — authorized, row-verified board delete", () => {
  beforeEach(() => {
    rpcCalls.length = 0;
    rpcResults.length = 0;
    vi.clearAllMocks();
    // boardRepo.findById through the service client
    queryChain.maybeSingle.mockResolvedValue({
      data: {
        id: "board-1",
        name: "Board",
        slug: "board",
        organization_id: "org-1",
        workspace_id: "ws-1",
      },
      error: null,
    });
    clientMock.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "owner@example.com" } },
    });
    void findByIdResult;
  });

  afterEach(() => {
    rpcResults.length = 0;
    queryChain.maybeSingle.mockResolvedValue({ data: null, error: null });
  });

  it("returns 403 with a clear message when the caller may not delete the board", async () => {
    rpcResults.push({
      data: null,
      error: {
        code: "42501",
        message: "rbac: you do not have permission to delete this board",
      },
    });

    const response = await BoardService.delete(
      { boardId: "board-1", permanent: false },
      "user-member",
    );

    expect(response.status).toBe(403);
    expect(response.error).toBe("You don't have permission to delete this board.");
  });

  it("returns 404 when the delete affected zero rows (never a fake success)", async () => {
    rpcResults.push({ data: false, error: null });

    const response = await BoardService.delete(
      { boardId: "board-1", permanent: true },
      "user-1",
    );

    expect(response.status).toBe(404);
    expect(response.error).toBe("Board not found or already deleted.");
  });

  it("returns 200 and calls delete_board with the real actor session on a confirmed delete", async () => {
    rpcResults.push({ data: true, error: null });

    const response = await BoardService.delete(
      { boardId: "board-1", permanent: true },
      "user-1",
    );

    expect(response).toEqual({ data: null, error: null, status: 200 });
    expect(rpcCalls).toEqual([
      { fn: "delete_board", args: { p_board_id: "board-1", p_permanent: true } },
    ]);
  });

  it("soft-deletes by default (permanent = false)", async () => {
    rpcResults.push({ data: true, error: null });

    await BoardService.delete({ boardId: "board-1", permanent: false }, "user-1");

    expect(rpcCalls[0].args.p_permanent).toBe(false);
  });

  it("returns 404 when the board does not exist, without calling delete_board", async () => {
    queryChain.maybeSingle.mockResolvedValue({ data: null, error: null });

    const response = await BoardService.delete(
      { boardId: "board-gone", permanent: false },
      "user-1",
    );

    expect(response.status).toBe(404);
    expect(response.error).toBe("Board not found");
    expect(rpcCalls).toEqual([]);
  });
});

// ── 3. Workspace context: no optimistic removal ──────────────

const contextDeleteResults: Array<{ success: boolean; error?: string }> = [];

vi.mock("@/features/boards/engine/actions", () => ({
  createWorkspaceInDb: vi.fn(),
  createOrganizationInDb: vi.fn(),
  renameBoard: vi.fn(),
  renameWorkspaceInDb: vi.fn(),
  deleteWorkspaceInDb: vi.fn(async () => contextDeleteResults.shift() ?? { success: true }),
  purgeDeletedWorkspaces: vi.fn(async () => ({ success: true, purged: 0 })),
  createBoard: vi.fn(),
}));

const dbWorkspaces = [
  {
    id: "ws-a",
    name: "Workspace A",
    slug: "wa",
    description: "",
    organization_id: "org-1",
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
  },
  {
    id: "ws-b",
    name: "Workspace B",
    slug: "wb",
    description: "",
    organization_id: "org-1",
    created_at: "2025-01-02T00:00:00Z",
    updated_at: "2025-01-02T00:00:00Z",
  },
];

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    rpc: vi.fn(async (fn: string) => {
      if (fn === "get_my_workspaces") {
        return { data: dbWorkspaces, error: null };
      }
      return { data: [], error: null };
    }),
    auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
  }),
}));

vi.mock("@/lib/storage", () => ({
  loadPersisted: (key: string, fallback: unknown) => {
    if (key === "workspaces") {
      return [
        {
          id: "ws-a",
          name: "Workspace A",
          color: "#666666",
          description: "",
          organizationId: "org-1",
          content: [],
          agents: [],
        },
        {
          id: "ws-b",
          name: "Workspace B",
          color: "#666666",
          description: "",
          organizationId: "org-1",
          content: [],
          agents: [],
        },
      ];
    }
    if (key === "active-workspace") return "ws-a";
    if (key === "sidebar-collapsed") return false;
    return fallback;
  },
  savePersisted: vi.fn(),
  clearAllPersisted: vi.fn(),
  clearLegacyStorage: vi.fn(),
}));

vi.mock("@/hooks/use-boot-sync", () => ({
  useBootIdSync: () => ({
    ready: true,
    bootId: "test-boot",
    result: { bootId: "test-boot", reset: false, reason: "match" },
  }),
}));

vi.mock("@/lib/workspace-events", () => ({
  publishWorkspaceUpdate: vi.fn(),
  subscribeWorkspaceUpdates: vi.fn(() => () => {}),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => "/workspace",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

import { WorkspaceProvider, useWorkspace } from "@/lib/workspace-context";

function wrapper({ children }: { children: ReactNode }) {
  return <WorkspaceProvider>{children}</WorkspaceProvider>;
}

describe("workspace delete — UI updates only after a confirmed delete", () => {
  beforeEach(() => {
    contextDeleteResults.length = 0;
    vi.clearAllMocks();
  });

  it("keeps the workspace in the list when the delete is denied (member)", async () => {
    contextDeleteResults.push({
      success: false,
      error: "You don't have permission to delete this workspace.",
    });

    const { result } = renderHook(() => useWorkspace(), { wrapper });
    await waitFor(() => expect(result.current.hasHydrated).toBe(true));
    await waitFor(() => expect(result.current.workspaces.length).toBe(2));

    let thrown: unknown = null;
    await act(async () => {
      try {
        await result.current.deleteWorkspace("ws-a");
      } catch (err) {
        thrown = err;
      }
    });

    // The caller sees the real error…
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe(
      "You don't have permission to delete this workspace.",
    );
    // …and the workspace is still listed, so a refresh cannot
    // make it "come back" — it never went away.
    expect(result.current.workspaces.some((w) => w.id === "ws-a")).toBe(true);
  });

  it("keeps the workspace when the delete deleted zero rows", async () => {
    contextDeleteResults.push({
      success: false,
      error: "Workspace not found or already deleted.",
    });

    const { result } = renderHook(() => useWorkspace(), { wrapper });
    await waitFor(() => expect(result.current.hasHydrated).toBe(true));

    await act(async () => {
      try {
        await result.current.deleteWorkspace("ws-a");
      } catch {
        // expected
      }
    });

    expect(result.current.workspaces.some((w) => w.id === "ws-a")).toBe(true);
  });

  it("removes the workspace only after the database confirms the delete", async () => {
    contextDeleteResults.push({ success: true });

    const { result } = renderHook(() => useWorkspace(), { wrapper });
    await waitFor(() => expect(result.current.hasHydrated).toBe(true));
    await waitFor(() => expect(result.current.workspaces.length).toBe(2));

    await act(async () => {
      await result.current.deleteWorkspace("ws-a");
    });

    expect(result.current.workspaces.some((w) => w.id === "ws-a")).toBe(false);
    expect(result.current.workspaces.some((w) => w.id === "ws-b")).toBe(true);
  });
});

// ── 4. useBoard deleteBoard — no optimistic removal ──────────

const boardActionResults: Array<{ data: null; error: string | null; status: number }> = [];

vi.mock("@/features/boards/engine/actions/board-actions", () => ({
  createBoard: vi.fn(),
  renameBoard: vi.fn(),
  duplicateBoard: vi.fn(),
  archiveBoard: vi.fn(),
  deleteBoard: vi.fn(async () =>
    boardActionResults.shift() ?? { data: null, error: null, status: 200 },
  ),
  favoriteBoard: vi.fn(),
}));

vi.mock("@/features/boards/engine/hooks/use-undo", () => ({
  useUndoStack: () => ({ pushAction: vi.fn() }),
}));

import { useBoard } from "@/features/boards/engine/hooks/use-board";
import type { BoardDefinition } from "@/features/boards/engine/types";

const initialBoards: BoardDefinition[] = [
  {
    id: "board-1",
    organizationId: "org-1",
    workspaceId: "ws-1",
    slug: "board-1",
    name: "Board 1",
    description: "",
    favorite: false,
    pinned: false,
    visibility: "workspace",
    status: "active",
    sharedWith: ["owner", "editor", "viewer"],
    isRestricted: false,
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
  },
];

describe("board delete — UI updates only after a confirmed delete", () => {
  beforeEach(() => {
    boardActionResults.length = 0;
    vi.clearAllMocks();
  });

  it("keeps the board in the list when the caller may not delete it (403)", async () => {
    boardActionResults.push({
      data: null,
      error: "You don't have permission to delete this board.",
      status: 403,
    });

    const { result } = renderHook(() => useBoard(initialBoards));

    await act(async () => {
      await result.current.deleteBoard("board-1");
    });

    expect(result.current.boards.some((b) => b.id === "board-1")).toBe(true);
    expect(result.current.error).toBe("You don't have permission to delete this board.");
  });

  it("keeps the board when the delete affected zero rows (404)", async () => {
    boardActionResults.push({
      data: null,
      error: "Board not found or already deleted.",
      status: 404,
    });

    const { result } = renderHook(() => useBoard(initialBoards));

    await act(async () => {
      await result.current.deleteBoard("board-1");
    });

    expect(result.current.boards.some((b) => b.id === "board-1")).toBe(true);
  });

  it("removes the board only after the server confirms the delete", async () => {
    boardActionResults.push({ data: null, error: null, status: 200 });

    const { result } = renderHook(() => useBoard(initialBoards));

    await act(async () => {
      await result.current.deleteBoard("board-1");
    });

    expect(result.current.boards.some((b) => b.id === "board-1")).toBe(false);
    expect(result.current.error).toBeNull();
  });
});
