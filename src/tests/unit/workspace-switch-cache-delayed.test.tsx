import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type { Mock } from "vitest";

import { WorkspaceProvider, useWorkspace } from "@/lib/workspace-context";

interface MockBoardRow {
  id: string;
  name: string;
  slug: string;
  icon: string;
  favorite: boolean;
  pinned: boolean;
  status: string;
  folder_id: string | null;
  created_at: string;
}

const mockBoardsByWorkspace: Record<string, MockBoardRow[]> = {
  "ws-main": [
    {
      id: "board-manage",
      name: "Manage workspace",
      slug: "manage-ws-main",
      icon: "Settings2",
      favorite: true,
      pinned: true,
      status: "active",
      folder_id: null,
      created_at: "2025-01-01T00:00:00Z",
    },
    {
      id: "board-august",
      name: "August",
      slug: "august",
      icon: "LayoutTemplate",
      favorite: false,
      pinned: false,
      status: "active",
      folder_id: null,
      created_at: "2025-01-02T00:00:00Z",
    },
  ],
  "ws-other": [
    {
      id: "board-manage-other",
      name: "Manage workspace",
      slug: "manage-ws-other",
      icon: "Settings2",
      favorite: true,
      pinned: true,
      status: "active",
      folder_id: null,
      created_at: "2025-01-01T00:00:00Z",
    },
  ],
};

const mockWorkspaces = [
  {
    id: "ws-main",
    name: "Main",
    slug: "main",
    description: "",
    organization_id: "org-1",
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
  },
  {
    id: "ws-other",
    name: "Other",
    slug: "other",
    description: "",
    organization_id: "org-1",
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
  },
];

function makeDelayedSupabaseMock(delayMs = 50) {
  const lastWsId = { value: "" };
  const lastTable = { value: "" };
  const pendingResolvers: Map<string, () => void> = new Map();

  const queryChain = {
    select: vi.fn(function () {
      return queryChain;
    }),
    eq: vi.fn(function (_col: string, val: string) {
      lastWsId.value = val;
      return queryChain;
    }),
    order: vi.fn(function () {
      return new Promise((resolve) => {
        let data: unknown[] = [];
        if (lastTable.value === "workspaces") {
          data = mockWorkspaces;
        } else if (lastTable.value === "boards") {
          data = mockBoardsByWorkspace[lastWsId.value] ?? [];
        } else if (lastTable.value === "folders") {
          data = [];
        }
        setTimeout(() => resolve({ data, error: null }), delayMs);
      });
    }),
    insert: vi.fn(function () {
      return Promise.resolve({ data: null, error: null });
    }),
    single: vi.fn(function () {
      return Promise.resolve({ data: null, error: null });
    }),
    maybeSingle: vi.fn(function () {
      return Promise.resolve({ data: null, error: null });
    }),
  };

  const from = vi.fn(function (table: string) {
    lastTable.value = table;
    lastWsId.value = "";
    return queryChain;
  });

  // The sidebar now reads through RPCs, so the delayed path has to be mirrored
  // here or these tests would resolve instantly and stop exercising the race
  // they exist to cover. get_my_boards() returns every board across every
  // workspace; the provider narrows to the active one.
  const rpc = vi.fn(function (fn: string) {
    return new Promise((resolve) => {
      let data: unknown[] = [];
      if (fn === "get_my_workspaces") {
        data = mockWorkspaces;
      } else if (fn === "get_my_boards") {
        data = Object.entries(mockBoardsByWorkspace).flatMap(([workspaceId, boards]) =>
          boards.map((board) => ({ ...board, workspace_id: workspaceId })),
        );
      }
      setTimeout(() => resolve({ data, error: null }), delayMs);
    });
  });

  return { from, rpc, pendingResolvers };
}

const supabaseMock = makeDelayedSupabaseMock(50);

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => supabaseMock,
}));

