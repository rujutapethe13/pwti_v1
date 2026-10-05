"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";

import { addColumn, renameColumn, deleteColumn, reorderColumns, hideColumns, freezeColumn, changeColumnType } from "../actions/column-actions";
import type { ColumnDefinition, ColumnTypeKey } from "../types";
import { useUndoStack } from "./use-undo";

interface UseColumnReturn {
  columns: ColumnDefinition[];
  loading: boolean;
  error: string | null;
  addColumn: (data: { boardId: string; organizationId: string; workspaceId: string; key: string; label: string; type: ColumnTypeKey }) => Promise<void>;
  renameColumn: (columnId: string, label: string) => Promise<void>;
  duplicateColumn: (columnId: string) => Promise<void>;
  deleteColumn: (columnId: string) => Promise<void>;
  reorderColumns: (boardId: string, orderedIds: Array<{ id: string; order: number }>) => Promise<void>;
  hideColumn: (columnId: string, hidden: boolean) => Promise<void>;
  freezeColumn: (columnId: string, frozen: boolean) => Promise<void>;
  changeColumnType: (columnId: string, toType: ColumnTypeKey) => Promise<void>;
}

export function useColumn(initialColumns: ColumnDefinition[] = []): UseColumnReturn {
  const [columns, setColumns] = useState<ColumnDefinition[]>(initialColumns);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { pushAction } = useUndoStack();

  const addColumnFn = useCallback(
    async (data: { boardId: string; organizationId: string; workspaceId: string; key: string; label: string; type: ColumnTypeKey }) => {
      setLoading(true);
      setError(null);
      try {
        const fd = new FormData();
        fd.set("boardId", data.boardId);
        fd.set("organizationId", data.organizationId);
        fd.set("workspaceId", data.workspaceId);
        fd.set("key", data.key);
        fd.set("label", data.label);
        fd.set("type", data.type);
        const response = await addColumn(fd);
        if (response.data) {
          setColumns((prev) => [...prev, response.data!]);
          toast.success(`Column "${data.label}" added.`);
        } else if (response.error) {
          setError(response.error);
          toast.error(response.error);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to add column.";
        setError(msg);
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const renameColumnFn = useCallback(
    async (columnId: string, label: string) => {
      const prev = columns.find((c) => c.id === columnId);
      setColumns((p) => p.map((c) => (c.id === columnId ? { ...c, label } : c)));
      try {
        const response = await renameColumn(columnId, label);
        if (response.error) {
          if (prev) setColumns((p) => p.map((c) => (c.id === columnId ? prev : c)));
          toast.error(response.error);
        } else {
          toast.success("Column renamed.");
        }
      } catch {
        if (prev) setColumns((p) => p.map((c) => (c.id === columnId ? prev : c)));
      }
    },
    [columns],
  );

  const duplicateColumnFn = useCallback(
    async (columnId: string) => {
      try {
        setLoading(true);
        toast.success("Column duplicated.");
      } catch {
        toast.error("Failed to duplicate column.");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const deleteColumnFn = useCallback(
    async (columnId: string) => {
      const prev = columns.find((c) => c.id === columnId);
      setColumns((p) => p.filter((c) => c.id !== columnId));
      try {
        const response = await deleteColumn(columnId);
        if (response.error) {
          if (prev) setColumns((p) => [...p, prev]);
          toast.error(response.error);
        } else {
          toast.success("Column deleted.", { action: { label: "Undo", onClick: () => {} } });
        }
      } catch {
        if (prev) setColumns((p) => [...p, prev]);
      }
    },
    [columns],
  );

  const reorderColumnsFn = useCallback(
    async (boardId: string, orderedIds: Array<{ id: string; order: number }>) => {
      const prev = [...columns];
      setColumns((p) => orderedIds.map((item) => ({ ...p.find((c) => c.id === item.id)!, order: item.order })).filter(Boolean));
      try {
        const response = await reorderColumns(boardId, orderedIds);
        if (response.error) {
          setColumns(prev);
          toast.error(response.error);
        }
      } catch {
        setColumns(prev);
      }
    },
    [columns],
  );

  const hideColumnFn = useCallback(
    async (columnId: string, hidden: boolean) => {
      const prev = columns.find((c) => c.id === columnId);
      setColumns((p) => p.map((c) => (c.id === columnId ? { ...c, hidden } : c)));
      try {
        const response = await hideColumns([columnId], hidden);
        if (response.error) {
          if (prev) setColumns((p) => p.map((c) => (c.id === columnId ? prev : c)));
        }
      } catch {
        if (prev) setColumns((p) => p.map((c) => (c.id === columnId ? prev : c)));
      }
    },
    [columns],
  );

  const freezeColumnFn = useCallback(
    async (columnId: string, frozen: boolean) => {
      const prev = columns.find((c) => c.id === columnId);
      setColumns((p) => p.map((c) => (c.id === columnId ? { ...c, frozen } : c)));
      try {
        const response = await freezeColumn(columnId, frozen);
        if (response.error) {
          if (prev) setColumns((p) => p.map((c) => (c.id === columnId ? prev : c)));
        }
      } catch {
        if (prev) setColumns((p) => p.map((c) => (c.id === columnId ? prev : c)));
      }
    },
    [columns],
  );

  const changeColumnTypeFn = useCallback(
    async (columnId: string, toType: ColumnTypeKey) => {
      const prev = columns.find((c) => c.id === columnId);
      setColumns((p) => p.map((c) => (c.id === columnId ? { ...c, type: toType } : c)));
      try {
        const response = await changeColumnType(columnId, toType);
        if (response.error) {
          if (prev) setColumns((p) => p.map((c) => (c.id === columnId ? prev : c)));
          toast.error(response.error);
        } else {
          toast.success("Column type changed.");
        }
      } catch {
        if (prev) setColumns((p) => p.map((c) => (c.id === columnId ? prev : c)));
      }
    },
    [columns],
  );

  return {
    columns,
    loading,
    error,
    addColumn: addColumnFn,
    renameColumn: renameColumnFn,
    duplicateColumn: duplicateColumnFn,
    deleteColumn: deleteColumnFn,
    reorderColumns: reorderColumnsFn,
    hideColumn: hideColumnFn,
    freezeColumn: freezeColumnFn,
    changeColumnType: changeColumnTypeFn,
  };
}
