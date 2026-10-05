import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

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
  "ws-a": [
    {
      id: "board-a-1",
      name: "Manage workspace",
      slug: "manage-ws-a",
      icon: "Settings2",
      favorite: true,
      pinned: true,
      status: "active",
      folder_id: null,
      created_at: "2025-01-01T00:00:00Z",
    },
  ],
  "ws-b": [
    {
      id: "board-b-1",
      name: "Manage workspace",
      slug: "manage-ws-b",
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
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
  },
];

function makeSupabaseMock() {
  const lastWsId = { value: "" };
  const lastTable = { value: "" };

  const queryChain = {
    select: vi.fn(function () {
      return queryChain;
    }),
    eq: vi.fn(function (_col: string, val: string) {
      lastWsId.value = val;
      return queryChain;
    }),
    order: vi.fn(function () {
      let data: unknown[] = [];
      if (lastTable.value === "workspaces") {
        data = mockWorkspaces;
      } else if (lastTable.value === "boards") {
        data = mockBoardsByWorkspace[lastWsId.value] ?? [];
      } else if (lastTable.value === "folders") {
        data = [];
      }
      return Promise.resolve({ data, error: null });
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

  // The sidebar reads workspaces and boards through RPCs rather than direct
  // table reads, so the mock answers on the function name. get_my_boards()
  // returns every board the caller may see across all workspaces — the caller
  // narrows to the active one itself, which is what these tests cover.
  const rpc = vi.fn(function (fn: string) {
    if (fn === "get_my_workspaces") {
      return Promise.resolve({ data: mockWorkspaces, error: null });
    }

    if (fn === "get_my_boards") {
      const all = Object.entries(mockBoardsByWorkspace).flatMap(([workspaceId, boards]) =>
        boards.map((board) => ({ ...board, workspace_id: workspaceId })),
      );
      return Promise.resolve({ data: all, error: null });
    }

    return Promise.resolve({ data: [], error: null });
  });

  return { from, rpc };
}

const supabaseMock = makeSupabaseMock();

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

function addBoardToMockDb(wsId: string, board: MockBoardRow) {
  mockBoardsByWorkspace[wsId].push(board);
}

describe("WorkspaceProvider — board visibility across workspace switches", () => {
  beforeEach(() => {
    for (const wsId of Object.keys(mockBoardsByWorkspace)) {
      mockBoardsByWorkspace[wsId] = [
        {
          id: `board-${wsId}-1`,
          name: "Manage workspace",
          slug: `manage-${wsId}`,
          icon: "Settings2",
          favorite: true,
          pinned: true,
          status: "active",
          folder_id: null,
          created_at: "2025-01-01T00:00:00Z",
        },
      ];
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("boards created via syncBoard persist across workspace switches", async () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper });

    await waitFor(() => expect(result.current.hasHydrated).toBe(true));
    await waitFor(() => expect(result.current.workspaces.length).toBe(2));

    expect(result.current.activeWorkspaceId).toBe("ws-a");

    const newBoard: MockBoardRow = {
      id: "board-new-ws-a",
      name: "Content Board A",
      slug: "content-board-a",
      icon: "LayoutDashboard",
      favorite: false,
      pinned: false,
      status: "active",
      folder_id: null,
      created_at: "2025-01-02T00:00:00Z",
    };

    addBoardToMockDb("ws-a", newBoard);

    await act(async () => {
      result.current.syncBoard({
        id: newBoard.id,
        name: newBoard.name,
        slug: newBoard.slug,
        icon: newBoard.icon,
        favorite: false,
        pinned: false,
      });
    });

    expect(
      result.current.activeWorkspace?.content.some((b) => b.id === "board-new-ws-a"),
    ).toBe(true);

    await act(async () => {
      result.current.switchWorkspace("ws-b");
    });

    await waitFor(() => {
      expect(result.current.activeWorkspaceId).toBe("ws-b");
    });

    const wsBContent = result.current.activeWorkspace?.content ?? [];
    expect(wsBContent.some((b) => b.name === "Content Board A")).toBe(false);
    expect(wsBContent.some((b) => b.name === "Manage workspace")).toBe(true);

    await act(async () => {
      result.current.switchWorkspace("ws-a");
    });

    await waitFor(() => {
      expect(result.current.activeWorkspaceId).toBe("ws-a");
    });

    const wsAContentAfter = result.current.activeWorkspace?.content ?? [];
    expect(wsAContentAfter.some((b) => b.id === "board-new-ws-a")).toBe(true);
    expect(wsAContentAfter.some((b) => b.name === "Content Board A")).toBe(true);
  });

   it("boards from initial DB fetch persist in cache across workspace switches (no syncBoard, no cache invalidation)", async () => {
     const augustBoard: MockBoardRow = {
       id: "board-august",
       name: "August",
       slug: "august",
       icon: "LayoutTemplate",
       favorite: false,
       pinned: false,
       status: "active",
       folder_id: null,
       created_at: "2025-01-02T00:00:00Z",
     };

     addBoardToMockDb("ws-a", augustBoard);

     const { result } = renderHook(() => useWorkspace(), { wrapper });

     await waitFor(() => expect(result.current.hasHydrated).toBe(true));
     await waitFor(() => expect(result.current.workspaces.length).toBe(2));

     await waitFor(() => {
       const wsAContent = result.current.activeWorkspace?.content ?? [];
       expect(wsAContent.some((b) => b.name === "August")).toBe(true);
     });

     await act(async () => {
       result.current.switchWorkspace("ws-b");
     });

     await waitFor(() => expect(result.current.activeWorkspaceId).toBe("ws-b"));
     await waitFor(() => {
       const wsBContent = result.current.activeWorkspace?.content ?? [];
       expect(wsBContent.some((b) => b.name === "Manage workspace")).toBe(true);
     });

     await act(async () => {
       result.current.switchWorkspace("ws-a");
     });

     await waitFor(() => expect(result.current.activeWorkspaceId).toBe("ws-a"));

     const wsAContentAfter = result.current.activeWorkspace?.content ?? [];
     expect(wsAContentAfter.some((b) => b.name === "August")).toBe(true);
   });

  it("boards created in two different workspaces stay scoped per workspace (no leak, no disappearance)", async () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper });

    await waitFor(() => expect(result.current.hasHydrated).toBe(true));
    await waitFor(() => expect(result.current.workspaces.length).toBe(2));

    const boardA2: MockBoardRow = {
      id: "board-ws-a-2",
      name: "Board A2",
      slug: "board-a2",
      icon: "FileText",
      favorite: false,
      pinned: false,
      status: "active",
      folder_id: null,
      created_at: "2025-01-02T00:00:00Z",
    };

    addBoardToMockDb("ws-a", boardA2);

    await act(async () => {
      result.current.syncBoard({
        id: boardA2.id,
        name: boardA2.name,
        slug: boardA2.slug,
        icon: boardA2.icon,
        favorite: false,
        pinned: false,
      });
    });

    await act(async () => {
      result.current.switchWorkspace("ws-b");
    });

    await waitFor(() => expect(result.current.activeWorkspaceId).toBe("ws-b"));

    const boardB2: MockBoardRow = {
      id: "board-ws-b-2",
      name: "Board B2",
      slug: "board-b2",
      icon: "FileText",
      favorite: false,
      pinned: false,
      status: "active",
      folder_id: null,
      created_at: "2025-01-02T00:00:00Z",
    };

    addBoardToMockDb("ws-b", boardB2);

    await act(async () => {
      result.current.syncBoard({
        id: boardB2.id,
        name: boardB2.name,
        slug: boardB2.slug,
        icon: boardB2.icon,
        favorite: false,
        pinned: false,
      });
    });

    let wsBContent = result.current.activeWorkspace?.content ?? [];
    expect(wsBContent.some((b) => b.id === "board-ws-b-2")).toBe(true);
    expect(wsBContent.some((b) => b.id === "board-ws-a-2")).toBe(false);

    await act(async () => {
      result.current.switchWorkspace("ws-a");
    });

    await waitFor(() => expect(result.current.activeWorkspaceId).toBe("ws-a"));

    let wsAContent = result.current.activeWorkspace?.content ?? [];
    expect(wsAContent.some((b) => b.id === "board-ws-a-2")).toBe(true);
    expect(wsAContent.some((b) => b.id === "board-ws-b-2")).toBe(false);

    await act(async () => {
      result.current.switchWorkspace("ws-b");
    });

    await waitFor(() => expect(result.current.activeWorkspaceId).toBe("ws-b"));

    wsBContent = result.current.activeWorkspace?.content ?? [];
    expect(wsBContent.some((b) => b.id === "board-ws-b-2")).toBe(true);
    expect(wsBContent.some((b) => b.id === "board-ws-a-2")).toBe(false);

    await act(async () => {
      result.current.switchWorkspace("ws-a");
    });

    await waitFor(() => expect(result.current.activeWorkspaceId).toBe("ws-a"));

    wsAContent = result.current.activeWorkspace?.content ?? [];
    expect(wsAContent.some((b) => b.id === "board-ws-a-2")).toBe(true);
    expect(wsAContent.some((b) => b.id === "board-ws-b-2")).toBe(false);
  });
});
