"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Plus,
  MoreHorizontal,
  Settings2,
  Bot,
  FileText,
  Star,
  User,
  FolderOpen,
  LayoutTemplate,
  Grid3X3,
  Heart,
  Search,
  Archive,
  ArrowUpDown,
  Trash2,
  Zap,
  FileCog,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useWorkspace, type ContentItem, type WorkspaceEntry } from "@/lib/workspace-context";
import { useWorkspacePermission } from "@/lib/workspace-permissions";
import { FavoriteStar } from "@/components/shared/favorite-star";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AddNewMenu } from "@/components/shared/add-new-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ConfirmDialog } from "@/features/boards/engine/components/confirm-dialog";
import { toast } from "sonner";

const NAV_ITEMS = [
  { id: "workspace", label: "Workspace", icon: LayoutTemplate, href: "/workspace" },
  { id: "favorites", label: "Favorites", icon: Star, href: "/favorites" },
  { id: "my-work", label: "My work", icon: User, href: "/my-work" },
  { id: "templates", label: "Template center", icon: FolderOpen, href: "/templates" },
  { id: "more", label: "More", icon: MoreHorizontal, href: "/more" },
];

const ITEM_ICON_MAP: Record<string, typeof Settings2> = {
  Settings2,
  FileText,
  User,
  Grid3X3,
  Bot,
  LayoutTemplate,
  FolderOpen,
  Heart,
  Zap,
  FileCog,
};

function getInitials(name: string) {
  return name.charAt(0).toUpperCase();
}

interface ContentItemMenuProps {
  item: ContentItem;
  onRename: (item: ContentItem) => void;
  onDelete: (item: ContentItem) => void;
  onDuplicate: (item: ContentItem) => void;
  onArchive: (item: ContentItem) => void;
  onToggleFavorite: (item: ContentItem) => void;
}

interface WorkspaceRowActionsProps {
  workspace: WorkspaceEntry;
  isActive: boolean;
  onRename: (workspace: WorkspaceEntry) => void;
  onDelete: (workspace: WorkspaceEntry) => void;
}

function WorkspaceRowActions({ workspace, onRename, onDelete }: WorkspaceRowActionsProps) {
  const { canManage } = useWorkspacePermission(workspace.id);
  const [open, setOpen] = useState(false);

  if (!canManage) return null;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded opacity-0 transition-opacity",
            "hover:bg-accent text-muted-foreground",
            "group-hover:opacity-100",
          )}
          onClick={(e) => e.stopPropagation()}
          aria-label="Workspace options"
        >
          <MoreHorizontal className="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="right" className="w-44">
        <DropdownMenuItem onSelect={() => onRename(workspace)}>
          <span className="mr-2 size-3.5">✎</span>
          Rename
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onSelect={() => onDelete(workspace)}
        >
          <Trash2 className="mr-2 size-3.5" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface ContentItemMenuProps {
  item: ContentItem;
  onRename: (item: ContentItem) => void;
  onDelete: (item: ContentItem) => void;
  onDuplicate: (item: ContentItem) => void;
  onArchive: (item: ContentItem) => void;
  onToggleFavorite: (item: ContentItem) => void;
}