vi.mock("@/lib/storage", () => ({
  loadPersisted: (key: string, fallback: unknown) => {
    if (key === "workspaces") return [];
    if (key === "active-workspace") return null;
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

vi.mock("@/features/boards/engine/actions", () => ({
  createWorkspaceInDb: vi.fn(),
  createOrganizationInDb: vi.fn(),
  renameBoard: vi.fn(),
  renameWorkspaceInDb: vi.fn(),
  deleteWorkspaceInDb: vi.fn(),
}));

vi.mock("@/lib/workspace-events", () => ({
  publishWorkspaceUpdate: vi.fn(),
  subscribeWorkspaceUpdates: vi.fn(() => () => {}),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
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

function wrapper({ children }: { children: ReactNode }) {
  return <WorkspaceProvider>{children}</WorkspaceProvider>;
}

describe("WorkspaceProvider — board visibility with delayed responses (race conditions)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("board persists across rapid workspace switches when initial fetch hasn't completed", async () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper });

    await waitFor(() => expect(result.current.hasHydrated).toBe(true));
    await waitFor(() => expect(result.current.workspaces.length).toBe(2));
    expect(result.current.activeWorkspaceId).toBe("ws-main");

    await waitFor(() => {
      const wsMainContent = result.current.activeWorkspace?.content ?? [];
      expect(wsMainContent.some((b) => b.name === "August")).toBe(true);
    }, { timeout: 2000 });

    await act(async () => {
      result.current.switchWorkspace("ws-other");
    });
    await waitFor(() => expect(result.current.activeWorkspaceId).toBe("ws-other"));
    await waitFor(() => {
      const wsOtherContent = result.current.activeWorkspace?.content ?? [];
      expect(wsOtherContent.some((b) => b.name === "Manage workspace")).toBe(true);
    }, { timeout: 2000 });

    await act(async () => {
      result.current.switchWorkspace("ws-main");
    });
    await waitFor(() => expect(result.current.activeWorkspaceId).toBe("ws-main"));

    const wsMainContentAfter = result.current.activeWorkspace?.content ?? [];
    expect(wsMainContentAfter.some((b) => b.name === "August")).toBe(true);
  }, 10000);

  it("board persists across rapid switches without waiting for each fetch to complete", async () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper });

    await waitFor(() => expect(result.current.hasHydrated).toBe(true));
    await waitFor(() => expect(result.current.workspaces.length).toBe(2));
    expect(result.current.activeWorkspaceId).toBe("ws-main");

    await waitFor(() => {
      const wsMainContent = result.current.activeWorkspace?.content ?? [];
      expect(wsMainContent.some((b) => b.name === "August")).toBe(true);
    }, { timeout: 2000 });

    await act(async () => {
      result.current.switchWorkspace("ws-other");
    });
    await waitFor(() => expect(result.current.activeWorkspaceId).toBe("ws-other"));
    await waitFor(() => {
      const wsOtherContent = result.current.activeWorkspace?.content ?? [];
      expect(wsOtherContent.length).toBeGreaterThanOrEqual(1);
    }, { timeout: 2000 });

    await act(async () => {
      result.current.switchWorkspace("ws-main");
    });
    await waitFor(() => expect(result.current.activeWorkspaceId).toBe("ws-main"));

    await act(async () => {
      result.current.switchWorkspace("ws-other");
    });
    await waitFor(() => expect(result.current.activeWorkspaceId).toBe("ws-other"));

    await act(async () => {
      result.current.switchWorkspace("ws-main");
    });
    await waitFor(() => expect(result.current.activeWorkspaceId).toBe("ws-main"));

    const wsMainContentFinal = result.current.activeWorkspace?.content ?? [];
    expect(wsMainContentFinal.some((b) => b.name === "August")).toBe(true);
  }, 15000);

  it("does not cache empty array, so boards re-fetch correctly after empty initial result", async () => {
    const emptyBoardsWorkspace = "ws-empty";
    const mockBoardsWithEmpty: Record<string, MockBoardRow[]> = {
      ...mockBoardsByWorkspace,
      "ws-empty": [],
    };

    const { from } = makeDelayedSupabaseMock(50);
    const fromMock = from as Mock<typeof from>;
    fromMock.mockImplementation((table: string) => {
      const chain: {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  _lastWsId?: string;
} = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn((_col: string, val: string) => {
    if (table === "boards") {
      chain._lastWsId = val;
    }

    return chain;
  }),
        order: vi.fn(function () {
          let data: unknown[] = [];
          if (table === "workspaces") {
            data = mockWorkspaces;
          } else if (table === "boards") {
            data = mockBoardsWithEmpty[chain._lastWsId ?? ""] ?? [];
          } else if (table === "folders") {
            data = [];
          }
          return new Promise((resolve) => {
            setTimeout(() => resolve({ data, error: null }), 50);
          });
        }),
        insert: vi.fn(),
        single: vi.fn(),
        maybeSingle: vi.fn(),
      };
      return chain;
    });

    vi.doMock("@/lib/supabase/client", () => ({
      createClient: () => ({ from: fromMock, rpc: vi.fn() }),
    }));

    const { result } = renderHook(() => useWorkspace(), { wrapper });

    await waitFor(() => expect(result.current.hasHydrated).toBe(true));
    await waitFor(() => expect(result.current.workspaces.length).toBe(2));

    await act(async () => {
      result.current.switchWorkspace(emptyBoardsWorkspace);
    });
    await waitFor(() => expect(result.current.activeWorkspaceId).toBe(emptyBoardsWorkspace));

    // Initially empty — should NOT be cached, so content stays []
    expect(result.current.activeWorkspace?.content ?? []).toHaveLength(0);

    // Switch back to ws-main, then back to ws-empty — should re-fetch, not return cached []
    await act(async () => {
      result.current.switchWorkspace("ws-main");
    });
    await waitFor(() => expect(result.current.activeWorkspaceId).toBe("ws-main"));
    await waitFor(() => {
      const wsMainContent = result.current.activeWorkspace?.content ?? [];
      expect(wsMainContent.some((b) => b.name === "August")).toBe(true);
    }, { timeout: 2000 });

    await act(async () => {
      result.current.switchWorkspace(emptyBoardsWorkspace);
    });
    await waitFor(() => expect(result.current.activeWorkspaceId).toBe(emptyBoardsWorkspace));

    // Should have re-fetched and still be empty (not stale cached)
    expect(result.current.activeWorkspace?.content ?? []).toHaveLength(0);
    fromMock.mockRestore();
  }, 15000);
});
