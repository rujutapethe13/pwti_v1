"use client";

import {
  useRouter,
  usePathname,
} from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import { publishWorkspaceUpdate, subscribeWorkspaceUpdates } from "./workspace-events";
import { createClient } from "@/lib/supabase/client";
import { loadPersisted, savePersisted, clearAllPersisted, clearLegacyStorage } from "@/lib/storage";
import { toErrorMessage } from "@/lib/utils";
import { useBootIdSync } from "@/hooks/use-boot-sync";
import {
  createWorkspaceInDb,
  createOrganizationInDb,
  renameBoard as renameBoardAction,
  renameWorkspaceInDb,
  deleteWorkspaceInDb,
  purgeDeletedWorkspaces,
  createBoard,
} from "@/features/boards/engine/actions";
import { toast } from "sonner";

if (
  process.env.NODE_ENV === "development" &&
  process.env.NEXT_PUBLIC_RESET_ON_LOAD === "true"
) {
  console.warn("[DEV] Local data reset on startup");
  clearAllPersisted();
}

export type ContentItemType = "board" | "doc" | "dashboard" | "folder" | "vibe-app" | "form";

export interface ContentItem {
  id: string;
  type: ContentItemType;
  name: string;
  slug?: string;
  icon?: string;
  isPinned?: boolean;
  isFavorite?: boolean;
  children?: ContentItem[];
  description?: string;
  boardId?: string;
}

export interface Agent {
  id: string;
  name: string;
  instructions: string;
  tools: string[];
  createdAt: string;
}

export interface WorkspaceEntry {
  id: string;
  name: string;
  color: string;
  content: ContentItem[];
  description?: string;
  organizationId: string;
  isDefault?: boolean;
  agents?: Agent[];
}

export interface WorkspaceContextValue {
  workspaces: WorkspaceEntry[];
  activeWorkspaceId: string | null;
  activeWorkspace: WorkspaceEntry | null;
  switchWorkspace: (id: string) => void;
  createWorkspace: (name: string) => Promise<WorkspaceEntry>;
  renameWorkspace: (id: string, name: string) => void;
  deleteWorkspace: (id: string) => void;
  updateBoardFavorite: (boardId: string, favorite: boolean) => void;
  toggleBoardFavorite: (boardId: string, favorited: boolean) => void;
  toggleWorkspaceFavorite: (workspaceId: string, favorited: boolean) => void;
  favoritedBoardIds: Set<string>;
  favoritedWorkspaceIds: Set<string>;
  isBoardFavorited: (boardId: string) => boolean;
  isWorkspaceFavorited: (workspaceId: string) => boolean;
  renameBoard: (boardId: string, name: string) => Promise<void>;
  createFolder: (name: string) => ContentItem;
  renameFolder: (folderId: string, name: string) => void;
  addBoard: (name: string, icon?: string) => Promise<ContentItem>;
  addDoc: (name: string) => ContentItem;
  addAgent: (agent: { name: string; instructions: string; tools: string[] }) => Agent;
  removeAgent: (agentId: string) => void;
  renameAgent: (agentId: string, name: string) => void;
  addVibeApp: (name: string, description: string) => ContentItem;
  addForm: (name: string, boardId: string | null) => ContentItem;
  syncBoard: (board: {
    id: string;
    name: string;
    slug?: string;
    icon?: string;
    favorite?: boolean;
    pinned?: boolean;
  }) => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  hasHydrated: boolean;
  hydrateActiveWorkspaceContent: () => Promise<void>;
  recoverFromStaleWorkspace: () => Promise<void>;
  recentWorkspaceIds: string[];
  trackRecentWorkspace: (id: string) => void;
  isCreatingWorkspace: boolean;
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}

const DEFAULT_WORKSPACES: WorkspaceEntry[] = [
  {
    id: "ws-design",
    name: "Design Team",
    color: "#10b981",
    description: "Creative design workspace",
    organizationId: "org-acme",
    isDefault: true,
    agents: [],
    content: [
      {
        id: "b-3",
        type: "board",
        name: "Manage workspace",
        icon: "Settings2",
        isPinned: true,
      },
    ],
  },
  {
    id: "ws-eng",
    name: "Engineering",
    color: "#8b5cf6",
    description: "Software engineering workspace",
    organizationId: "org-acme",
    agents: [],
    content: [
      {
        id: "b-4",
        type: "board",
        name: "Manage workspace",
        icon: "Settings2",
        isPinned: true,
      },
    ],
  },
];

