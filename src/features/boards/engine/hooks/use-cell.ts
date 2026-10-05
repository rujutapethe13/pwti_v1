"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";

import { columnTypeRegistry } from "../column-registry";
import type { ColumnDefinition, ColumnValue } from "../types";
import { useUndoStack } from "./use-undo";

interface UseCellReturn {
  cellValues: Map<string, ColumnValue>;
  draftValues: Map<string, ColumnValue>;
  setDraftValue: (recordId: string, columnId: string, value: ColumnValue) => void;
  commitDraft: (recordId: string, columnId: string) => Promise<void>;
  commitAllDrafts: () => Promise<void>;
  updateCell: (recordId: string, columnId: string, value: ColumnValue) => Promise<void>;
  bulkUpdateCells: (updates: Array<{ recordId: string; columnId: string; value: ColumnValue }>) => Promise<void>;
  clearCell: (recordId: string, columnId: string) => Promise<void>;
  loading: boolean;
  error: string | null;
  hasDrafts: boolean;
  discardDraft: (recordId: string, columnId: string) => void;
  discardAllDrafts: () => void;
}

function getCellKey(recordId: string, columnId: string): string {
  return `${recordId}:${columnId}`;
}

export function useCell(initialCellValues: Map<string, ColumnValue> = new Map(), columns: ColumnDefinition[] = []): UseCellReturn {
  const [cellValues, setCellValues] = useState<Map<string, ColumnValue>>(initialCellValues);
  const [draftValues, setDraftValues] = useState<Map<string, ColumnValue>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { pushAction } = useUndoStack();

  const setDraftValue = useCallback((recordId: string, columnId: string, value: ColumnValue) => {
    setDraftValues((prev) => {
      const next = new Map(prev);
      const key = getCellKey(recordId, columnId);
      next.set(key, value);
      return next;
    });
  }, []);

  const commitDraft = useCallback(async (recordId: string, columnId: string) => {
    const key = getCellKey(recordId, columnId);
    const draftValue = draftValues.get(key);
    if (draftValue === undefined) return;

    const column = columns.find((c) => c.id === columnId);
    if (!column) return;

    const prevValue = cellValues.get(key) ?? column.defaultValue;

    setCellValues((prev) => {
      const next = new Map(prev);
      next.set(key, draftValue);
      return next;
    });
    setDraftValues((prev) => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });

    try {
      // Server action call would go here
      toast.success("Cell updated.");
    } catch {
      setCellValues((prev) => {
        const next = new Map(prev);
        next.set(key, prevValue);
        return next;
      });
      toast.error("Failed to update cell.");
    }
  }, [draftValues, cellValues, columns]);

  const commitAllDrafts = useCallback(async () => {
    const entries = Array.from(draftValues.entries());
    for (const [key] of entries) {
      const [recordId, columnId] = key.split(":");
      await commitDraft(recordId, columnId);
    }
  }, [draftValues, commitDraft]);

  const updateCell = useCallback(async (recordId: string, columnId: string, value: ColumnValue) => {
    const column = columns.find((c) => c.id === columnId);
    const prevValue = cellValues.get(getCellKey(recordId, columnId)) ?? column?.defaultValue ?? null;

    setCellValues((prev) => {
      const next = new Map(prev);
      next.set(getCellKey(recordId, columnId), value);
      return next;
    });

    try {
      setLoading(true);
      toast.success("Cell updated.");
    } catch {
      setCellValues((prev) => {
        const next = new Map(prev);
        next.set(getCellKey(recordId, columnId), prevValue);
        return next;
      });
      toast.error("Failed to update cell.");
    } finally {
      setLoading(false);
    }
  }, [cellValues, columns]);

  const bulkUpdateCells = useCallback(async (updates: Array<{ recordId: string; columnId: string; value: ColumnValue }>) => {
    const prev = new Map(cellValues);
    setCellValues((prev) => {
      const next = new Map(prev);
      for (const { recordId, columnId, value } of updates) {
        next.set(getCellKey(recordId, columnId), value);
      }
      return next;
    });
    try {
      toast.success(`${updates.length} cells updated.`);
    } catch {
      setCellValues(prev);
      toast.error("Failed to update cells.");
    }
  }, [cellValues]);

  const clearCell = useCallback(async (recordId: string, columnId: string) => {
    const column = columns.find((c) => c.id === columnId);
    const defaultValue = column ? columnTypeRegistry[column.type]?.defaultValue ?? null : null;
    await updateCell(recordId, columnId, defaultValue);
  }, [columns, updateCell]);

  const discardDraft = useCallback((recordId: string, columnId: string) => {
    setDraftValues((prev) => {
      const next = new Map(prev);
      next.delete(getCellKey(recordId, columnId));
      return next;
    });
  }, []);

  const discardAllDrafts = useCallback(() => {
    setDraftValues(new Map());
  }, []);

  return {
    cellValues,
    draftValues,
    setDraftValue,
    commitDraft,
    commitAllDrafts,
    updateCell,
    bulkUpdateCells,
    clearCell,
    loading,
    error,
    hasDrafts: draftValues.size > 0,
    discardDraft,
    discardAllDrafts,
  };
}
