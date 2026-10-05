"use client";

import { useCallback, useMemo, useState } from "react";

export interface UseSelectionReturn<TId extends string = string> {
  selectedIds: Set<TId>;
  isSelected: (id: TId) => boolean;
  select: (id: TId) => void;
  deselect: (id: TId) => void;
  toggle: (id: TId) => void;
  selectAll: (ids: TId[]) => void;
  deselectAll: () => void;
  toggleAll: (ids: TId[]) => void;
  isAllSelected: (ids: TId[]) => boolean;
  isPartiallySelected: (ids: TId[]) => boolean;
  clear: () => void;
  count: number;
  lastClickedId: TId | null;
  /** Shift-click range selection: call with the current target and the sorted list of all ids */
  selectRange: (targetId: TId, sortedIds: TId[], shiftKey: boolean) => void;
}

export function useSelection<TId extends string = string>(
  initialIds: TId[] = [],
): UseSelectionReturn<TId> {
  const [selectedIds, setSelectedIds] = useState<Set<TId>>(
    () => new Set(initialIds),
  );
  const [lastClickedId, setLastClickedId] = useState<TId | null>(null);

  const isSelected = useCallback(
    (id: TId) => selectedIds.has(id),
    [selectedIds],
  );

  const select = useCallback((id: TId) => {
    setSelectedIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setLastClickedId(id);
  }, []);

  const deselect = useCallback((id: TId) => {
    setSelectedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const toggle = useCallback(
    (id: TId) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
      setLastClickedId(id);
    },
    [],
  );

  const selectAll = useCallback((ids: TId[]) => {
    setSelectedIds(new Set(ids));
  }, []);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
    setLastClickedId(null);
  }, []);

  const toggleAll = useCallback(
    (ids: TId[]) => {
      setSelectedIds((prev) => {
        const allSelected = ids.every((id) => prev.has(id));
        if (allSelected) {
          return new Set<TId>();
        }
        return new Set(ids);
      });
    },
    [],
  );

  const isAllSelected = useCallback(
    (ids: TId[]) => ids.length > 0 && ids.every((id) => selectedIds.has(id)),
    [selectedIds],
  );

  const isPartiallySelected = useCallback(
    (ids: TId[]) => {
      if (ids.length === 0) return false;
      const count = ids.filter((id) => selectedIds.has(id)).length;
      return count > 0 && count < ids.length;
    },
    [selectedIds],
  );

  const clear = useCallback(() => {
    setSelectedIds(new Set());
    setLastClickedId(null);
  }, []);

  const selectRange = useCallback(
    (targetId: TId, sortedIds: TId[], shiftKey: boolean) => {
      if (!shiftKey || !lastClickedId) {
        toggle(targetId);
        return;
      }

      const startIdx = sortedIds.indexOf(lastClickedId);
      const endIdx = sortedIds.indexOf(targetId);

      if (startIdx === -1 || endIdx === -1) {
        toggle(targetId);
        return;
      }

      const [from, to] =
        startIdx <= endIdx
          ? [startIdx, endIdx]
          : [endIdx, startIdx];

      const rangeIds = sortedIds.slice(from, to + 1);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        // Keep existing selections, add the range
        for (const id of rangeIds) {
          next.add(id);
        }
        return next;
      });
      setLastClickedId(targetId);
    },
    [lastClickedId, toggle],
  );

  const count = useMemo(() => selectedIds.size, [selectedIds]);

  return {
    selectedIds,
    isSelected,
    select,
    deselect,
    toggle,
    selectAll,
    deselectAll,
    toggleAll,
    isAllSelected,
    isPartiallySelected,
    clear,
    count,
    lastClickedId,
    selectRange,
  };
}