function saveWorkspaces(workspaces: WorkspaceEntry[]) {
  savePersisted("workspaces", workspaces);
}

function findItemById(
  workspace: WorkspaceEntry,
  id: string,
): { item: ContentItem; parent: ContentItem | null } | null {
  for (const item of workspace.content) {
    if (item.id === id) return { item, parent: null };
    if (item.children) {
      for (const child of item.children) {
        if (child.id === id) return { item: child, parent: item };
      }
    }
  }
  return null;
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [hasHydrated, setHasHydrated] = useState(false);
  const [workspaces, setWorkspaces] = useState<WorkspaceEntry[]>(() =>
    loadPersisted("workspaces", DEFAULT_WORKSPACES),
  );
  const [activeId, setActiveId] = useState<string | null>(() =>
    loadPersisted("active-workspace", DEFAULT_WORKSPACES[0]?.id ?? null),
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [recentWorkspaceIds, setRecentWorkspaceIds] = useState<string[]>(() =>
    loadPersisted<string[]>("workspace-recent", []),
  );
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
  const [favoritedBoardIds, setFavoritedBoardIds] = useState<Set<string>>(new Set());
  const [favoritedWorkspaceIds, setFavoritedWorkspaceIds] = useState<Set<string>>(new Set());
  const router = useRouter();
  const pathname = usePathname();

  // Reconcile persisted data with the running server on mount. If the server
  // restarted (boot ID changed) this wipes stale localStorage before we hydrate,
  // so `hydrate()` below re-initializes state from a clean slate + the DB.
  const { ready: bootReady } = useBootIdSync();

  const workspaceContentCache = useRef<Map<string, ContentItem[]>>(new Map());
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!bootReady) return;
    let cancelled = false;

    clearLegacyStorage();

    async function loadFavorites() {
      try {
        const res = await fetch("/api/favorites");
        if (res.ok) {
          const favs: Array<{ item_type: string; item_id: string }> = await res.json();
          setFavoritedBoardIds(
            new Set(favs.filter((f) => f.item_type === "board").map((f) => f.item_id)),
          );
          setFavoritedWorkspaceIds(
            new Set(favs.filter((f) => f.item_type === "workspace").map((f) => f.item_id)),
          );
        }
      } catch {
        // non-fatal: favorites state will be empty
      }
    }

    async function hydrate() {
      const supabase = createClient();

      // Workspaces come from get_my_workspaces() rather than a direct read of
      // `workspaces`. The direct read returned every workspace in the
      // organization to any member, which is how a client could enumerate
      // everyone else's workspaces; the RPC applies can_view_workspace() per
      // row, so a personal workspace shows up only for its owner and for the
      // admins/staff it was explicitly shared with.
      const { data: wsRows, error: wsError } = await supabase.rpc(
        "get_my_workspaces",
        {} as never,
      );

      if (wsError) {
        console.error("Failed to load workspaces:", wsError);
      }

      const dbWorkspaces = (wsRows ?? []) as Array<{
        id: string;
        organization_id: string;
        name: string;
        slug: string;
        description: string;
        type: string;
      }>;

      const stored = loadPersisted<WorkspaceEntry[]>("workspaces", []);

      const dbList = dbWorkspaces;
      const storedMap = new Map(stored.map((w) => [w.id, w]));

      const merged: WorkspaceEntry[] = dbList.map((ws) => {
        const existing = storedMap.get(ws.id);
        return {
          id: ws.id,
          name: ws.name,
          color: existing?.color ?? "#666666",
          description: ws.description || existing?.description || "",
          organizationId: ws.organization_id,
          isDefault: existing?.isDefault ?? (dbList.length > 0 && ws.id === dbList[0].id),
          content: existing?.content ?? [],
          agents: existing?.agents ?? [],
        };
      });

      if (!cancelled) {
        setWorkspaces(merged);
        saveWorkspaces(merged);

        const storedActive = loadPersisted<string | null>("active-workspace", null);
        if (storedActive && merged.some((w) => w.id === storedActive)) {
          setActiveId(storedActive);
        } else if (merged.length > 0) {
          setActiveId(merged[0].id);
          if (storedActive) {
            console.warn(`[workspace] Cleared stale active-workspace "${storedActive}" — not found in DB. Falling back to "${merged[0].id}".`);
            savePersisted("active-workspace", merged[0].id);
          }
        } else {
          setActiveId(null);
          savePersisted("active-workspace", null);
          savePersisted("workspaces", []);
          console.warn("[workspace] No workspaces found in DB. Cleared stale workspace state.");
        }

        const storedSidebar = loadPersisted<boolean>("sidebar-collapsed", false);
        setSidebarCollapsed(storedSidebar);
        setHasHydrated(true);
      }
    }

     hydrate();
    loadFavorites();

    return () => {
      cancelled = true;
    };
  }, [bootReady]);

  // Subscribe to favorites update events from other components
  useEffect(() => {
    return subscribeWorkspaceUpdates((event) => {
      if (event.type === "favorites:updated" && event.payload) {
        const { item_type, item_id, favorited } = event.payload as {
          item_type: string;
          item_id: string;
          favorited: boolean;
        };
        if (item_type === "board") {
          setFavoritedBoardIds((prev) => {
            const next = new Set(prev);
            if (favorited) next.add(item_id);
            else next.delete(item_id);
            return next;
          });
        }
        if (item_type === "workspace") {
          setFavoritedWorkspaceIds((prev) => {
            const next = new Set(prev);
            if (favorited) next.add(item_id);
            else next.delete(item_id);
            return next;
          });
        }
      }
    });
  }, []);

  const hydrateActiveWorkspaceContent = useCallback(async () => {
    if (!activeId) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const cached = workspaceContentCache.current.get(activeId);
    if (cached && cached.length > 0) {
      setWorkspaces((prev) =>
        prev.map((w) => (w.id === activeId ? { ...w, content: cached } : w)),
      );
      return;
    }

try {
        const supabase = createClient();

        // Boards come from get_my_boards() rather than a direct read of
        // `boards`. A client has no direct SELECT on that table at all — by
        // design — so a direct read would give a client an empty sidebar even
        // when an admin had granted them boards. The RPC returns exactly the
        // granted boards and nothing else.
        const { data: boardRows, error: boardsError } = await supabase.rpc(
          "get_my_boards",
          {} as never,
        );

        if (controller.signal.aborted) return;

        if (boardsError) {
          console.error("[workspace] Failed to load boards:", {
            message: boardsError.message,
            code: boardsError.code,
            details: boardsError.details,
            hint: boardsError.hint,
          });
          toast.error(`Failed to load boards: ${boardsError.message}`);
          return;
        }

        const boards = ((boardRows ?? []) as Array<{
          id: string;
          workspace_id: string;
          slug: string;
          name: string;
          icon: string | null;
          favorite?: boolean;
          pinned?: boolean;
          created_at?: string;
        }>).filter((row) => row.workspace_id === activeId);

        // folders table doesn't exist in the schema; all boards are root-level
        const folders: Array<{ id: string; name: string }> = [];

      const boardsByFolder = new Map<string, ContentItem[]>();
      const rootItems: ContentItem[] = [];

      for (const row of boards ?? []) {
        const item: ContentItem = {
          id: row.id,
          type: "board",
          name: row.name,
          slug: row.slug,
          icon: row.icon ?? "LayoutTemplate",
          isFavorite: row.favorite,
          isPinned: row.pinned,
        };
        rootItems.push(item);
      }

      const folderItems: ContentItem[] = [];

      const content = [...rootItems, ...folderItems];

      if (!controller.signal.aborted) {
        workspaceContentCache.current.set(activeId, content);
        setWorkspaces((prev) =>
          prev.map((w) => (w.id === activeId ? { ...w, content } : w)),
        );
      }
    } catch {
      if (!controller.signal.aborted) {
        toast.error("Failed to load workspace content");
      }
    }
  }, [activeId]);

  const recoverFromStaleWorkspace = useCallback(async () => {
    const exists = workspaces.some((w) => w.id === activeId);
    if (exists) return;

    console.warn(`[workspace] Recovering from stale active workspace: ${activeId}`);
    savePersisted("active-workspace", null);

    if (workspaces.length > 0) {
      const fallback = workspaces[0].id;
      setActiveId(fallback);
      savePersisted("active-workspace", fallback);
      toast.info("Workspace refreshed. Switched to a valid workspace.");
    } else {
      setActiveId(null);
      toast.error("No valid workspaces found. Please create a new workspace.");
    }

    await hydrateActiveWorkspaceContent();
  }, [activeId, workspaces, hydrateActiveWorkspaceContent]);

  useEffect(() => {
    if (!hasHydrated) return;
    hydrateActiveWorkspaceContent();
  }, [hasHydrated, activeId, hydrateActiveWorkspaceContent]);

  useEffect(() => {
    saveWorkspaces(workspaces);
  }, [workspaces]);

  useEffect(() => {
    savePersisted("active-workspace", activeId);
  }, [activeId]);

  useEffect(() => {
    savePersisted("sidebar-collapsed", sidebarCollapsed);
  }, [sidebarCollapsed]);

  useEffect(() => {
    return subscribeWorkspaceUpdates((event) => {
      if (event.type === "workspace:renamed" && typeof event.payload?.id === "string") {
        setWorkspaces((prev) =>
          prev.map((w) =>
            w.id === event.payload!.id
              ? { ...w, name: event.payload!.name as string }
              : w,
          ),
        );
      }
      if (event.type === "workspace:deleted" && typeof event.payload?.id === "string") {
        const deletedId = event.payload!.id as string;
        setWorkspaces((prev) => {
          const next = prev.filter((w) => w.id !== deletedId);
          return next;
        });
        setActiveId((current) => {
          if (current === deletedId) {
            const next = workspaces.find((w) => w.id !== deletedId);
            return next?.id ?? null;
          }
          return current;
        });
      }
      if (event.type === "board:favorite:toggled" && event.payload) {
        setWorkspaces((prev) =>
          prev.map((w) => ({
            ...w,
            content: w.content.map((item) =>
              item.id === (event.payload!.boardId as string)
                ? { ...item, isFavorite: event.payload!.favorite as boolean }
                : item,
            ),
          })),
        );
      }
    });
  }, [workspaces]);

  const activeWorkspace = useMemo(
    () => workspaces.find((w) => w.id === activeId) ?? null,
    [workspaces, activeId],
  );

  const switchWorkspace = useCallback((id: string) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setActiveId(id);
    trackRecentWorkspace(id);
    publishWorkspaceUpdate({ type: "workspace:switched", payload: { id } });
    // The app shell is persistent — switching a workspace only updates the
    // active workspace selection and rehydrates the Content list. We never
    // navigate away from the current shell layout.
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("workspace:refresh-content"));
    }
  }, []);

  const createWorkspace = useCallback(async (name: string): Promise<WorkspaceEntry> => {
    const CREATION_TIMEOUT_MS = 30000;
    setIsCreatingWorkspace(true);
    console.log(`[workspace] createWorkspace started for: "${name}"`);

    const withTimeout = <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
      return Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
        }),
      ]);
    };

    const colors = ["#f97316", "#3b82f6", "#10b981", "#8b5cf6", "#ef4444", "#06b6d4"];
    const color = colors[Math.floor(Math.random() * colors.length)];

    let orgResult: { organizationId: string; workspace: WorkspaceEntry | null } | null;
    try {
      console.log(`[workspace] calling createOrganizationInDb for: "${name}"`);
      orgResult = await withTimeout(createOrganizationInDb(name), CREATION_TIMEOUT_MS, "createOrganizationInDb");
      console.log(`[workspace] createOrganizationInDb succeeded for: "${name}"`);
    } catch (err) {
      const message = toErrorMessage(err, "Failed to create workspace.");
      console.error(`[workspace] Failed to create workspace:`, err);
      throw new Error(message);
    } finally {
      setIsCreatingWorkspace(false);
      console.log(`[workspace] createWorkspace finished for: "${name}"`);
    }
    if (!orgResult || !orgResult.workspace) {
      const reason = !orgResult
        ? "Failed to create organization."
        : "Failed to create workspace.";
      console.error(`[workspace] ${reason}`, orgResult);
      throw new Error(reason);
    }

    const entry: WorkspaceEntry = {
      id: orgResult.workspace.id,
      name: orgResult.workspace.name,
      color,
      description: orgResult.workspace.description || "",
      organizationId: orgResult.organizationId,
      content: orgResult.workspace.content,
    };
    setWorkspaces((prev) => [...prev, entry]);
    setActiveId(entry.id);
    trackRecentWorkspace(entry.id);
    publishWorkspaceUpdate({ type: "workspace:created", payload: { id: entry.id } });
    console.log(`[workspace] createWorkspace succeeded: ${entry.id} (${entry.name})`);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("workspace:refresh-content"));
    }
    return entry;
  }, [pathname, router]);

  const renameWorkspace = useCallback(async (id: string, name: string) => {
    setWorkspaces((prev) => prev.map((w) => (w.id === id ? { ...w, name } : w)));
    publishWorkspaceUpdate({ type: "workspace:renamed", payload: { id, name } });
    try {
      await renameWorkspaceInDb(id, name);
    } catch {
      toast.error("Failed to rename workspace.");
    }
  }, []);

  const deleteWorkspace = useCallback(async (id: string) => {
    // No optimistic removal: the workspace stays in the sidebar
    // until the database confirms the delete. A delete the server
    // refuses (a regular member), or one that deletes 0 rows,
    // therefore rolls back cleanly — the UI was never changed.
    let result: { success: boolean; error?: string };
    try {
      result = await deleteWorkspaceInDb(id);
    } catch (err) {
      const message = toErrorMessage(err, "Failed to delete workspace.");
      console.error(`[workspace] deleteWorkspace failed for ${id}:`, message);
      toast.error(message);
      throw err;
    }

    if (!result.success) {
      // The delete did not happen. Surface the real reason —
      // e.g. the permission error raised by the database — and
      // keep the workspace in the UI.
      const message = result.error ?? "Failed to delete workspace.";
      console.warn(`[workspace] deleteWorkspace rejected for ${id}: ${message}`);
      toast.error(message);
      throw new Error(message);
    }

    // Confirmed deleted in the database: only now update the UI.
    setWorkspaces((prev) => prev.filter((w) => w.id !== id));
    workspaceContentCache.current.delete(id);
    publishWorkspaceUpdate({ type: "workspace:deleted", payload: { id } });

    if (activeId === id) {
      const next = workspaces.find((w) => w.id !== id);
      if (next) {
        switchWorkspace(next.id);
      } else {
        setActiveId(null);
        savePersisted("active-workspace", null);
      }
    }

    // The authoritative workspace list comes from get_my_workspaces()
    // on the next hydrate; dropping the cached board content makes a
    // refresh authoritative too.
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("workspace:refresh-content"));
    }

    // Fire-and-forget: schedule the background purge of the deleted
    // workspace's child rows (boards, records, cells, etc.). This runs
    // with service_role and bypasses per-row triggers, so it does not
    // block the UI response. pg_cron also calls purge_deleted_workspaces()
    // every 5 minutes as a safety net.
    void purgeDeletedWorkspaces(100).catch((err) => {
      console.error("[workspace] background purge failed:", err);
    });
  }, [activeId, workspaces, switchWorkspace]);

   const updateBoardFavorite = useCallback(
     (boardId: string, favorite: boolean) => {
       setWorkspaces((prev) =>
         prev.map((w) => ({
           ...w,
           content: w.content.map((item) => {
             if (item.id === boardId) return { ...item, isFavorite: favorite };
             if (item.children) {
               const updatedChildren = item.children.map((child) =>
                 child.id === boardId ? { ...child, isFavorite: favorite } : child,
               );
               return { ...item, children: updatedChildren };
             }
             return item;
           }),
         })),
       );
       if (activeId) workspaceContentCache.current.delete(activeId);
       publishWorkspaceUpdate({
         type: "board:favorite:toggled",
         payload: { boardId, favorite },
       });
     },
     [activeId],
   );

  const toggleBoardFavorite = useCallback(
    async (boardId: string, favorited: boolean) => {
      const method = favorited ? "POST" : "DELETE";
      const body = JSON.stringify({ item_type: "board", item_id: boardId });

      try {
        const res = await fetch("/api/favorites", {
          method,
          headers: { "Content-Type": "application/json" },
          body,
        });
        if (!res.ok) throw new Error("Failed to toggle favorite");
      } catch (err) {
        console.error("[workspace] toggleBoardFavorite error:", err);
        toast.error("Failed to update favorite");
      }

      setFavoritedBoardIds((prev) => {
        const next = new Set(prev);
        if (favorited) next.add(boardId);
        else next.delete(boardId);
        return next;
      });
      updateBoardFavorite(boardId, favorited);
      publishWorkspaceUpdate({
        type: "favorites:updated",
        payload: { item_type: "board", item_id: boardId, favorited },
      });
    },
    [updateBoardFavorite],
  );

  const toggleWorkspaceFavorite = useCallback(
    async (workspaceId: string, favorited: boolean) => {
      const method = favorited ? "POST" : "DELETE";
      const body = JSON.stringify({ item_type: "workspace", item_id: workspaceId });

      try {
        const res = await fetch("/api/favorites", {
          method,
          headers: { "Content-Type": "application/json" },
          body,
        });
        if (!res.ok) throw new Error("Failed to toggle favorite");
      } catch (err) {
        console.error("[workspace] toggleWorkspaceFavorite error:", err);
        toast.error("Failed to update favorite");
      }

      setFavoritedWorkspaceIds((prev) => {
        const next = new Set(prev);
        if (favorited) next.add(workspaceId);
        else next.delete(workspaceId);
        return next;
      });
      publishWorkspaceUpdate({
        type: "favorites:updated",
        payload: { item_type: "workspace", item_id: workspaceId, favorited },
      });
    },
    [],
  );

  const isBoardFavorited = useCallback(
    (boardId: string) => {
      const item = activeWorkspace?.content.find(
        (c) => c.id === boardId || c.children?.some((child) => child.id === boardId),
      );
      if (item && typeof item.isFavorite === "boolean") return item.isFavorite;
      return favoritedBoardIds.has(boardId);
    },
    [activeWorkspace?.content, favoritedBoardIds],
  );

  const isWorkspaceFavorited = useCallback(
    (workspaceId: string) => favoritedWorkspaceIds.has(workspaceId),
    [favoritedWorkspaceIds],
  );

  const renameBoard = useCallback(
    async (boardId: string, name: string) => {
      let prevWorkspaces: WorkspaceEntry[] | null = null;
      setWorkspaces((prev) => {
        prevWorkspaces = prev;
        return prev.map((w) => ({
          ...w,
          content: w.content.map((item) =>
            item.id === boardId ? { ...item, name } : item,
          ),
        }));
      });
      if (activeId) workspaceContentCache.current.delete(activeId);
      try {
        const fd = new FormData();
        fd.set("boardId", boardId);
        fd.set("name", name);
        fd.set("updateSlug", "false");
        const response = await renameBoardAction(fd);
        if (response.error && prevWorkspaces) {
          setWorkspaces(prevWorkspaces);
          toast.error(response.error);
        }
      } catch {
        if (prevWorkspaces) setWorkspaces(prevWorkspaces);
        toast.error("Failed to rename board.");
      }
    },
    [activeId],
  );

  const createFolder = useCallback(
    (name: string): ContentItem => {
      const folder: ContentItem = {
        id: `folder-${Date.now()}`,
        type: "folder",
        name,
        children: [],
      };
      setWorkspaces((prev) =>
        prev.map((w) =>
          w.id === activeId ? { ...w, content: [...w.content, folder] } : w,
        ),
      );
      if (activeId) workspaceContentCache.current.delete(activeId);
      return folder;
    },
    [activeId],
  );

  const renameFolder = useCallback(
    (folderId: string, name: string) => {
      setWorkspaces((prev) =>
        prev.map((w) => ({
          ...w,
          content: w.content.map((item) =>
            item.id === folderId ? { ...item, name } : item,
          ),
        })),
      );
      if (activeId) workspaceContentCache.current.delete(activeId);
    },
    [activeId],
  );

  const addBoard = useCallback(
    async (name: string, icon?: string): Promise<ContentItem> => {
      if (!activeId || !activeWorkspace) {
        throw new Error("No active workspace selected");
      }

      // Guard against stale client state: the active workspace may have been
      // deleted from the DB (e.g. after a server restart). Board inserts enforce
      // a foreign key on workspace_id, so a missing workspace surfaces as a
      // cryptic "Failed to create board." Recover before attempting the insert.
      let usableWorkspaceId = activeId;
      let usableOrgId = activeWorkspace.organizationId;
      try {
        const supabase = createClient();
        const { data: wsRow } = await supabase
          .from("workspaces")
          .select("id, organization_id")
          .eq("id", activeId)
          .maybeSingle();
        if (!wsRow) {
          await recoverFromStaleWorkspace();
          if (!activeId || !activeWorkspace) {
            throw new Error("No active workspace selected");
          }
          usableWorkspaceId = activeId;
          usableOrgId = activeWorkspace.organizationId;
        } else {
          usableOrgId = wsRow.organization_id;
        }
      } catch {
        // Non-fatal: fall through and let the server action report the real error.
      }

      const board: ContentItem = {
        id: `board-${Date.now()}`,
        type: "board",
        name,
        icon: icon ?? "LayoutTemplate",
      };
      setWorkspaces((prev) =>
        prev.map((w) =>
          w.id === activeId ? { ...w, content: [...w.content, board] } : w,
        ),
      );
      if (activeId) workspaceContentCache.current.delete(activeId);
      try {
        const fd = new FormData();
        fd.set("organizationId", usableOrgId);
        fd.set("workspaceId", usableWorkspaceId);
        fd.set("name", name);
        fd.set("description", "");
        const response = await createBoard(fd);
        if (response.data) {
          setWorkspaces((prev) =>
            prev.map((w) =>
              w.id === activeId
                ? {
                    ...w,
                    content: w.content.map((c) =>
                      c.id === board.id
                        ? {
                            ...c,
                            id: response.data!.id,
                            slug: response.data!.slug,
                          }
                        : c,
                    ),
                  }
                : w,
            ),
          );
        } else {
          toast.error(response.error ?? "Failed to create board.");
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to create board.";
        toast.error(message);
      }
      return board;
    },
    [activeId, activeWorkspace, recoverFromStaleWorkspace],
  );

  const addDoc = useCallback(
    (name: string): ContentItem => {
      const doc: ContentItem = {
        id: `doc-${Date.now()}`,
        type: "doc",
        name,
        icon: "FileText",
      };
      setWorkspaces((prev) =>
        prev.map((w) => (w.id === activeId ? { ...w, content: [...w.content, doc] } : w)),
      );
      if (activeId) workspaceContentCache.current.delete(activeId);
      return doc;
    },
    [activeId],
  );

  const addAgent = useCallback(
    (agent: { name: string; instructions: string; tools: string[] }): Agent => {
      const newAgent: Agent = {
        id: `agent-${Date.now()}`,
        name: agent.name,
        instructions: agent.instructions,
        tools: agent.tools,
        createdAt: new Date().toISOString(),
      };
      setWorkspaces((prev) =>
        prev.map((w) =>
          w.id === activeId ? { ...w, agents: [...(w.agents ?? []), newAgent] } : w,
        ),
      );
      return newAgent;
    },
    [activeId],
  );

  const removeAgent = useCallback(
    (agentId: string) => {
      setWorkspaces((prev) =>
        prev.map((w) =>
          w.id === activeId ? { ...w, agents: (w.agents ?? []).filter((a) => a.id !== agentId) } : w,
        ),
      );
    },
    [activeId],
  );

  const renameAgent = useCallback(
    (agentId: string, name: string) => {
      setWorkspaces((prev) =>
        prev.map((w) =>
          w.id === activeId
            ? {
                ...w,
                agents: (w.agents ?? []).map((a) => (a.id === agentId ? { ...a, name } : a)),
              }
            : w,
        ),
      );
    },
    [activeId],
  );

  const addVibeApp = useCallback(
    (name: string, description: string): ContentItem => {
      const vibeApp: ContentItem = {
        id: `vibe-${Date.now()}`,
        type: "vibe-app",
        name,
        description,
        icon: "Zap",
      };
      setWorkspaces((prev) =>
        prev.map((w) => (w.id === activeId ? { ...w, content: [...w.content, vibeApp] } : w)),
      );
      if (activeId) workspaceContentCache.current.delete(activeId);
      return vibeApp;
    },
    [activeId],
  );

  const addForm = useCallback(
    (name: string, boardId: string | null): ContentItem => {
      const form: ContentItem = {
        id: `form-${Date.now()}`,
        type: "form",
        name,
        icon: "FileCog",
        boardId: boardId ?? undefined,
      };
      setWorkspaces((prev) =>
        prev.map((w) => (w.id === activeId ? { ...w, content: [...w.content, form] } : w)),
      );
      if (activeId) workspaceContentCache.current.delete(activeId);
      return form;
    },
    [activeId],
  );

  const syncBoard = useCallback(
    (board: {
      id: string;
      name: string;
      slug?: string;
      icon?: string;
      favorite?: boolean;
      pinned?: boolean;
    }) => {
      const item: ContentItem = {
        id: board.id,
        type: "board",
        name: board.name,
        slug: board.slug,
        icon: board.icon ?? "LayoutTemplate",
        isFavorite: board.favorite,
        isPinned: board.pinned,
      };
      setWorkspaces((prev) =>
        prev.map((w) => {
          if (w.id !== activeId) return w;
          const exists = w.content.some((c) => c.id === board.id);
          const newContent = exists
            ? w.content.map((c) => (c.id === board.id ? item : c))
            : [...w.content, item];
          return { ...w, content: newContent };
        }),
      );
      if (activeId) workspaceContentCache.current.delete(activeId);
    },
    [activeId],
  );

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((c) => !c);
  }, []);

  const trackRecentWorkspace = useCallback((id: string) => {
    setRecentWorkspaceIds((prev) => {
      const next = [id, ...prev.filter((x) => x !== id)].slice(0, 10);
      savePersisted("workspace-recent", next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      workspaces,
      activeWorkspaceId: activeId,
      activeWorkspace,
      switchWorkspace,
      createWorkspace,
      renameWorkspace,
      deleteWorkspace,
      updateBoardFavorite,
      toggleBoardFavorite,
      toggleWorkspaceFavorite,
      favoritedBoardIds,
      favoritedWorkspaceIds,
      isBoardFavorited,
      isWorkspaceFavorited,
      renameBoard,
      createFolder,
      renameFolder,
      addBoard,
      addDoc,
      addAgent,
      removeAgent,
      renameAgent,
      addVibeApp,
      addForm,
      syncBoard,
      sidebarCollapsed,
      toggleSidebar,
      setSidebarCollapsed,
      hasHydrated,
      hydrateActiveWorkspaceContent,
      recoverFromStaleWorkspace,
      recentWorkspaceIds,
      trackRecentWorkspace,
      isCreatingWorkspace,
    }),
    [
      workspaces,
      activeId,
      activeWorkspace,
      switchWorkspace,
      createWorkspace,
      renameWorkspace,
      deleteWorkspace,
      updateBoardFavorite,
      toggleBoardFavorite,
      toggleWorkspaceFavorite,
      favoritedBoardIds,
      favoritedWorkspaceIds,
      isBoardFavorited,
      isWorkspaceFavorited,
      renameBoard,
      createFolder,
      renameFolder,
      addBoard,
      addDoc,
      addAgent,
      removeAgent,
      renameAgent,
      addVibeApp,
      addForm,
      syncBoard,
      sidebarCollapsed,
      toggleSidebar,
      hasHydrated,
      hydrateActiveWorkspaceContent,
      recoverFromStaleWorkspace,
      recentWorkspaceIds,
      trackRecentWorkspace,
      isCreatingWorkspace,
    ],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
