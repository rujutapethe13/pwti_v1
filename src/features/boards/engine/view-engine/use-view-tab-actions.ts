"use client";

import { useCallback, useState } from "react";

export function useViewTabActions({
  onRenameView,
  onDuplicateView,
  onDeleteView,
}: {
  onRenameView: (viewId: string, name: string) => Promise<void>;
  onDuplicateView: (viewId: string) => Promise<void>;
  onDeleteView: (viewId: string) => Promise<void>;
}) {
  const [renamingViewId, setRenamingViewId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteConfirmViewId, setDeleteConfirmViewId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleStartRename = useCallback((viewId: string, name: string) => {
    setRenameValue(name);
    setRenamingViewId(viewId);
  }, []);

  const handleConfirmRename = useCallback(async () => {
    if (!renamingViewId) return;
    const trimmed = renameValue.trim();
    if (!trimmed) {
      setRenamingViewId(null);
      return;
    }
    const currentId = renamingViewId;
    const currentName = trimmed;
    setRenamingViewId(null);
    await onRenameView(currentId, currentName);
  }, [onRenameView, renameValue, renamingViewId]);

  const handleCancelRename = useCallback(() => {
    setRenamingViewId(null);
    setRenameValue("");
  }, []);

  const handleDuplicate = useCallback(async (viewId: string) => {
    await onDuplicateView(viewId);
  }, [onDuplicateView]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteConfirmViewId) return;
    setDeleting(true);
    try {
      await onDeleteView(deleteConfirmViewId);
    } finally {
      setDeleting(false);
      setDeleteConfirmViewId(null);
    }
  }, [onDeleteView, deleteConfirmViewId]);

  return {
    renamingViewId,
    renameValue,
    setRenameValue,
    deleteConfirmViewId,
    setDeleteConfirmViewId,
    deleting,
    handleStartRename,
    handleConfirmRename,
    handleCancelRename,
    handleDuplicate,
    handleDeleteConfirm,
  };
}
