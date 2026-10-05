"use client";

import { useState } from "react";
import { Copy, MoreHorizontal, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

export interface WorkspaceOptionsMenuProps {
  workspaceName?: string;
  onRenameWorkspace?: (name: string) => void | Promise<void>;
  onDuplicateWorkspace?: (name: string) => void | Promise<void>;
  onDeleteWorkspace?: () => void | Promise<void>;
}

export function WorkspaceOptionsMenu({
  workspaceName = "Workspace",
  onRenameWorkspace = () => {},
  onDuplicateWorkspace = () => {},
  onDeleteWorkspace = () => {},
}: WorkspaceOptionsMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState(workspaceName);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [duplicateValue, setDuplicateValue] = useState(`${workspaceName} (copy)`);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteValue, setDeleteValue] = useState("");

  const handleRename = async () => {
    const trimmed = renameValue.trim();
    if (!trimmed) return;
    try {
      await onRenameWorkspace(trimmed);
    } catch {
      toast.error("Failed to rename workspace.");
    }
    setRenameOpen(false);
    setMenuOpen(false);
  };

  const handleDuplicate = async () => {
    const trimmed = duplicateValue.trim();
    if (!trimmed) return;
    try {
      await onDuplicateWorkspace(trimmed);
      toast.success(`"${trimmed}" duplicated.`);
    } catch {
      toast.error("Failed to duplicate workspace.");
    }
    setDuplicateOpen(false);
    setMenuOpen(false);
  };

  const handleDelete = async () => {
    if (deleteValue.trim() !== workspaceName) return;
    try {
      await onDeleteWorkspace();
      toast.success(`"${workspaceName}" deleted.`);
    } catch {
      toast.error("Failed to delete workspace.");
    }
    setDeleteOpen(false);
    setDeleteValue("");
    setMenuOpen(false);
  };

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="size-7 shrink-0"
            aria-label="Workspace options"
          >
            <MoreHorizontal className="size-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="bottom" className="w-44">
          <DropdownMenuItem
            onClick={() => {
              setRenameValue(workspaceName);
              setRenameOpen(true);
              setMenuOpen(false);
            }}
            className="gap-2"
          >
            <Pencil className="size-3.5" aria-hidden="true" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              setDuplicateValue(`${workspaceName} (copy)`);
              setDuplicateOpen(true);
              setMenuOpen(false);
            }}
            className="gap-2"
          >
            <Copy className="size-3.5" aria-hidden="true" />
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              setDeleteValue("");
              setDeleteOpen(true);
              setMenuOpen(false);
            }}
            className="gap-2 text-destructive focus:bg-destructive/10 focus:text-destructive"
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename workspace</DialogTitle>
            <DialogDescription>
              Update the name of this workspace.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleRename();
            }}
            placeholder="Workspace name"
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRename}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={duplicateOpen} onOpenChange={setDuplicateOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Duplicate workspace</DialogTitle>
            <DialogDescription>
              Create a copy of this workspace under a new name.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={duplicateValue}
            onChange={(e) => setDuplicateValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleDuplicate();
            }}
            placeholder="Workspace name"
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDuplicateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleDuplicate}>Duplicate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete workspace</DialogTitle>
            <DialogDescription>
              Type <strong>{workspaceName}</strong> to confirm. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={deleteValue}
            onChange={(e) => setDeleteValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleDelete();
            }}
            placeholder={workspaceName}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteValue.trim() !== workspaceName}
            >
              Delete workspace
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
