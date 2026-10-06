"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Star,
  Bot,
  Users2,
  MoreHorizontal,
  ChevronDown,
  History,
  Pencil,
  Users,
  Lock,
  Hand,
  Settings2,
  FileText,
  Receipt,
  Palette,
  LayoutTemplate,
  Search,
  SlidersHorizontal,
  Trash2,
  HardDrive,
  Grid3X3,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useWorkspace, type ContentItem } from "@/lib/workspace-context";
import { useCurrentUser, userInitials } from "@/lib/user-context";
import { EmptyState } from "@/components/shared/empty-state";
import { FavoriteStar } from "@/components/shared/favorite-star";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MembersAccessModal } from "@/components/shared/members-access-modal";
import { ConfirmDialog } from "@/features/boards/engine/components/confirm-dialog";

function getInitials(name: string) {
  return name.charAt(0).toUpperCase();
}

function BoardIcon({ name }: { name: string }) {
  const map: Record<string, typeof Settings2> = {
    Settings2,
    FileText,
    Users,
    Receipt,
    Palette,
    Bot,
  };
  const Icon = map[name] ?? LayoutTemplate;
  return <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />;
}

function PointingHandIcon() {
  return (
    <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-muted/60">
      <Hand className="size-8 text-muted-foreground" aria-hidden="true" />
    </div>
  );
}

