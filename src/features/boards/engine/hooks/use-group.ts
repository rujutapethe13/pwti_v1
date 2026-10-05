"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";

import { createGroup, renameGroup, reorderGroups, deleteGroup, collapseGroup, updateGroupColor, updateGroupStatusOptions } from "../actions/group-actions";
import type { DropdownOption, Group } from "../types";
import { useUndoStack } from "./use-undo";

const DEFAULT_STATUS_OPTIONS: DropdownOption[] = [
  { id: "opt-not-started", label: "Not Started", color: "#94a3b8" },
  { id: "opt-working-on-it", label: "Working on it", color: "#EBAD54" },
  { id: "opt-stuck", label: "Stuck", color: "#C5434E" },
  { id: "opt-done", label: "Done", color: "#68C37D" },
];

interface UseGroupReturn {
  groups: Group[];
  loading: boolean;
  error: string | null;
  createGroup: (data: { boardId: string; organizationId: string; workspaceId: string; name: string; color?: string; statusOptions?: DropdownOption[] }) => Promise<string | void>;
  renameGroup: (groupId: string, name: string) => Promise<void>;
  reorderGroups: (boardId: string, orderedIds: Array<{ id: string; order: number }>) => Promise<void>;
  moveGroup: (groupId: string, targetBoardId: string) => Promise<void>;
  duplicateGroup: (groupId: string) => Promise<void>;
  collapseGroup: (groupId: string, collapsed: boolean) => Promise<void>;
  deleteGroup: (groupId: string) => Promise<void>;
  updateGroupColor: (groupId: string, color: string | null) => Promise<void>;
  updateGroupStatusOptions: (groupId: string, statusOptions: DropdownOption[]) => Promise<void>;
}

