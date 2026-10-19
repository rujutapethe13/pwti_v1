"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Trash2, Star } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MembersAccessModal } from "@/components/shared/members-access-modal";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace-context";
import { useScopeAccess } from "@/lib/members-client";
import { deleteBoard } from "@/features/boards/engine/actions";

const TABS = [
  { id: "general", label: "General" },
  { id: "members", label: "Members" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export interface BoardSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  boardId: string;
  workspaceId: string;
  boardName: string;
  description?: string;
}

export function BoardSettingsDialog({
  open,
  onOpenChange,
  boardId,
  workspaceId,
  boardName,
  description,
}: BoardSettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<TabId>("general");
  const [membersOpen, setMembersOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);

  const router = useRouter();
  const { toggleBoardFavorite, isBoardFavorited, workspaces } = useWorkspace();
  const { isOwner, access } = useScopeAccess("board", workspaceId, boardId);

  const canDelete = isOwner || access === "owner" || access === "edit";
  const isFavorited = isBoardFavorited(boardId);

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (!next) {
      setActiveTab("general");
      setDeleteDialogOpen(false);
      setConfirmName("");
    }
  }

  async function handleDelete() {
    if (confirmName !== boardName) {
      toast.error("Board name does not match");
      return;
    }
    setDeleting(true);
    try {
      const result = await deleteBoard(boardId, false);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Board deleted");
      setDeleteDialogOpen(false);
      handleOpenChange(false);
      // Navigate to first remaining board in workspace or workspace overview
      const currentWs = workspaces.find((w) => w.id === workspaceId);
      if (currentWs) {
        const otherBoard = currentWs.content.find((c) => c.type === "board" && c.id !== boardId);
        if (otherBoard) {
          router.push(`/boards/${otherBoard.id}`);
          return;
        }
      }
      router.push("/boards");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete board";
      toast.error(message);
    } finally {
      setDeleting(false);
    }
  }

  async function handleToggleFavorite() {
    try {
      await toggleBoardFavorite(boardId, !isFavorited);
      toast.success(isFavorited ? "Removed from favorites" : "Added to favorites");
    } catch {
      // handled in context
    }
  }

  const deleteConfirmed = confirmName === boardName && !deleting;

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="gap-0 bg-background p-0 sm:max-w-xl">
          <DialogHeader className="space-y-1 px-6 pt-6">
            <DialogTitle className="text-foreground">Board settings</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {boardName}
              {description ? ` — ${description}` : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-6 border-b border-border px-6" role="tablist" aria-label="Board settings">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "border-b-2 pb-2 text-sm font-medium transition-colors",
                  activeTab === tab.id
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="max-h-[55vh] overflow-y-auto px-6 py-5">
            {activeTab === "general" && (
              <div role="tabpanel" className="space-y-6">
                <div className="space-y-3">
                  <div className="flex items-center justify-between rounded-lg border border-border p-4">
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium">Favorite board</h4>
                      <p className="text-xs text-muted-foreground">
                        Add this board to your Favorites in the sidebar
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleToggleFavorite}
                      className="gap-1.5"
                    >
                      <Star
                        className={cn(
                          "size-4",
                          isFavorited && "fill-yellow-400 text-yellow-400",
                        )}
                        aria-hidden="true"
                      />
                      {isFavorited ? "Remove from favorites" : "Favorite board"}
                    </Button>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="rounded-lg border border-destructive/50 p-4">
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <h4 className="text-sm font-medium text-destructive">Danger zone</h4>
                        <p className="text-xs text-muted-foreground">
                          Permanently delete this board and all its data
                        </p>
                      </div>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setDeleteDialogOpen(true)}
                        disabled={!canDelete}
                        className="gap-1.5"
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                        Delete board
                      </Button>
                      {!canDelete && (
                        <p className="text-xs text-muted-foreground">
                          Only owners and admins can delete boards
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "members" && (
              <div role="tabpanel" className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Workspace members inherit their access to this board. Override
                  anyone&apos;s access here for this board only.
                </p>
                <Button variant="outline" className="w-full" onClick={() => setMembersOpen(true)}>
                  Manage members
                </Button>
              </div>
            )}
          </div>

          <DialogFooter className="border-t border-border px-6 py-4">
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MembersAccessModal
        open={membersOpen}
        onOpenChange={setMembersOpen}
        scope={{ kind: "board", id: boardId }}
        workspaceId={workspaceId}
        subjectName={boardName}
      />

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete board</DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete <strong>{boardName}</strong> and all its
              columns, records, and cell values.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Type the board name <strong>{boardName}</strong> to confirm:
            </p>
            <Input
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder={boardName}
              autoFocus
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setDeleteDialogOpen(false);
                setConfirmName("");
              }}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={!deleteConfirmed || deleting}
            >
              {deleting ? "Deleting..." : "Delete board"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}