export default function WorkspacePage() {
  const router = useRouter();
  const {
    activeWorkspaceId,
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
  } = useWorkspace();

  const [headerDropdown, setHeaderDropdown] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState("");
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [editDesc, setEditDesc] = useState("");
  const [activeTab, setActiveTab] = useState("recents");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);
  const descInputRef = useRef<HTMLInputElement>(null);
  const headerDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (headerDropdownRef.current && !headerDropdownRef.current.contains(e.target as Node)) {
        setHeaderDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [isEditingName]);

  useEffect(() => {
    if (isEditingDesc && descInputRef.current) {
      descInputRef.current.focus();
    }
  }, [isEditingDesc]);

  // The member's own identity, shared with the top bar through UserProvider
  // rather than fetched again here. The previous local copy resolved the name
  // from auth metadata and defaulted to "User", which is why the workspace page
  // and the top bar could show different people.
  const { user } = useCurrentUser();

  const handleNameClick = () => {
    if (!activeWorkspace) return;
    setEditName(activeWorkspace.name);
    setIsEditingName(true);
    setHeaderDropdown(false);
  };

  const handleNameBlur = () => {
    if (editName.trim() && editName.trim() !== activeWorkspace?.name) {
      renameWorkspace(activeWorkspaceId!, editName.trim());
    }
    setIsEditingName(false);
    setEditName("");
  };

  const handleDescBlur = () => {
    setIsEditingDesc(false);
    setEditDesc("");
  };

  const [showSettings, setShowSettings] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const isFav = activeWorkspaceId ? favoritedWorkspaceIds.has(activeWorkspaceId) : false;

  const handleRename = () => {
    handleNameClick();
  };

  const handleToggleFavorite = async () => {
    if (!activeWorkspaceId) return;
    const currentlyFav = isFav;
    await toggleWorkspaceFavorite(activeWorkspaceId, !currentlyFav);
    setHeaderDropdown(false);
  };

  const handleShare = () => {
    setShowShare(true);
    setHeaderDropdown(false);
  };

  const handleSettings = () => {
    setShowSettings(true);
    setHeaderDropdown(false);
  };

  const handleDuplicate = async () => {
    if (!activeWorkspace) return;
    // TODO: wire to backend — copy content/settings, not just the name
    try {
      const copy = await createWorkspace(`${activeWorkspace.name} (copy)`);
      switchWorkspace(copy.id);
      setHeaderDropdown(false);
      toast.success("Workspace duplicated.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to duplicate workspace.";
      toast.error(message);
    }
  };

  const handleConfirmDelete = async () => {
    if (!activeWorkspaceId) return;
    setIsDeleting(true);
    try {
      await deleteWorkspace(activeWorkspaceId);
      toast.success("Workspace deleted.");
      setDeleteConfirmOpen(false);
      router.push("/workspace");
    } catch {
      toast.error("Failed to delete workspace.");
    } finally {
      setIsDeleting(false);
    }
  };

  const currentBoards = (activeWorkspace?.content ?? []).filter((item): item is ContentItem => item.type === "board");

  const userInitialsLabel = userInitials(user?.name ?? null, user?.email ?? null);

  const tabs = [
    { id: "recents", label: "Recents", icon: History },
    { id: "content", label: "Content", icon: Pencil },
    { id: "collaborators", label: "Collaborators", icon: Users2 },
    { id: "permissions", label: "Permissions", icon: Lock, disabled: true },
  ];

  const [cleanupMode, setCleanupMode] = useState(false);

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="mx-auto max-w-5xl px-6 py-8">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <span className="relative flex size-16 shrink-0 items-center justify-center rounded-lg text-2xl font-bold text-white shadow-sm" style={{ backgroundColor: activeWorkspace?.color ?? "#f97316" }}>
              {activeWorkspace ? getInitials(activeWorkspace.name) : "M"}
              <span className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full bg-white shadow-sm">
                <span className="size-2 rounded-full bg-green-500" aria-hidden="true" />
              </span>
            </span>
            <div>
              {isEditingName ? (
                <input
                  ref={nameInputRef}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={handleNameBlur}
                  onKeyDown={(e) => e.key === "Enter" && handleNameBlur()}
                  className="h-8 rounded-md border border-blue-500 px-2 text-2xl font-bold outline-none focus:ring-2 focus:ring-blue-500"
                />
              ) : (
                <button
                  onClick={handleNameClick}
                  className="group flex items-center gap-1 text-left text-2xl font-bold"
                >
                  <span>{activeWorkspace?.name ?? "Select workspace"}</span>
                  <ChevronDown className="size-4 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
                </button>
              )}
              {isEditingDesc ? (
                <input
                  ref={descInputRef}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  onBlur={handleDescBlur}
                  onKeyDown={(e) => e.key === "Enter" && handleDescBlur()}
                  placeholder="Add workspace description"
                  className="mt-1 h-6 w-80 rounded-md border border-blue-500 px-2 text-sm text-muted-foreground outline-none focus:ring-2 focus:ring-blue-500"
                />
              ) : (
                <button
                  onClick={() => setIsEditingDesc(true)}
                  className="mt-1 text-left text-sm text-muted-foreground hover:text-foreground"
                >
                  Add workspace description
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-full bg-muted" aria-hidden="true">
              {user?.avatarUrl ? (
                <Avatar className="size-8">
                  <AvatarImage src={user.avatarUrl} alt="" />
                  <AvatarFallback className="text-xs font-bold">
                    {userInitialsLabel}
                  </AvatarFallback>
                </Avatar>
              ) : (
                <span className="text-xs font-bold">{userInitialsLabel}</span>
              )}
            </span>
            <button
              onClick={() => setShowMembers(true)}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
            >
              Members
            </button>

            <div className="relative" ref={headerDropdownRef}>
              <button
                onClick={() => setHeaderDropdown(!headerDropdown)}
                className="flex size-8 items-center justify-center rounded-lg hover:bg-accent"
                aria-label="More options"
              >
                <MoreHorizontal className="size-4" aria-hidden="true" />
              </button>
              {headerDropdown && (
                <div className="absolute right-0 mt-1 w-56 rounded-lg border border-gray-200 bg-white py-1 shadow-[0_4px_20px_rgba(0,0,0,0.15)]">
                  <button
                    onClick={handleSettings}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent"
                  >
                    <Settings2 className="size-4 text-muted-foreground" aria-hidden="true" />
                    Settings
                  </button>
                  <button
                    onClick={handleRename}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent"
                  >
                    <Pencil className="size-4 text-muted-foreground" aria-hidden="true" />
                    Rename
                  </button>
                  <button
                    onClick={handleShare}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent"
                  >
                    <Users className="size-4 text-muted-foreground" aria-hidden="true" />
                    Share
                  </button>
                  <div className="my-1 h-px bg-muted" />
                  <button
                    onClick={handleToggleFavorite}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent"
                  >
                    <Star className="size-4 text-muted-foreground" aria-hidden="true" />
                    {isFav ? "Remove from favorites" : "Add to favorites"}
                  </button>
                  <button
                    onClick={handleDuplicate}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent"
                  >
                    <HardDrive className="size-4 text-muted-foreground" aria-hidden="true" />
                    Duplicate
                  </button>
                  <button
                    onClick={() => { setDeleteConfirmOpen(true); setHeaderDropdown(false); }}
                    disabled={isDeleting}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-destructive hover:bg-accent"
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                    {isDeleting ? "Deleting..." : "Delete"}
                  </button>
                  <div className="my-1 h-px bg-muted" />
                  <div className="px-3 py-2">
                    <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Powerweave Studio</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-6 flex gap-6 border-b">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => !tab.disabled && setActiveTab(tab.id)}
                disabled={tab.disabled}
                className={cn(
                  "flex items-center gap-1.5 border-b-2 pb-2 text-sm font-medium transition-colors",
                  activeTab === tab.id
                    ? "border-blue-600 text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                  tab.disabled && "cursor-not-allowed opacity-50",
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                {tab.label}
              </button>
            );
          })}
        </div>

         {/* Tab Content */}
<div className="mt-4">
            {activeTab === "recents" && (
              <>
                {activeWorkspace && currentBoards.length > 0 ? (
                  <ul className="space-y-0.5">
                     {currentBoards.map((board) => {
                       return (
                         <li key={board.id}>
<div
  onClick={() => {
    if (board.slug) {
      router.push(`/${board.slug}`);
    }
  }}
                             className={cn(
                               "flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors cursor-pointer hover:bg-accent",
                             )}
                           >
                            <span className="flex size-8 items-center justify-center rounded-md bg-muted">
                               <Grid3X3 className="size-4 text-muted-foreground" aria-hidden="true" />
                            </span>
                            <span className="flex-1 truncate text-sm font-medium">{board.name}</span>
                            <FavoriteStar
                              itemId={board.id}
                              itemType="board"
                              isFavorited={favoritedBoardIds.has(board.id) || board.isFavorite}
                              variant="sidebar"
                              onToggle={(favorited) => {
                                toggleBoardFavorite(board.id, favorited);
                              }}
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <PointingHandIcon />
                    <h2 className="text-lg font-semibold">Welcome to {activeWorkspace?.name ?? "your workspace"}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">Get started by exploring the content on the left pane</p>
                  </div>
                )}
              </>
            )}

           {activeTab === "content" && (
             <div className="space-y-4">
               <div className="flex items-center justify-between">
                 <div className="flex items-center gap-2">
                   <div className="relative">
                     <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                     <input
                       placeholder="Search assets..."
                       className="h-9 w-64 rounded-lg border bg-background pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                     />
                   </div>
                   <button className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-accent">
                     <SlidersHorizontal className="size-3.5" aria-hidden="true" />
                     Filters
                   </button>
                 </div>
                 <div className="flex items-center gap-3">
                   <span className="text-xs text-muted-foreground">No cleanup suggestions found</span>
                   <button
                     onClick={() => setCleanupMode(!cleanupMode)}
                     className={cn(
                       "inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors",
                       cleanupMode ? "bg-blue-600" : "bg-muted",
                     )}
                   >
                     <span
                       className={cn(
                         "inline-block size-3.5 rounded-full bg-white shadow-sm transition-transform",
                         cleanupMode ? "translate-x-4" : "translate-x-0.5",
                       )}
                     />
                   </button>
                 </div>
               </div>
                <div className="rounded-lg border">
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <HardDrive className="size-10 text-muted-foreground/40 mb-3" aria-hidden="true" />
                    <p className="text-sm text-muted-foreground">No content files</p>
                  </div>
                </div>
              </div>
            )}

           {activeTab === "collaborators" && (
             <div className="space-y-8">
               <div>
                 <h3 className="mb-3 text-sm font-semibold">Agents</h3>
                 <EmptyState
                   icon={Bot}
                   title="No agents yet"
                   description="Invite AI agents to help automate tasks and workflows in this workspace."
                   action={{ label: "Add agent", onClick: () => {} }}
                   compact
                 />
               </div>
<div>
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Users</h3>
                    <button
                      onClick={() => setShowMembers(true)}
                      className="text-xs font-medium text-blue-600 hover:underline"
                    >
                      Members &amp; access
                    </button>
                  </div>
                  <button
                    onClick={() => setShowMembers(true)}
                    className="flex w-full flex-col items-center justify-center rounded-lg border border-gray-200 py-10 text-center hover:bg-accent/40"
                  >
                    <Users2 className="size-8 text-muted-foreground/50" aria-hidden="true" />
                    <span className="mt-2 text-sm font-medium">
                      View members &amp; access
                    </span>
                    <span className="mt-0.5 text-xs text-muted-foreground">
                      Roles, status and last active for everyone in this workspace.
                    </span>
                  </button>
                </div>
             </div>
           )}

            {activeTab === "permissions" && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Lock className="size-10 text-muted-foreground/40 mb-3" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">Permissions settings coming soon.</p>
              </div>
            )}
          </div>

        {/* Workspace Settings Modal */}
        {showSettings && (
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
                <button onClick={() => setShowSettings(false)} className="rounded-md px-3 py-1.5 text-xs hover:bg-accent">
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Share / Invite Modal */}
        {showShare && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.15)]">
              <h3 className="text-sm font-semibold">Share &ldquo;{activeWorkspace?.name}&rdquo;</h3>
              {/* TODO: wire to backend — invite collaborators / generate share link */}
              <input
                placeholder="Email address"
                className="mt-2 w-full rounded-md border px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <div className="mt-4 flex justify-end gap-2">
                <button onClick={() => setShowShare(false)} className="rounded-md px-3 py-1.5 text-xs hover:bg-accent">
                  Cancel
                </button>
                <button
                  onClick={() => { toast.success("Invite sent (mock)."); setShowShare(false); }}
                  className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground"
                >
                  Send invite
                </button>
              </div>
            </div>
          </div>
        )}

        <MembersAccessModal
          open={showMembers}
          onOpenChange={setShowMembers}
          scope={activeWorkspaceId ? { kind: "workspace", id: activeWorkspaceId } : null}
          subjectName={activeWorkspace?.name}
        />

        <ConfirmDialog
          open={deleteConfirmOpen}
          onOpenChange={setDeleteConfirmOpen}
          title={`Delete "${activeWorkspace?.name}"?`}
          description="This will permanently delete the workspace and all its boards and items. This can't be undone."
          confirmLabel="Delete"
          variant="destructive"
          onConfirm={handleConfirmDelete}
          loading={isDeleting}
/>
       </div>
      </div>
    );
  }