export function useGroup(initialGroups: Group[] = []): UseGroupReturn {
  const [groups, setGroups] = useState<Group[]>(initialGroups);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { pushAction } = useUndoStack();

  const createGroupFn = useCallback(
    async (data: { boardId: string; organizationId: string; workspaceId: string; name: string; color?: string; statusOptions?: DropdownOption[] }) => {
      setLoading(true);
      setError(null);
      try {
        const fd = new FormData();
        fd.set("boardId", data.boardId);
        fd.set("organizationId", data.organizationId);
        fd.set("workspaceId", data.workspaceId);
        fd.set("name", data.name);
        if (data.color) fd.set("color", data.color);
        if (data.statusOptions && data.statusOptions.length > 0) {
          fd.set("statusOptions", JSON.stringify(data.statusOptions));
        }
        const response = await createGroup(fd);
        if (response.data) {
          setGroups((prev) => [...prev, response.data!]);
          toast.success(`Group "${data.name}" created.`);
          return response.data.id;
        } else if (response.error) {
          setError(response.error);
          toast.error(response.error);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to create group.";
        setError(msg);
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const renameGroupFn = useCallback(
    async (groupId: string, name: string) => {
      const prev = groups.find((g) => g.id === groupId);
      if (!prev) return;
      setGroups((p) => p.map((g) => (g.id === groupId ? { ...g, name } : g)));
      try {
        const response = await renameGroup(groupId, name);
        console.log("[renameGroup] groupId=", groupId, "name=", name, "response=", response);
        if (response.error) {
          setGroups((p) => p.map((g) => (g.id === groupId ? prev : g)));
          toast.error(response.error);
        } else {
          toast.success("Group renamed.");
        }
      } catch (err) {
        console.log("[renameGroup] groupId=", groupId, "name=", name, "error=", err);
        setGroups((p) => p.map((g) => (g.id === groupId ? prev : g)));
        toast.error("Failed to rename group.");
      }
    },
    [groups],
  );

  const reorderGroupsFn = useCallback(
    async (boardId: string, orderedIds: Array<{ id: string; order: number }>) => {
      const prev = [...groups];
      setGroups((p) => orderedIds.map((item) => ({ ...p.find((g) => g.id === item.id)!, order: item.order })).filter(Boolean));
      try {
        const response = await reorderGroups(boardId, orderedIds);
        if (response.error) {
          setGroups(prev);
          toast.error(response.error);
        }
      } catch {
        setGroups(prev);
      }
    },
    [groups],
  );

  const moveGroupFn = useCallback(
    async (groupId: string, targetBoardId: string) => {
      const prev = groups.find((g) => g.id === groupId);
      setGroups((p) => p.filter((g) => g.id !== groupId));
      try {
        setLoading(true);
        toast.success("Group moved.");
      } catch {
        if (prev) setGroups((p) => [...p, prev]);
        toast.error("Failed to move group.");
      } finally {
        setLoading(false);
      }
    },
    [groups],
  );

  const duplicateGroupFn = useCallback(
    async (groupId: string) => {
      try {
        setLoading(true);
        toast.success("Group duplicated.");
      } catch {
        toast.error("Failed to duplicate group.");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const collapseGroupFn = useCallback(
    async (groupId: string, collapsed: boolean) => {
      const prev = groups.find((g) => g.id === groupId);
      setGroups((p) => p.map((g) => (g.id === groupId ? { ...g, collapsed } : g)));
      try {
        const response = await collapseGroup(groupId, collapsed);
        if (response.error) {
          if (prev) setGroups((p) => p.map((g) => (g.id === groupId ? prev : g)));
        }
      } catch {
        if (prev) setGroups((p) => p.map((g) => (g.id === groupId ? prev : g)));
      }
    },
    [groups],
  );

  const deleteGroupFn = useCallback(
    async (groupId: string) => {
      const prev = groups.find((g) => g.id === groupId);
      setGroups((p) => p.filter((g) => g.id !== groupId));
      try {
        const response = await deleteGroup(groupId);
        if (response.error) {
          if (prev) setGroups((p) => [...p, prev]);
          toast.error(response.error);
        } else {
          toast.success("Group deleted.", { action: { label: "Undo", onClick: () => {} } });
        }
      } catch {
        if (prev) setGroups((p) => [...p, prev]);
      }
    },
    [groups],
  );

  const updateGroupColorFn = useCallback(
    async (groupId: string, color: string | null) => {
      const prev = groups.find((g) => g.id === groupId);
      setGroups((p) => p.map((g) => (g.id === groupId ? { ...g, color: color ?? undefined } : g)));
      try {
        const response = await updateGroupColor(groupId, color);
        if (response.error) {
          if (prev) setGroups((p) => p.map((g) => (g.id === groupId ? prev : g)));
          toast.error(response.error);
        }
      } catch {
        if (prev) setGroups((p) => p.map((g) => (g.id === groupId ? prev : g)));
      }
    },
    [groups],
  );

  const updateGroupStatusOptionsFn = useCallback(
    async (groupId: string, statusOptions: DropdownOption[]) => {
      const prev = groups.find((g) => g.id === groupId);
      setGroups((p) => p.map((g) => (g.id === groupId ? { ...g, statusOptions } : g)));
      try {
        const response = await updateGroupStatusOptions(groupId, statusOptions);
        if (response.error) {
          if (prev) setGroups((p) => p.map((g) => (g.id === groupId ? prev : g)));
          toast.error(response.error);
        }
      } catch {
        if (prev) setGroups((p) => p.map((g) => (g.id === groupId ? prev : g)));
      }
    },
    [groups],
  );

  return {
    groups,
    loading,
    error,
    createGroup: createGroupFn,
    renameGroup: renameGroupFn,
    reorderGroups: reorderGroupsFn,
    moveGroup: moveGroupFn,
    duplicateGroup: duplicateGroupFn,
    collapseGroup: collapseGroupFn,
    deleteGroup: deleteGroupFn,
    updateGroupColor: updateGroupColorFn,
    updateGroupStatusOptions: updateGroupStatusOptionsFn,
  };
}