function ContentItemMenu({ item, onRename, onDelete, onDuplicate, onArchive, onToggleFavorite }: ContentItemMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded opacity-0 transition-opacity group-hover:opacity-100",
            "hover:bg-accent text-muted-foreground",
          )}
          onClick={(e) => e.stopPropagation()}
          aria-label="Item menu"
        >
          <MoreHorizontal className="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="right" className="w-44">
        <DropdownMenuItem onSelect={() => onRename(item)}>
          <span className="mr-2 size-3.5">✎</span>
          Rename
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onDuplicate(item)}>
          <LayoutTemplate className="mr-2 size-3.5" />
          Duplicate
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onToggleFavorite(item)}>
          <Star className="mr-2 size-3.5" />
          {item.isFavorite ? "Remove from favorites" : "Add to favorites"}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onArchive(item)}>
          <Archive className="mr-2 size-3.5" />
          Archive
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <ArrowUpDown className="mr-2 size-3.5" />
            Move to
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem>Another workspace</DropdownMenuItem>
            <DropdownMenuItem>Folder</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onSelect={() => onDelete(item)}
        >
          <Trash2 className="mr-2 size-3.5" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function GlobalSidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const {
    workspaces,
    activeWorkspaceId,
    activeWorkspace,
    switchWorkspace,
    createWorkspace,
    updateBoardFavorite,
    toggleBoardFavorite,
    toggleWorkspaceFavorite,
    favoritedBoardIds,
    favoritedWorkspaceIds,
    renameBoard,
    renameFolder,
    hasHydrated,
  } = useWorkspace();

  const [showWorkspaceDropdown, setShowWorkspaceDropdown] = useState(false);
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
  const [agentsOpen, setAgentsOpen] = useState(false);
  const [contentOpen, setContentOpen] = useState(true);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const workspaceDropdownRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (workspaceDropdownRef.current && !workspaceDropdownRef.current.contains(e.target as Node)) {
        setShowWorkspaceDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  const handleCreateWorkspace = async () => {
    if (!newWorkspaceName.trim()) return;
    console.log(`[global-sidebar] handleCreateWorkspace started for: "${newWorkspaceName.trim()}"`);
    setIsCreatingWorkspace(true);
    try {
      await Promise.race([
        createWorkspace(newWorkspaceName.trim()),
        new Promise((_resolve, reject) => {
          setTimeout(() => reject(new Error("Workspace creation timed out after 30000ms")), 30000);
        }),
      ]);
      console.log(`[global-sidebar] handleCreateWorkspace succeeded`);
      setNewWorkspaceName("");
      setShowCreateWorkspace(false);
      setShowWorkspaceDropdown(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create workspace.";
      console.error(`[global-sidebar] handleCreateWorkspace failed:`, err);
      toast.error(message);
    } finally {
      setIsCreatingWorkspace(false);
      setShowCreateWorkspace(false);
    }
  };

  const handleRenameItem = async (item: ContentItem) => {
    setRenamingId(item.id);
    setRenameValue(item.name);
  };

  const handleRenameCommit = async () => {
    if (!renamingId || !renameValue.trim()) return;
    const item = currentContent.find((i) => i.id === renamingId);
    if (item?.type === "board") {
      await renameBoard(renamingId, renameValue.trim());
    } else if (item?.type === "folder") {
      await renameFolder(renamingId, renameValue.trim());
    }
    setRenamingId(null);
    setRenameValue("");
  };

  const handleDeleteItem = async (_item: ContentItem) => {
    setDeletingId(_item.id);
  };

  const handleConfirmDelete = async () => {
    if (!deletingId) return;
    if (workspaces.length <= 1) {
      toast.error("You must have at least one workspace.");
      setDeleteConfirmOpen(false);
      setDeletingId(null);
      return;
    }
    setIsDeleting(true);
    const nextWorkspace = workspaces.find((w) => w.id !== deletingId);
    setDeletingId(null);
    setIsDeleting(false);
    setDeleteConfirmOpen(false);
    if (nextWorkspace) {
      switchWorkspace(nextWorkspace.id);
    }
  };

  const handleDuplicateItem = (_item: ContentItem) => {
    // In real app, duplicate board/doc via API
  };

  const handleArchiveItem = (_item: ContentItem) => {
    // In real app, archive board/doc via API
  };

  const handleToggleFavorite = (item: ContentItem) => {
    if (item.type === "board") {
      const isFavorited = favoritedBoardIds.has(item.id);
      toggleBoardFavorite(item.id, !isFavorited);
      updateBoardFavorite(item.id, !isFavorited);
    }
  };

  const currentContent = activeWorkspace?.content ?? [];

  if (!hasHydrated) {
    return (
      <aside className="flex w-[var(--sidebar-width)] shrink-0 border-r bg-sidebar-background text-sidebar-foreground">
        <div className="w-[56px] shrink-0 border-r border-sidebar-border flex flex-col items-center py-2">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-bold">
            P
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <span className="text-sm font-medium">Powerweave</span>
        </div>
      </aside>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <aside
        className={cn(
          "flex border-r bg-sidebar-background text-sidebar-foreground transition-all duration-200 ease-in-out",
          "sidebar-scrollbar overflow-y-auto",
          collapsed ? "w-[56px]" : "w-[var(--sidebar-width)]",
        )}
        aria-label="Primary navigation"
      >
        {/* Icon rail */}
        <div className="w-[56px] shrink-0 border-r border-sidebar-border flex flex-col items-center py-2">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-bold mb-2">
            P
          </div>

          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Tooltip key={item.id}>
                <TooltipTrigger asChild>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex flex-col items-center gap-0.5 p-1.5 rounded-md text-[9px] leading-none transition-colors",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    )}
                    aria-current={isActive ? "page" : undefined}
                  >
                    <Icon className="size-5" />
                    <span>{item.label}</span>
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        {/* Content panel */}
        {!collapsed && (
          <div className="flex-1 flex flex-col min-w-0">
            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-sidebar-border">
              <span className="text-sm font-medium">Workspace</span>
              <button
                className="ml-auto flex size-6 items-center justify-center rounded-md text-sidebar-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                aria-label="More options"
              >
                <MoreHorizontal className="size-4" />
              </button>
              <button
                className="flex size-6 items-center justify-center rounded-md text-sidebar-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                aria-label="Search"
              >
                <Search className="size-4" />
              </button>
              <button
                onClick={onToggle}
                className="flex size-6 items-center justify-center rounded-md text-sidebar-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                aria-label="Collapse sidebar"
              >
                <ChevronLeft className="size-4" />
              </button>
            </div>

            {/* Workspace switcher */}
            <div className="border-b border-sidebar-border px-3 py-2">
              <div className="flex items-center gap-2">
                <div className="relative flex-1" ref={workspaceDropdownRef}>
                  <button
                    onClick={() => setShowWorkspaceDropdown(!showWorkspaceDropdown)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-sidebar-accent"
                  >
                    <span
                      className="flex size-5 shrink-0 items-center justify-center rounded text-[9px] font-bold text-white"
                      style={{ backgroundColor: activeWorkspace?.color ?? "#666" }}
                    >
                      {activeWorkspace ? getInitials(activeWorkspace.name) : "?"}
                    </span>
                    <span className="flex-1 truncate text-left">{activeWorkspace?.name ?? "Select workspace"}</span>
                    <ChevronDown className="size-3.5 shrink-0 text-sidebar-muted-foreground" />
                  </button>

                  {showWorkspaceDropdown && (
                    <div className="absolute left-0 z-[var(--z-popover)] mt-1 w-64 popover-surface">
                      <div className="p-2">
                        <div className="relative">
                          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                          <input
                            placeholder="Search for a workspace"
                            className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-2.5 text-xs outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                          />
                        </div>
                      </div>
                      <div className="px-2 pb-2">
                        <button
                          onClick={() => { setShowCreateWorkspace(true); setShowWorkspaceDropdown(false); }}
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-primary hover:bg-accent"
                        >
                          <Plus className="size-4" />
                          New Workspace
                        </button>
                      </div>
                      <div className="mx-2 my-1 h-px bg-border" />
                      <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">My workspaces</div>
                      <div className="p-1">
                        {workspaces.map((ws) => {
                          const isActive = ws.id === activeWorkspaceId;
                          return (
                            <div
                              key={ws.id}
                              className={cn(
                                "flex items-center gap-1 rounded-md px-2 py-1.5 text-sm",
                                isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : "hover:bg-accent",
                              )}
                            >
                              <span
                                className="flex size-5 shrink-0 items-center justify-center rounded text-[9px] font-bold text-white"
                                style={{ backgroundColor: ws.color }}
                              >
                                {getInitials(ws.name)}
                              </span>
                               <button
                                 onClick={() => { switchWorkspace(ws.id); setShowWorkspaceDropdown(false); }}
                                 className="flex-1 truncate text-left"
                               >
                                 {ws.name}
                               </button>
                               <FavoriteStar
                                 itemId={ws.id}
                                 itemType="workspace"
                                 isFavorited={favoritedWorkspaceIds.has(ws.id)}
                                 variant="default"
                                 onToggle={(fav) => {
                                   toggleWorkspaceFavorite(ws.id, fav);
                                 }}
                               />
                               <WorkspaceRowActions
                               workspace={ws}
                               isActive={isActive}
                               onRename={(workspace) => {
                                 setRenamingId(workspace.id);
                                 setRenameValue(workspace.name);
                                 setShowWorkspaceDropdown(false);
                               }}
                               onDelete={(workspace) => {
                                 setDeletingId(workspace.id);
                                 setDeleteConfirmOpen(true);
                               }}
                             />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
                <AddNewMenu />
              </div>
            </div>

            {/* My agents */}
            <div className="border-b border-sidebar-border px-3 py-2">
              <button
                onClick={() => setAgentsOpen(!agentsOpen)}
                className="flex w-full items-center gap-2 py-1.5 text-sm font-medium transition-colors hover:bg-sidebar-accent rounded-md px-2"
              >
                {agentsOpen ? (
                  <ChevronDown className="size-4 text-sidebar-muted-foreground" />
                ) : (
                  <ChevronRight className="size-4 text-sidebar-muted-foreground" />
                )}
                <Bot className="size-4 text-sidebar-muted-foreground" />
                <span className="flex-1 truncate">My agents</span>
              </button>
              {agentsOpen && (
                <div className="mt-1 pl-8 pr-2 space-y-0.5">
                  {(activeWorkspace?.agents ?? []).length === 0 ? (
                    <p className="text-xs text-sidebar-muted-foreground py-1">No agents yet</p>
                  ) : (
                    (activeWorkspace?.agents ?? []).map((agent) => (
                      <div key={agent.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-sidebar-accent cursor-pointer">
                        <Bot className="size-3.5 shrink-0 text-sidebar-muted-foreground" aria-hidden="true" />
                        <span className="flex-1 truncate">{agent.name}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Content Section */}
            <div className="flex-1 overflow-y-auto">
              <button
                onClick={() => setContentOpen(!contentOpen)}
                className="flex w-full items-center gap-2 py-2 px-3 text-sm font-medium transition-colors hover:bg-sidebar-accent"
              >
                {contentOpen ? (
                  <ChevronDown className="size-4 text-sidebar-muted-foreground" />
                ) : (
                  <ChevronRight className="size-4 text-sidebar-muted-foreground" />
                )}
                <span className="flex-1 truncate">Content</span>
              </button>

              {contentOpen && (
                <ul className="px-2 pb-2 space-y-0.5">
                  {/* Manage workspace (pinned) */}
                  <li>
                    <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm bg-sidebar-accent/50 text-sidebar-accent-foreground">
                      <Grid3X3 className="size-4 shrink-0" />
                      <span className="flex-1 truncate font-medium">Manage workspace</span>
                    </div>
                  </li>

                  {/* Content items */}
                  {currentContent.map((item) => {
                    const Icon = item.icon ? (ITEM_ICON_MAP[item.icon] ?? LayoutTemplate) : LayoutTemplate;
                    const isRenaming = renamingId === item.id;
                    const isBoardActive = item.type === "board" && item.slug && (pathname === `/${item.slug}` || pathname.startsWith(`/${item.slug}/`));

                    return (
                      <li key={item.id}>
                      <div
                        onClick={() => {
                          if (item.type === "board" && item.slug) {
                            router.push(`/${item.slug}`);
                          } else if (item.type === "doc") {
                            router.push(`/doc/${item.id}`);
                          } else if (item.type === "vibe-app") {
                            router.push(`/vibe/${item.id}`);
                          } else if (item.type === "form") {
                            router.push(`/form/${item.id}`);
                          } else if (item.type === "folder") {
                            router.push(`/folder/${item.id}`);
                          }
                        }}
                        className={cn(
                          "group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                          isBoardActive
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : "hover:bg-sidebar-accent",
                        )}
                      >
                          {isRenaming ? (
                            <input
                              ref={renameInputRef}
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onBlur={handleRenameCommit}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleRenameCommit();
                                if (e.key === "Escape") {
                                  setRenamingId(null);
                                  setRenameValue("");
                                }
                              }}
                              className="flex-1 rounded border border-border bg-background px-1.5 py-0.5 text-xs outline-none focus:ring-1 focus:ring-ring"
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <>
                             <Icon className={cn("size-4 shrink-0", isBoardActive ? "text-sidebar-accent-foreground" : "text-sidebar-muted-foreground")} />
                               <span className="flex-1 truncate">{item.name}</span>
                               {item.type === "board" && (
                                 <FavoriteStar
                                   itemId={item.id}
                                   itemType="board"
                                   isFavorited={favoritedBoardIds.has(item.id) || item.isFavorite}
                                   variant="sidebar"
                                   onToggle={(favorited) => {
                                     toggleBoardFavorite(item.id, favorited);
                                     updateBoardFavorite(item.id, favorited);
                                   }}
                                 />
                               )}
                               <ContentItemMenu
                                 item={item}
                                 onRename={handleRenameItem}
                                 onDelete={handleDeleteItem}
                                 onDuplicate={handleDuplicateItem}
                                 onArchive={handleArchiveItem}
                                 onToggleFavorite={handleToggleFavorite}
                               />
                            </>
                          )}
                        </div>
                      </li>
                    );
                  })}

                  {/* Build Vibe app (custom item) */}
                  <li>
                    <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-sidebar-accent">
                      <Heart className="size-4 shrink-0 text-rose-500" />
                      <span className="flex-1 truncate">Build Vibe app</span>
                    </div>
                  </li>
                </ul>
              )}
            </div>
          </div>
        )}
      </aside>

      {/* ── Create Workspace Modal ─────────────────────── */}
      {showCreateWorkspace && (
        <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-lg popover-surface p-4">
            <h3 className="text-sm font-semibold">Create new workspace</h3>
            <input
              autoFocus
              value={newWorkspaceName}
              onChange={(e) => setNewWorkspaceName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateWorkspace()}
              placeholder="Workspace name"
              className="mt-2 w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={() => { setShowCreateWorkspace(false); setNewWorkspaceName(""); }}
                className="rounded-md px-3 py-1.5 text-xs hover:bg-accent"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateWorkspace}
                disabled={!newWorkspaceName.trim() || isCreatingWorkspace}
                className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-50"
              >
                {isCreatingWorkspace ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation ────────────────────────── */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={(open) => {
          setDeleteConfirmOpen(open);
          if (!open) {
            setDeletingId(null);
          }
        }}
        title={`Delete "${deletingId ? workspaces.find((w) => w.id === deletingId)?.name : ""}"?`}
        description="This will permanently delete all boards and data inside it. This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleConfirmDelete}
        loading={isDeleting}
      />
    </TooltipProvider>
  );
}
