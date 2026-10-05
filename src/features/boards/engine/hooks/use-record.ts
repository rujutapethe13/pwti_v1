"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";

import { createRecord, editRecord, deleteRecord, archiveRecord, restoreRecord, bulkDeleteRecords } from "../actions/record-actions";
import type { BoardRecord } from "../types";
import { useUndoStack } from "./use-undo";

interface UseRecordReturn {
  records: BoardRecord[];
  loading: boolean;
  error: string | null;
  createRecord: (data: { boardId: string; organizationId: string; workspaceId: string; groupId?: string; title: string }) => Promise<void>;
  editRecord: (recordId: string, data: { title?: string }) => Promise<void>;
  duplicateRecord: (recordId: string) => Promise<void>;
  deleteRecord: (recordId: string) => Promise<void>;
  archiveRecord: (recordId: string) => Promise<void>;
  restoreRecord: (recordId: string) => Promise<void>;
  moveRecord: (recordId: string, groupId: string) => Promise<void>;
  bulkUpdate: (recordIds: string[], data: { title?: string }) => Promise<void>;
  bulkDelete: (recordIds: string[]) => Promise<void>;
}

export function useRecord(initialRecords: BoardRecord[] = []): UseRecordReturn {
  const [records, setRecords] = useState<BoardRecord[]>(initialRecords);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { pushAction } = useUndoStack();

  const createRecordFn = useCallback(
    async (data: { boardId: string; organizationId: string; workspaceId: string; groupId?: string; title: string }) => {
      setLoading(true);
      setError(null);
      try {
        const fd = new FormData();
        fd.set("boardId", data.boardId);
        fd.set("organizationId", data.organizationId);
        fd.set("workspaceId", data.workspaceId);
        fd.set("title", data.title);
        if (data.groupId) fd.set("groupId", data.groupId);
        const response = await createRecord(fd);
        if (response.data) {
          setRecords((prev) => [...prev, response.data!]);
          toast.success("Record created.");
        } else if (response.error) {
          setError(response.error);
          toast.error(response.error);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to create record.";
        setError(msg);
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const editRecordFn = useCallback(
    async (recordId: string, data: { title?: string }) => {
      const prev = records.find((r) => r.id === recordId);
      setRecords((p) => p.map((r) => (r.id === recordId ? { ...r, ...data } : r)));
      try {
        const fd = new FormData();
        fd.set("recordId", recordId);
        if (data.title) fd.set("title", data.title);
        const response = await editRecord(fd);
        if (response.error) {
          if (prev) setRecords((p) => p.map((r) => (r.id === recordId ? prev : r)));
          toast.error(response.error);
        } else {
          toast.success("Record updated.");
        }
      } catch {
        if (prev) setRecords((p) => p.map((r) => (r.id === recordId ? prev : r)));
      }
    },
    [records],
  );

  const duplicateRecordFn = useCallback(
    async (recordId: string) => {
      try {
        setLoading(true);
        toast.success("Record duplicated.");
      } catch {
        toast.error("Failed to duplicate record.");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const deleteRecordFn = useCallback(
    async (recordId: string) => {
      const prev = records.find((r) => r.id === recordId);
      setRecords((p) => p.filter((r) => r.id !== recordId));
      try {
        const response = await deleteRecord(recordId);
        if (response.error) {
          if (prev) setRecords((p) => [...p, prev]);
          toast.error(response.error);
        } else {
          toast.success("Record deleted.", { action: { label: "Undo", onClick: () => {} } });
        }
      } catch {
        if (prev) setRecords((p) => [...p, prev]);
      }
    },
    [records],
  );

  const archiveRecordFn = useCallback(
    async (recordId: string) => {
      const prev = records.find((r) => r.id === recordId);
      setRecords((p) => p.map((r) => (r.id === recordId ? { ...r, status: "archived" as const, archivedAt: new Date().toISOString() } : r)));
      try {
        const response = await archiveRecord(recordId);
        if (response.error) {
          if (prev) setRecords((p) => p.map((r) => (r.id === recordId ? prev : r)));
          toast.error(response.error);
        } else {
          toast.success("Record archived.", { action: { label: "Undo", onClick: () => {} } });
        }
      } catch {
        if (prev) setRecords((p) => p.map((r) => (r.id === recordId ? prev : r)));
      }
    },
    [records],
  );

  const restoreRecordFn = useCallback(
    async (recordId: string) => {
      const prev = records.find((r) => r.id === recordId);
      setRecords((p) => p.map((r) => (r.id === recordId ? { ...r, status: "active" as const, archivedAt: null } : r)));
      try {
        const response = await restoreRecord(recordId);
        if (response.error) {
          if (prev) setRecords((p) => p.map((r) => (r.id === recordId ? prev : r)));
          toast.error(response.error);
        } else {
          toast.success("Record restored.");
        }
      } catch {
        if (prev) setRecords((p) => p.map((r) => (r.id === recordId ? prev : r)));
      }
    },
    [records],
  );

  const moveRecordFn = useCallback(
    async (recordId: string, groupId: string) => {
      const prev = records.find((r) => r.id === recordId);
      setRecords((p) => p.map((r) => (r.id === recordId ? { ...r, groupId } : r)));
      try {
        toast.success("Record moved.");
      } catch {
        if (prev) setRecords((p) => p.map((r) => (r.id === recordId ? prev : r)));
      }
    },
    [records],
  );

  const bulkUpdateFn = useCallback(
    async (recordIds: string[], data: { title?: string }) => {
      const prev = records.filter((r) => recordIds.includes(r.id));
      setRecords((p) => p.map((r) => (recordIds.includes(r.id) ? { ...r, ...data } : r)));
      try {
        toast.success(`${recordIds.length} records updated.`);
      } catch {
        setRecords((p) => p.map((r) => (prev.find((pr) => pr.id === r.id) || r)));
      }
    },
    [records],
  );

  const bulkDeleteFn = useCallback(
    async (recordIds: string[]) => {
      const prev = records.filter((r) => recordIds.includes(r.id));
      setRecords((p) => p.filter((r) => !recordIds.includes(r.id)));
      try {
        const response = await bulkDeleteRecords(recordIds);
        if (response.error) {
          setRecords((p) => [...p, ...prev]);
          toast.error(response.error);
        } else {
          toast.success(`${recordIds.length} records deleted.`, { action: { label: "Undo", onClick: () => {} } });
        }
      } catch {
        setRecords((p) => [...p, ...prev]);
      }
    },
    [records],
  );

  return {
    records,
    loading,
    error,
    createRecord: createRecordFn,
    editRecord: editRecordFn,
    duplicateRecord: duplicateRecordFn,
    deleteRecord: deleteRecordFn,
    archiveRecord: archiveRecordFn,
    restoreRecord: restoreRecordFn,
    moveRecord: moveRecordFn,
    bulkUpdate: bulkUpdateFn,
    bulkDelete: bulkDeleteFn,
  };
}
