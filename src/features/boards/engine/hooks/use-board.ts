"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";

import type { ApiResponse } from "@/types";
import { createBoard, renameBoard, duplicateBoard, archiveBoard, deleteBoard, favoriteBoard } from "../actions/board-actions";
import type { BoardDefinition } from "../types";
import { useUndoStack } from "./use-undo";

function toErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  const obj = err as { message?: string; details?: string | null; hint?: string | null } | null | undefined;
  const message = obj?.message ?? "Failed to create board.";
  const detail = [obj?.details, obj?.hint].filter(Boolean).join(" — ");
  return detail ? `${message} (${detail})` : message;
}

interface UseBoardReturn {
  boards: BoardDefinition[];
  loading: boolean;
  error: string | null;
  createBoard: (data: { organizationId: string; workspaceId: string; name: string; description?: string }) => Promise<void>;
  renameBoard: (boardId: string, name: string) => Promise<void>;
  duplicateBoard: (boardId: string) => Promise<void>;
  archiveBoard: (boardId: string) => Promise<void>;
  deleteBoard: (boardId: string) => Promise<void>;
  favoriteBoard: (boardId: string, favorite: boolean) => Promise<void>;
}

export function useBoard(initialBoards: BoardDefinition[] = []): UseBoardReturn {
  const [boards, setBoards] = useState<BoardDefinition[]>(initialBoards);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { pushAction } = useUndoStack();

  const handleResponse = useCallback(
    <T>(response: ApiResponse<T>, successMessage: string, undoAction?: () => Promise<void>, redoAction?: () => Promise<void>) => {
      if (response.error) {
        setError(response.error);
        toast.error(response.error);
        return false;
      }
      toast.success(successMessage);
      if (undoAction && redoAction) {
        pushAction({
          id: crypto.randomUUID(),
          type: "board",
          description: successMessage,
          undo: undoAction,
          redo: redoAction,
        });
      }
      return true;
    },
    [pushAction],
  );

  const createBoardFn = useCallback(
    async (data: { organizationId: string; workspaceId: string; name: string; description?: string }) => {
      setLoading(true);
      setError(null);
      try {
        const fd = new FormData();
        fd.set("organizationId", data.organizationId);
        fd.set("workspaceId", data.workspaceId);
        fd.set("name", data.name);
        if (data.description) fd.set("description", data.description);
        const response = await createBoard(fd);
        if (response.data && handleResponse(response, `Board "${data.name}" created.`)) {
          setBoards((prev) => [...prev, response.data!]);
        }
      } catch (err) {
        const msg = toErrorMessage(err);
        setError(msg);
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    },
    [handleResponse],
  );

  const renameBoardFn = useCallback(
    async (boardId: string, name: string) => {
      const prev = boards.find((b) => b.id === boardId);
      setBoards((p) => p.map((b) => (b.id === boardId ? { ...b, name } : b)));
      try {
        const fd = new FormData();
        fd.set("boardId", boardId);
        fd.set("name", name);
        const response = await renameBoard(fd);
        if (response.error) {
          if (prev) setBoards((p) => p.map((b) => (b.id === boardId ? prev : b)));
          toast.error(response.error);
        } else {
          toast.success("Board renamed.");
        }
      } catch {
        if (prev) setBoards((p) => p.map((b) => (b.id === boardId ? prev : b)));
      }
    },
    [boards],
  );

  const duplicateBoardFn = useCallback(
    async (boardId: string) => {
      setLoading(true);
      try {
        const fd = new FormData();
        fd.set("boardId", boardId);
        const response = await duplicateBoard(fd);
        if (response.data && handleResponse(response, "Board duplicated.")) {
          setBoards((prev) => [...prev, response.data!]);
        }
      } finally {
        setLoading(false);
      }
    },
    [handleResponse],
  );

  const archiveBoardFn = useCallback(
    async (boardId: string) => {
      const prev = boards.find((b) => b.id === boardId);
      setBoards((p) => p.map((b) => (b.id === boardId ? { ...b, status: "archived" as const } : b)));
      try {
        const response = await archiveBoard(boardId);
        if (response.error) {
          if (prev) setBoards((p) => p.map((b) => (b.id === boardId ? prev : b)));
          toast.error(response.error);
        } else {
          toast.success("Board archived.", { action: { label: "Undo", onClick: () => {} } });
        }
      } catch {
        if (prev) setBoards((p) => p.map((b) => (b.id === boardId ? prev : b)));
      }
    },
    [boards],
  );

  const deleteBoardFn = useCallback(
    async (boardId: string) => {
      setLoading(true);
      setError(null);
      // No optimistic removal: the board stays in the list until
      // the server confirms the delete. The delete_board server
      // action returns 403 when the caller may not delete and
      // 404 when nothing was deleted, so both roll back cleanly —
      // the UI was never changed.
      try {
        const response = await deleteBoard(boardId);
        if (response.error) {
          setError(response.error);
          toast.error(response.error);
          return;
        }
        // Confirmed deleted in the database: only now update the UI.
        setBoards((prev) => prev.filter((b) => b.id !== boardId));
        toast.success("Board deleted.");
      } catch (err) {
        const msg = toErrorMessage(err);
        setError(msg);
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const favoriteBoardFn = useCallback(
    async (boardId: string, favorite: boolean) => {
      const prev = boards.find((b) => b.id === boardId);
      setBoards((p) => p.map((b) => (b.id === boardId ? { ...b, favorite } : b)));
      try {
        const response = await favoriteBoard(boardId, favorite);
        if (response.error) {
          if (prev) setBoards((p) => p.map((b) => (b.id === boardId ? prev : b)));
          toast.error(response.error);
        } else {
          toast.success(favorite ? "Board favorited." : "Board unfavorited.");
        }
      } catch {
        if (prev) setBoards((p) => p.map((b) => (b.id === boardId ? prev : b)));
      }
    },
    [boards],
  );

  return {
    boards,
    loading,
    error,
    createBoard: createBoardFn,
    renameBoard: renameBoardFn,
    duplicateBoard: duplicateBoardFn,
    archiveBoard: archiveBoardFn,
    deleteBoard: deleteBoardFn,
    favoriteBoard: favoriteBoardFn,
  };
}
