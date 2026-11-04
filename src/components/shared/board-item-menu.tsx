"use client";

import { useState, useRef, useEffect } from "react";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { renameBoard, deleteBoard } from "@/features/boards/engine/actions/board-actions";
import { ConfirmDialog } from "@/features/boards/engine/components/confirm-dialog";

export function BoardItemMenu({ boardId, boardName, workspaceId, onRename }: { boardId: string; boardName: string; workspaceId?: string; onRename?: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(boardName);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setName(boardName); }, [boardName]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", handler); document.removeEventListener("keydown", key); };
  }, [open]);

  async function doDelete() {
    await deleteBoard(boardId);
    setConfirmDelete(false);
  }

  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className="flex size-5 items-center justify-center rounded hover:bg-accent opacity-0 group-hover:opacity-100 focus:opacity-100 group-focus-within:opacity-100"
        aria-label="Board actions"
      >
        <MoreHorizontal className="size-3.5" aria-hidden="true" />
      </button>
      {open && (
        <div className="absolute right-0 top-6 z-50 min-w-[120px] rounded-md border bg-popover p-1 shadow-md">
          <button onClick={() => { setOpen(false); onRename?.(); }} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent">
            <Pencil className="size-3.5" /> Rename
          </button>
          <button onClick={() => { setOpen(false); setConfirmDelete(true); }} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-destructive hover:bg-accent">
            <Trash2 className="size-3.5" /> Delete
          </button>
        </div>
      )}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete '${boardName}'?`}
        description="This will permanently remove the board and all its items. This action cannot be undone."
        confirmLabel="Delete"
        onConfirm={doDelete}
      />
    </div>
  );
}
