"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  Plus,
  Check,
  Search,
  Settings2,
  Bot,
  Briefcase,
  Star,
  PanelRightClose,
  PanelRightOpen,
  FileText,
  Users,
  Receipt,
  Palette,
  LayoutTemplate,
  Heart,
  Grid3X3,
  LayoutGrid,
  Pencil,
  ArrowUpDown,
  Trash2,
  Archive,
  Zap,
  FileCog,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { cn, toErrorMessage } from "@/lib/utils";
import { usePersistedState } from "@/lib/storage";
import { useWorkspace, type ContentItem, type WorkspaceEntry } from "@/lib/workspace-context";
import { useWorkspacePermission } from "@/lib/workspace-permissions";
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
import { ConfirmDialog } from "@/features/boards/engine/components/confirm-dialog";
import { toast } from "sonner";
import { AddNewMenu } from "@/components/shared/add-new-menu";
import { MembersAccessModal } from "@/components/shared/members-access-modal";

function getInitials(name: string) {
  return name.charAt(0).toUpperCase();
}

function ItemIcon({ item, className }: { item: ContentItem; className?: string }) {
  const iconMap: Record<string, typeof Settings2> = {
    Settings2,
    FileText,
    Users,
    Receipt,
    Palette,
    Bot,
    LayoutTemplate,
    Grid3X3,
    Heart,
    Zap,
    FileCog,
  };
  const Icon = item.icon ? (iconMap[item.icon] ?? LayoutTemplate) : LayoutTemplate;
  return <Icon className={cn("size-4 shrink-0 text-muted-foreground", className)} aria-hidden="true" />;
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
            "flex size-6 shrink-0 items-center justify-center rounded opacity-0 transition-opacity",
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
          <Pencil className="mr-2 size-3.5" />
          Rename
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => onDelete(workspace)}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="mr-2 size-3.5" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function WorkspacePanel() {
  const pathname = usePathname();
  // Widened to `string` so comparisons are not narrowed to a single literal by
  // an enclosing `pathname === "..."` guard further down the tree.
  const currentPath: string = pathname;
  const router = useRouter();
  const {
    workspaces,
    activeWorkspaceId,
    activeWorkspace,
    switchWorkspace,
    createWorkspace,
    renameWorkspace,
    deleteWorkspace,
    updateBoardFavorite,
    renameFolder,
    sidebarCollapsed,
    toggleSidebar,
    hasHydrated,
  } = useWorkspace();

  const [showDropdown, setShowDropdown] = useState(false);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showBrowse, setShowBrowse] = useState(false);
  const [newName, setNewName] = useState("");
  const [agentsOpen, setAgentsOpen] = useState(false);
  const [contentOpen, setContentOpen] = useState(true);
  const [folderOpen, setFolderOpen] = useState<Record<string, boolean>>({});
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [workspaceToDelete, setWorkspaceToDelete] = useState<{ id: string; name: string } | null>(null);
  const [searchQuery] = useState("");

  // Workspace "..." menu feature state (persisted to sessionStorage)
  const [showManage, setShowManage] = useState(false);
  const [showRenameWs, setShowRenameWs] = useState(false);
  const [renameWsValue, setRenameWsValue] = useState("");
  const [workspaceDeleteOpen, setWorkspaceDeleteOpen] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [iconValue, setIconValue] = useState("");
  const [wsIcons, setWsIcons] = usePersistedState<Record<string, string>>("workspace-icons", {});
  const [foldersCollapsed, setFoldersCollapsed] = usePersistedState<boolean>("workspace-folders-collapsed", false);
  const [alphaSort, setAlphaSort] = usePersistedState<boolean>("workspace-sort-alpha", false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredWorkspaces = workspaces.filter((w) =>
    w.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    console.log(`[workspace-panel] handleCreate started for: "${newName.trim()}"`);
    setIsCreating(true);
    try {
      await Promise.race([
        createWorkspace(newName.trim()),
        new Promise((_resolve, reject) => {
          setTimeout(() => reject(new Error("Workspace creation timed out after 30000ms")), 30000);
        }),
      ]);
      console.log(`[workspace-panel] handleCreate succeeded`);
      setNewName("");
      setShowCreate(false);
      setShowDropdown(false);
    } catch (err) {
      const message = toErrorMessage(err, "Failed to create workspace.");
      console.error(`[workspace-panel] handleCreate failed:`, err);
      toast.error(message);
    } finally {
      setIsCreating(false);
      setShowCreate(false);
    }
  };

  const handleCommitRename = async () => {
    if (!renamingId || !renameValue.trim()) return;
    await renameWorkspace(renamingId, renameValue.trim());
    setRenamingId(null);
    setRenameValue("");
  };

  const handleCommitFolderRename = async () => {
    if (!renamingId || !renameValue.trim()) return;
    await renameFolder(renamingId, renameValue.trim());
    setRenamingId(null);
    setRenameValue("");
  };

  const handleWorkspaceRename = () => {
    if (!renameWsValue.trim() || !activeWorkspaceId) return;
    renameWorkspace(activeWorkspaceId, renameWsValue.trim());
    setShowRenameWs(false);
    setRenameWsValue("");
  };

  const handleWorkspaceDelete = async () => {
    if (!workspaceToDelete) return;
    setIsDeleting(true);
    try {
      await deleteWorkspace(workspaceToDelete.id);
      toast.success(`"${workspaceToDelete.name}" deleted.`);
    } catch {
      // deleteWorkspace already surfaced the real reason.
    } finally {
      setIsDeleting(false);
      setWorkspaceDeleteOpen(false);
      setWorkspaceToDelete(null);
    }
  };

  const handleChangeIcon = () => {
    if (!activeWorkspaceId) return;
    // TODO: wire to backend — persist workspace icon server-side
    setWsIcons((prev) => ({ ...prev, [activeWorkspaceId]: iconValue }));
    setShowIconPicker(false);
  };

  const handleConfirmDelete = async () => {
    if (!workspaceToDelete) return;
    if (workspaces.length <= 1) {
      toast.error("You must have at least one workspace.");
      setDeleteConfirmOpen(false);
      setWorkspaceToDelete(null);
      return;
    }
    const nextWorkspace = workspaces.find((w) => w.id !== workspaceToDelete!.id);
    setIsDeleting(true);
    try {
      // deleteWorkspace switches the active workspace itself when
      // the deleted one was active.
      await deleteWorkspace(workspaceToDelete.id);
      setDeleteConfirmOpen(false);
      if (nextWorkspace && activeWorkspaceId === workspaceToDelete.id) {
        switchWorkspace(nextWorkspace.id);
      }
    } catch {
      // deleteWorkspace already surfaced the real reason.
    } finally {
      setWorkspaceToDelete(null);
      setIsDeleting(false);
    }
  };

  const toggleFolder = (folderId: string) => {
    setFolderOpen((prev) => ({ ...prev, [folderId]: !prev[folderId] }));
  };

  const currentContent = activeWorkspace?.content ?? [];
  const displayContent = alphaSort
    ? [...currentContent].sort((a, b) => a.name.localeCompare(b.name))
    : currentContent;

  if (!hasHydrated) {
    return (
      <aside className="flex w-72 shrink-0 flex-col border-r bg-background" aria-label="Workspace panel">
        <div className="flex h-12 items-center border-b px-3">
          <span className="text-sm font-semibold">Workspace</span>
        </div>
        <div className="flex-1" />
      </aside>
    );
  }

  if (sidebarCollapsed) {
    return (
      <aside className="flex w-12 shrink-0 flex-col items-center border-r bg-muted/30 py-3" aria-label="Workspace panel collapsed">
        <button
          onClick={toggleSidebar}
          className="mb-2 flex size-8 items-center justify-center rounded-lg hover:bg-accent"
          aria-label="Expand workspace panel"
        >
          <PanelRightOpen className="size-4" aria-hidden="true" />
        </button>
        <div className="flex flex-col gap-2">
          {workspaces.map((ws) => (
            <button
              key={ws.id}
              onClick={() => switchWorkspace(ws.id)}
              className={cn(
                "flex size-8 items-center justify-center rounded-lg text-xs font-bold",
                ws.id === activeWorkspaceId ? "ring-2 ring-foreground/20" : "hover:bg-accent",
              )}
              style={{ backgroundColor: ws.color, color: "#fff" }}
              aria-label={ws.name}
            >
              {getInitials(ws.name)}
            </button>
          ))}
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r bg-background" aria-label="Workspace panel">
      {/* Header */}
      <div className="flex h-12 items-center justify-between border-b border-border px-3">
        <span className="text-sm font-semibold">Workspace</span>
        <div className="flex items-center gap-0.5">
          <DropdownMenu open={workspaceMenuOpen} onOpenChange={setWorkspaceMenuOpen}>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  "flex size-7 items-center justify-center rounded-md transition-colors",
                  workspaceMenuOpen ? "bg-accent text-foreground" : "hover:bg-accent",
                )}
                aria-label="More options"
              >
                <MoreHorizontal className="size-4" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="bottom" className="w-56">
              <DropdownMenuItem
                className="gap-2 rounded-sm"
                onClick={() => { setShowManage(true); setWorkspaceMenuOpen(false); }}
              >
                <Grid3X3 className="size-4" aria-hidden="true" />
                Manage workspace
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="gap-2 rounded-sm">
                  <Pencil className="size-4" aria-hidden="true" />
                  Edit workspace
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-48">
                  <DropdownMenuItem
                    className="gap-2 rounded-sm"
                    onClick={() => {
                      setRenameWsValue(activeWorkspace?.name ?? "");
                      setShowRenameWs(true);
                      setWorkspaceMenuOpen(false);
                    }}
                  >
                    <Pencil className="size-4" aria-hidden="true" />
                    Rename workspace
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="gap-2 rounded-sm"
                    onClick={() => {
                      setIconValue(wsIcons[activeWorkspaceId ?? ""] ?? "🗂️");
                      setShowIconPicker(true);
                      setWorkspaceMenuOpen(false);
                    }}
                  >
                    <Palette className="size-4" aria-hidden="true" />
                    Change icon
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuItem
                className="gap-2 rounded-sm"
                onClick={() => { setMembersOpen(true); setWorkspaceMenuOpen(false); }}
              >
                <UserPlus className="size-4" aria-hidden="true" />
                Add members
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="gap-2 rounded-sm">
                  <ArrowUpDown className="size-4" aria-hidden="true" />
                  Sort workspace
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-48">
                  <DropdownMenuItem
                    className="gap-2 rounded-sm"
                    onClick={() => { setFoldersCollapsed(true); setWorkspaceMenuOpen(false); }}
                  >
                    <ChevronDown className="size-4" aria-hidden="true" />
                    Collapse all folders
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="gap-2 rounded-sm"
                    onClick={() => { setAlphaSort(true); setWorkspaceMenuOpen(false); }}
                  >
                    <ArrowUpDown className="size-4" aria-hidden="true" />
                    Sort by alphabetical order
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuItem
                disabled={workspaces.length <= 1}
                onClick={() => {
                  if (activeWorkspace) {
                    setWorkspaceToDelete({ id: activeWorkspace.id, name: activeWorkspace.name });
                    setWorkspaceDeleteOpen(true);
                  }
                  setWorkspaceMenuOpen(false);
                }}
                className="gap-2 rounded-sm text-destructive"
              >
                <Trash2 className="size-4" aria-hidden="true" />
                Delete workspace
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="gap-2 rounded-sm"
                onClick={() => { setShowCreate(true); setShowDropdown(false); setWorkspaceMenuOpen(false); }}
              >
                <Plus className="size-4" aria-hidden="true" />
                Add new workspace
              </DropdownMenuItem>
              <DropdownMenuItem
                className="gap-2 rounded-sm"
                onClick={() => { setShowBrowse(true); setWorkspaceMenuOpen(false); }}
              >
                <LayoutGrid className="size-4" aria-hidden="true" />
                Browse all workspaces
              </DropdownMenuItem>
              <DropdownMenuItem
                className="gap-2 rounded-sm"
                onClick={() => { setShowArchive(true); setWorkspaceMenuOpen(false); }}
              >
                <Archive className="size-4" aria-hidden="true" />
                View archive/trash
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <Link
                href="/workspace"
                onClick={() => setWorkspaceMenuOpen(false)}
                className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent"
              >
                <span className="font-semibold">Powerweave Studio</span>
              </Link>
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            className="flex size-7 items-center justify-center rounded-md hover:bg-accent"
            aria-label="Search"
          >
            <Search className="size-4" aria-hidden="true" />
          </button>
          <button
            onClick={toggleSidebar}
            className="flex size-7 items-center justify-center rounded-md hover:bg-accent"
            aria-label="Collapse panel"
          >
            <PanelRightClose className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Workspace Switcher */}
      <div className="border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className={cn(
                "flex w-full items-center gap-2 px-2.5 py-1.5 text-sm transition-colors",
                showDropdown ? "bg-accent" : "hover:bg-accent",
              )}
            >
              <span
                className="flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white"
                style={{ backgroundColor: activeWorkspace?.color ?? "#f97316" }}
              >
                {activeWorkspace ? getInitials(activeWorkspace.name) : "M"}
              </span>
              <span className="flex-1 truncate text-left">{activeWorkspace?.name ?? "Main"}</span>
              <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            </button>
          </div>
          <AddNewMenu />
        </div>

        {/* Dropdown */}
        {showDropdown && (
          <div
            ref={dropdownRef}
            className="absolute left-0 z-[200] mt-1 w-64 rounded-lg bg-white shadow-[0_4px_20px_rgba(0,0,0,0.15)]"
          >
            <div className="p-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                <input
                  placeholder="Search for a workspace"
                  className="h-8 w-full rounded-md border border-gray-200 bg-white pl-8 pr-2.5 text-xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="px-2 pb-2">
              <button
                onClick={() => { setShowCreate(true); setShowDropdown(false); }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50"
              >
                <span className="flex size-5 items-center justify-center rounded-md bg-green-500 text-xs font-bold text-white">
                  N
                </span>
                New Workspace
              </button>
            </div>
            <div className="mx-2 my-1 h-px bg-gray-100" />
            <div className="px-2 py-1.5 text-xs font-medium text-gray-500">My workspaces</div>
            <div className="p-1">
              {filteredWorkspaces.map((ws) => {
                const isActive = ws.id === activeWorkspaceId;
                return (
                  <div
                    key={ws.id}
                    className={cn(
                      "flex items-center gap-1 rounded-md px-2 py-1.5 text-sm",
                      isActive ? "bg-blue-50" : "hover:bg-gray-50",
                    )}
                  >
                    <span
                      className="flex size-5 shrink-0 items-center justify-center rounded-md text-[9px] font-bold text-white"
                      style={{ backgroundColor: ws.color }}
                    >
                      {getInitials(ws.name)}
                    </span>
                    <button
                      onClick={() => { switchWorkspace(ws.id); setShowDropdown(false); }}
                      className="flex-1 truncate text-left"
                    >
                      {ws.name}
                    </button>
                    <WorkspaceRowActions
                      workspace={ws}
                      isActive={isActive}
                      onRename={(workspace) => {
                        setRenamingId(workspace.id);
                        setRenameValue(workspace.name);
                        setShowDropdown(false);
                      }}
                      onDelete={(workspace) => {
                        setWorkspaceToDelete({ id: workspace.id, name: workspace.name });
                        setDeleteConfirmOpen(true);
                      }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="mx-2 my-1 h-px bg-gray-100" />
            <div className="p-1">
              <div className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm text-black hover:bg-gray-50">
                <button
                  type="button"
                  onClick={() => { setShowCreate(true); setShowDropdown(false); }}
                  className="flex items-center gap-2 cursor-pointer text-black"
                >
                  <Plus className="size-4" aria-hidden="true" />
                  Add workspace
                </button>
                <button
                  type="button"
                  onClick={() => { setShowBrowse(true); setShowDropdown(false); }}
                  className="flex items-center gap-2 cursor-pointer text-black"
                >
                  <LayoutGrid className="size-4" aria-hidden="true" />
                  Browse all
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Browse all Modal */}
        {showBrowse && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="w-full max-w-sm rounded-lg border bg-background p-4 shadow-lg">
              <h3 className="text-sm font-semibold">Browse workspaces</h3>
              <ul className="mt-3 max-h-72 space-y-1 overflow-y-auto">
                {workspaces.map((ws) => {
                  const isActive = ws.id === activeWorkspaceId;
                  return (
                    <li key={ws.id}>
                      <button
                        type="button"
                        onClick={() => {
                          switchWorkspace(ws.id);
                          setShowBrowse(false);
                        }}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-left",
                          isActive ? "bg-blue-50" : "hover:bg-accent",
                        )}
                      >
                        <span
                          className="flex size-5 shrink-0 items-center justify-center rounded-md text-[9px] font-bold text-white"
                          style={{ backgroundColor: ws.color }}
                        >
                          {getInitials(ws.name)}
                        </span>
                        <span className="flex-1 truncate">{ws.name}</span>
                        {isActive && <Check className="size-4 text-primary" aria-hidden="true" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-3 flex justify-end">
                <button
                  onClick={() => { setShowBrowse(false); setNewName(""); setShowCreate(true); }}
                  className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground"
                >
                  New workspace
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Create Modal */}
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.15)]">
              <h3 className="text-sm font-semibold">Create new workspace</h3>
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                placeholder="Workspace name"
                className="mt-2 w-full rounded-md border px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <div className="mt-3 flex justify-end gap-2">
                <button
                  onClick={() => { setShowCreate(false); setNewName(""); }}
                  className="rounded-md px-3 py-1.5 text-xs hover:bg-accent"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!newName.trim() || isCreating}
                  className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-50"
                >
                  {isCreating ? "Creating..." : "Create"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* My Agents */}
      <div className="border-t border-border px-3 py-2">
        <button
          onClick={() => setAgentsOpen(!agentsOpen)}
          className="flex w-full items-center gap-2 py-1 text-sm font-medium hover:bg-accent rounded-md px-2"
        >
          {agentsOpen ? <ChevronDown className="size-4" aria-hidden="true" /> : <ChevronRight className="size-4" aria-hidden="true" />}
          <Briefcase className="size-4" aria-hidden="true" />
          <span>My agents</span>
        </button>
        {agentsOpen && (
          <div className="mt-1 pl-8 pr-2 space-y-0.5">
            {(activeWorkspace?.agents ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground py-1">No agents yet</p>
            ) : (
              (activeWorkspace?.agents ?? []).map((agent) => (
                <div key={agent.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent cursor-pointer">
                  <Bot className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="flex-1 truncate">{agent.name}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto border-t border-border">
        <button
          onClick={() => setContentOpen(!contentOpen)}
          className="flex w-full items-center gap-2 py-2 px-3 text-sm font-medium hover:bg-accent"
        >
          {contentOpen ? <ChevronDown className="size-4" aria-hidden="true" /> : <ChevronRight className="size-4" aria-hidden="true" />}
          <span>Content</span>
        </button>

        {contentOpen && (
          <ul className="px-2 pb-2 space-y-0.5">
            {/* Manage workspace (active) */}
            <li>
              <div
                onClick={() => router.push("/workspace/manage")}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer transition-colors",
                  pathname === "/workspace/manage"
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-accent",
                )}
              >
                <Grid3X3 className="size-4 shrink-0" aria-hidden="true" />
                <span className="flex-1 truncate font-medium">Manage workspace</span>
              </div>
              {/* Nested under Manage workspace: Compiled */}
              {pathname === "/workspace/manage" && (
                <ul className="ml-4 mt-0.5 space-y-0.5">
                  <li>
                    <div
                      onClick={() => router.push("/workspace/manage/compiled")}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer transition-colors",
                        currentPath === "/workspace/manage/compiled"
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-accent",
                      )}
                    >
                      <LayoutGrid className="size-3.5 shrink-0" aria-hidden="true" />
                      <span className="flex-1 truncate">Compiled</span>
                    </div>
                  </li>
                </ul>
              )}
            </li>

            {/* Content items */}
            {displayContent.map((item) => {
              const isFolder = item.type === "folder";
              const isOpen = foldersCollapsed ? false : folderOpen[item.id];
              const isRenaming = renamingId === item.id;
              const isBoardActive = item.type === "board" && item.slug && (pathname === `/${item.slug}` || pathname.startsWith(`/${item.slug}/`));

              return (
                <li key={item.id}>
                    <div
                      onClick={() => {
                        console.warn(`[WorkspacePanel] Board clicked:`, { id: item.id, name: item.name, slug: item.slug, type: item.type });
                        if (item.type === "board" && item.slug) {
                          console.warn(`[WorkspacePanel] Navigating to: /${item.slug}`);
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
                        "group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors cursor-pointer",
                        isBoardActive
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-accent",
                      )}
                    >
                    {isFolder ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleFolder(item.id); }}
                        className="flex size-5 items-center justify-center rounded hover:bg-accent"
                        aria-label={isOpen ? "Collapse folder" : "Expand folder"}
                      >
                        {isOpen ? (
                          <ChevronDown className="size-3.5" aria-hidden="true" />
                        ) : (
                          <ChevronRight className="size-3.5" aria-hidden="true" />
                        )}
                      </button>
                    ) : (
                      <span className="w-5" />
                    )}
                    {isRenaming ? (
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={handleCommitFolderRename}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleCommitFolderRename();
                          if (e.key === "Escape") {
                            setRenamingId(null);
                            setRenameValue("");
                          }
                        }}
                        className="flex-1 rounded border px-1 py-0.5 text-xs outline-none focus:ring-1 focus:ring-ring"
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <>
                        <ItemIcon item={item} className={isBoardActive ? "text-accent-foreground" : undefined} />
                        <span className="flex-1 truncate">{item.name}</span>
                        {item.type === "board" && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const newFav = !item.isFavorite;
                              updateBoardFavorite(item.id, newFav);
                            }}
                            className={cn(
                              "flex size-5 items-center justify-center rounded hover:bg-accent opacity-0 group-hover:opacity-100",
                              item.isFavorite ? "text-yellow-500" : "text-muted-foreground",
                            )}
                            aria-label={item.isFavorite ? "Unfavorite" : "Favorite"}
                          >
                            <Star className={cn("size-3.5", item.isFavorite && "fill-current")} aria-hidden="true" />
                          </button>
                        )}
                        {isFolder && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setRenamingId(item.id);
                              setRenameValue(item.name);
                            }}
                            className="flex size-5 items-center justify-center rounded hover:bg-accent opacity-0 group-hover:opacity-100"
                            aria-label="Rename folder"
                          >
                            <Pencil className="size-3.5" aria-hidden="true" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                  {isFolder && isOpen && item.children && (
                    <ul className="ml-4 mt-0.5 space-y-0.5">
                      {item.children.map((child) => {
                        const isChildBoardActive = child.type === "board" && child.slug && (pathname === `/${child.slug}` || pathname.startsWith(`/${child.slug}/`));
                        return (
                          <li key={child.id}>
                              <div
                                onClick={() => {
                                  console.warn(`[WorkspacePanel] Child board clicked:`, { id: child.id, name: child.name, slug: child.slug, type: child.type });
                                  if (child.type === "board" && child.slug) {
                                    console.warn(`[WorkspacePanel] Navigating to: /${child.slug}`);
                                    router.push(`/${child.slug}`);
                                  } else if (child.type === "doc") {
                                    router.push(`/doc/${child.id}`);
                                  } else if (child.type === "vibe-app") {
                                    router.push(`/vibe/${child.id}`);
                                  } else if (child.type === "form") {
                                    router.push(`/form/${child.id}`);
                                  }
                                }}
                              className={cn(
                                "group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors cursor-pointer",
                                isChildBoardActive
                                  ? "bg-accent text-accent-foreground"
                                  : "hover:bg-accent",
                              )}
                            >
                              <ItemIcon item={child} className={isChildBoardActive ? "text-accent-foreground" : undefined} />
                              <span className="flex-1 truncate">{child.name}</span>
                              {child.type === "board" && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const newFav = !child.isFavorite;
                                    updateBoardFavorite(child.id, newFav);
                                  }}
                                  className={cn(
                                    "flex size-5 items-center justify-center rounded hover:bg-accent opacity-0 group-hover:opacity-100",
                                    child.isFavorite ? "text-yellow-500" : "text-muted-foreground",
                                  )}
                                  aria-label={child.isFavorite ? "Unfavorite" : "Favorite"}
                                >
                                  <Star className={cn("size-3.5", child.isFavorite && "fill-current")} aria-hidden="true" />
                                </button>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
            {/* Build Vibe app pinned at bottom */}
            <li>
              <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent cursor-pointer">
                <Heart className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="flex-1 truncate">Build Vibe app</span>
              </div>
            </li>
          </ul>
        )}
      </div>

      {/* Rename modal */}
      {renamingId && currentContent.find((i) => i.id === renamingId)?.type !== "folder" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-lg border bg-background p-4 shadow-lg">
            <h3 className="text-sm font-semibold">Rename workspace</h3>
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCommitRename()}
              className="mt-2 w-full rounded-md border px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={() => { setRenamingId(null); setRenameValue(""); }}
                className="rounded-md px-3 py-1.5 text-xs hover:bg-accent"
              >
                Cancel
              </button>
              <button
                onClick={handleCommitRename}
                disabled={!renameValue.trim()}
                className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Workspace settings (Manage workspace) — stub */}
      {showManage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.15)]">
            <h3 className="text-sm font-semibold">Workspace settings</h3>
            {/* TODO: wire to backend — load/save real workspace settings */}
            <div className="mt-3 space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Name</label>
                <input
                  defaultValue={activeWorkspace?.name}
                  readOnly
                  className="mt-1 w-full rounded-md border px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Description</label>
                <input
                  defaultValue={activeWorkspace?.description}
                  readOnly
                  className="mt-1 w-full rounded-md border px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button onClick={() => setShowManage(false)} className="rounded-md px-3 py-1.5 text-xs hover:bg-accent">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Workspace Rename Modal */}
      {showRenameWs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.15)]">
            <h3 className="text-sm font-semibold">Rename workspace</h3>
            <input
              autoFocus
              value={renameWsValue}
              onChange={(e) => setRenameWsValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleWorkspaceRename()}
              placeholder="Workspace name"
              className="mt-2 w-full rounded-md border px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => { setShowRenameWs(false); setRenameWsValue(""); }} className="rounded-md px-3 py-1.5 text-xs hover:bg-accent">
                Cancel
              </button>
              <button
                onClick={handleWorkspaceRename}
                disabled={!renameWsValue.trim()}
                className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change icon picker */}
      {showIconPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.15)]">
            <h3 className="text-sm font-semibold">Change workspace icon</h3>
            <div className="mt-3 grid grid-cols-6 gap-2">
              {["🗂️", "📁", "⭐", "🚀", "💡", "🎨", "📊", "🔧", "🌟", "🧩", "🏢", "📌"].map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => setIconValue(emoji)}
                  className={cn(
                    "flex size-9 items-center justify-center rounded-md border text-lg",
                    iconValue === emoji ? "border-primary bg-blue-50" : "hover:bg-accent",
                  )}
                  aria-label={`Select ${emoji} icon`}
                >
                  {emoji}
                </button>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setShowIconPicker(false)} className="rounded-md px-3 py-1.5 text-xs hover:bg-accent">
                Cancel
              </button>
              <button onClick={handleChangeIcon} className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground">
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Archive / trash modal — stub */}
      {showArchive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.15)]">
            <h3 className="text-sm font-semibold">Archive / trash</h3>
            {/* TODO: wire to backend — fetch archived/trashed items */}
            <p className="mt-3 text-sm text-muted-foreground">No archived items yet.</p>
            <div className="mt-4 flex justify-end">
              <button onClick={() => setShowArchive(false)} className="rounded-md px-3 py-1.5 text-xs hover:bg-accent">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Members & access */}
      <MembersAccessModal
        open={membersOpen}
        onOpenChange={setMembersOpen}
        scope={activeWorkspaceId ? { kind: "workspace", id: activeWorkspaceId } : null}
        workspaceId={activeWorkspaceId ?? undefined}
        subjectName={activeWorkspace?.name}
      />

      {/* Workspace Delete confirmation */}
      <ConfirmDialog
        open={workspaceDeleteOpen}
        onOpenChange={(open) => {
          setWorkspaceDeleteOpen(open);
          if (!open) {
            setWorkspaceToDelete(null);
          }
        }}
        title={workspaceToDelete ? `Delete "${workspaceToDelete.name}"?` : "Delete workspace?"}
        description="This will permanently delete all boards and data inside it. This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleWorkspaceDelete}
        loading={isDeleting}
      />

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={(open) => {
          setDeleteConfirmOpen(open);
          if (!open) {
            setWorkspaceToDelete(null);
          }
        }}
        title={workspaceToDelete ? `Delete "${workspaceToDelete.name}"?` : "Delete workspace?"}
        description="This will permanently delete all boards and data inside it. This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleConfirmDelete}
        loading={isDeleting}
      />
    </aside>
  );
}