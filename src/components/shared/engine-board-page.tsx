"use client";

import "@/features/boards/engine/view-engine/views";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ViewEngine } from "@/features/boards/engine/view-engine/view-engine";
import { ImportWizard } from "@/features/boards/engine/components/import-wizard";
import { BoardLayout } from "@/components/shared/board-layout";
import { BoardSettingsDialog } from "@/components/shared/board-settings-dialog";
import { toast } from "sonner";
import type { DemoBoardPageData } from "@/features/boards/engine/demo-data";
import type { ColumnDefinition, BoardRecord, ColumnValue, BoardView, Group, EntityStatus, ColumnTypeKey } from "@/features/boards/engine/types";
import { upsertBoard, upsertBoardColumns, upsertBoardRecords, upsertBoardCellValues, deleteBoardColumns, loadBoardColumns, updateCell, bulkDeleteRecords, archiveRecord, deleteColumn, renameColumn, duplicateColumn, changeColumnType, freezeColumn, hideColumns, updateBoardPrimaryLabel } from "@/features/boards/engine/actions";
import { isProtectedImportColumn } from "@/features/boards/engine/lib/import-export";
import { refreshClient360Snapshot } from "@/features/client-360/actions/snapshot-actions";
import { workbookToArrayBuffer } from "@/features/boards/engine/lib/import-export";

interface EngineBoardPageProps {
  data: DemoBoardPageData;
}

function cellValuesArrayToMap(cellValues: Array<[string, ColumnValue]>): Map<string, ColumnValue> {
  return new Map(cellValues);
}

function cellValuesMapToArray(cellValues: Map<string, ColumnValue>): Array<[string, ColumnValue]> {
  return Array.from(cellValues.entries());
}

/**
 * Strip every reference to a deleted column id out of a view's settings.
 *
 * `BoardView.settings` is a discriminated union (KanbanViewSettings |
 * CalendarViewSettings | TimelineViewSettings | ...) whose fields are typed
 * specifically, so `settings[key]` does not satisfy an index signature and the
 * naive `for (const key of Object.keys(settings))` loop fails to typecheck.
 *
 * This walks the settings object recursively and, for each value:
 *  - a string equal to the deleted column id  → replaced with "" (keeps the
 *    field present so the per-view-type interface stays valid; the view simply
 *    has no column to point at anymore).
 *  - a string[]                              → the id is filtered out.
 *  - a nested object (groupBy, divideBy, ...) → recursed into.
 *
 * It is safe to walk generically because every string field in these settings
 * is either a column id, a group id, or a literal union member ("asc"/"desc",
 * "month"/"week", "status"/"person", ...). A column id can only ever match a
 * column-id field, never a group id or a literal, so nothing is cleared by
 * accident. Group-id arrays such as `groupBy.collapsedGroupIds` live in a
 * different UUID namespace and are unaffected.
 */
function clearColumnRefsFromViewSettings(
  settings: BoardView["settings"],
  columnId: string,
): BoardView["settings"] {
  const record = { ...settings } as Record<string, unknown>;
  return clearColumnRefsFromRecord(record, columnId) as BoardView["settings"];
}

function clearColumnRefsFromRecord(
  record: Record<string, unknown>,
  columnId: string,
): Record<string, unknown> {
  for (const key of Object.keys(record)) {
    const value = record[key];
    if (value === columnId) {
      delete record[key];
    } else if (Array.isArray(value)) {
      record[key] = value.filter((item) => item !== columnId);
    } else if (value && typeof value === "object") {
      record[key] = clearColumnRefsFromRecord(
        value as Record<string, unknown>,
        columnId,
      );
    }
  }
  return record;
}

export function EngineBoardPage({ data }: EngineBoardPageProps) {
  const { board, description, columns: initialColumns, records: initialRecords, cellValues: initialCellValues, views, groups } = data;

  const [columns, setColumns] = useState<ColumnDefinition[]>(initialColumns);
  const [records, setRecords] = useState<BoardRecord[]>(initialRecords);
  const [cellValues, setCellValues] = useState<Map<string, ColumnValue>>(cellValuesArrayToMap(initialCellValues));
  const [boardViews, setBoardViews] = useState<BoardView[]>(views);
  const [activeViewId, setActiveViewId] = useState<string>(views[0]?.id ?? "");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [importWizardOpen, setImportWizardOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
   const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);
   const [bulkArchiveLoading, setBulkArchiveLoading] = useState(false);
   const [deletingColumnId, setDeletingColumnId] = useState<string | null>(null);

  const columnMapRef = useRef(new Map(columns.map((c) => [c.id, c])));
  const recordMapRef = useRef(new Map(records.map((r) => [r.id, r])));
  // Guards the import cleanup so it runs exactly once per import, even if the
  // component re-renders or StrictMode double-invokes effects while the
  // import is in flight. Reset when the wizard closes.
  const importCleanupDoneRef = useRef(false);

  useEffect(() => {
    columnMapRef.current = new Map(columns.map((c) => [c.id, c]));
  }, [columns]);

  useEffect(() => {
    recordMapRef.current = new Map(records.map((r) => [r.id, r]));
  }, [records]);

  const handleCellChange = useCallback(
    async ({ recordId, columnId, value }: { recordId: string; columnId: string; value: ColumnValue }) => {
      const key = `${recordId}:${columnId}`;
      const prevValue = cellValues.get(key) ?? null;
      const prevRecord = records.find((r) => r.id === recordId);

      // Optimistic update
      setCellValues((prev) => {
        const next = new Map(prev);
        next.set(key, value);
        return next;
      });
      setRecords((prev) =>
        prev.map((r) => (r.id === recordId ? { ...r, updatedAt: new Date().toISOString() } : r)),
      );

      try {
        const response = await updateCell(
          board.organizationId,
          board.workspaceId,
          board.id,
          recordId,
          columnId,
          value,
        );
        if (response.error) {
          // Rollback on server error
          setCellValues((prev) => {
            const next = new Map(prev);
            if (prevValue === null) next.delete(key);
            else next.set(key, prevValue);
            return next;
          });
          setRecords((prev) =>
            prev.map((r) =>
              r.id === recordId && prevRecord ? { ...r, updatedAt: prevRecord.updatedAt } : r,
            ),
          );
          toast.error(response.error);
        }
      } catch {
        // Rollback on thrown error
        setCellValues((prev) => {
          const next = new Map(prev);
          if (prevValue === null) next.delete(key);
          else next.set(key, prevValue);
          return next;
        });
        setRecords((prev) =>
          prev.map((r) =>
            r.id === recordId && prevRecord ? { ...r, updatedAt: prevRecord.updatedAt } : r,
          ),
        );
        toast.error("Failed to save cell value.");
      }
    },
    [board, cellValues, records],
  );

   const handleBulkDelete = useCallback(
     async (recordIds: string[]) => {
       const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
       const validIds = recordIds.filter(id => uuidRegex.test(id));
       const invalidIds = recordIds.filter(id => !uuidRegex.test(id));

       if (invalidIds.length > 0) {
         // Remove records with invalid IDs from UI state (they were never in the DB)
         const invalidRecords = records.filter(r => !uuidRegex.test(r.id));
         if (invalidRecords.length > 0) {
           setRecords(prev => prev.filter(r => uuidRegex.test(r.id)));
           toast.warning(`Removed ${invalidRecords.length} invalid record(s) from the board.`);
         }
         // Also, we might want to remove the invalid IDs from the recordIds array for the API call, but we already have validIds.
       }

       if (validIds.length === 0) {
         toast.error("No valid record IDs to delete.");
         setBulkDeleteLoading(false);
         return;
       }

       const prevRecords = records.filter((r) => validIds.includes(r.id));
       setRecords((prev) => prev.filter((r) => !validIds.includes(r.id)));
       setBulkDeleteLoading(true);
       try {
         const response = await bulkDeleteRecords(validIds);
         if (response.error) {
           setRecords((prev) => [...prev, ...prevRecords]);
           toast.error(response.error);
         } else {
           toast.success(`${validIds.length} record${validIds.length !== 1 ? "s" : ""} deleted.`);
         }
       } catch {
         setRecords((prev) => [...prev, ...prevRecords]);
         toast.error("Failed to delete records.");
       } finally {
         setBulkDeleteLoading(false);
       }
     },
     [records],
   );

  const handleBulkArchive = useCallback(
    async (recordIds: string[]) => {
      const prevRecords = records.filter((r) => recordIds.includes(r.id));
      setRecords((prev) =>
        prev.map((r) =>
          recordIds.includes(r.id) ? { ...r, status: "archived" as const, archivedAt: new Date().toISOString() } : r,
        ),
      );
      setBulkArchiveLoading(true);
      try {
        // Archive records one by one (no bulk archive action yet)
        for (const recordId of recordIds) {
          const response = await archiveRecord(recordId);
          if (response.error) {
            throw new Error(response.error);
          }
        }
        toast.success(`${recordIds.length} record${recordIds.length !== 1 ? "s" : ""} archived.`);
      } catch (err) {
        setRecords((prev) => [...prev.filter((r) => !recordIds.includes(r.id)), ...prevRecords]);
        toast.error(err instanceof Error ? err.message : "Failed to archive records.");
      } finally {
        setBulkArchiveLoading(false);
      }
    },
    [records],
  );

   const handleRowDelete = useCallback(
     async (recordId: string) => {
       const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
       if (!uuidRegex.test(recordId)) {
         // Remove the record from UI state if it's invalid
         const prevRecord = records.find((r) => r.id === recordId);
         if (prevRecord) {
           setRecords(prev => prev.filter(r => r.id !== recordId));
           toast.warning("Removed invalid record from the board.");
         }
         toast.error("Invalid record ID.");
         return;
       }

       const prevRecord = records.find((r) => r.id === recordId);
       setRecords((prev) => prev.filter((r) => r.id !== recordId));
       try {
         const response = await bulkDeleteRecords([recordId]);
         if (response.error) {
           if (prevRecord) setRecords((prev) => [...prev, prevRecord]);
           toast.error(response.error);
         } else {
           toast.success("Record deleted.");
         }
       } catch {
         if (prevRecord) setRecords((prev) => [...prev, prevRecord]);
         toast.error("Failed to delete record.");
       }
     },
     [records],
   );

  const handleRowDuplicate = useCallback(
    async (recordId: string) => {
      const record = records.find((r) => r.id === recordId);
      if (!record) return;
      try {
        const response = await fetch("/api/boards/records/duplicate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recordId }),
        });
        const data = await response.json();
        if (data.error) {
          toast.error(data.error);
        } else if (data.data) {
          const newRecord = data.data;
          setRecords((prev) => [...prev, newRecord]);
          // Copy cell values
          const newCellValues: Array<[string, ColumnValue]> = [];
          for (const [key, value] of cellValues.entries()) {
            if (key.startsWith(`${recordId}:`)) {
              const columnId = key.split(":")[1];
              newCellValues.push([`${newRecord.id}:${columnId}`, value]);
            }
          }
          if (newCellValues.length > 0) {
            await upsertBoardCellValues(board.id, board.organizationId, board.workspaceId, newCellValues);
            setCellValues((prev) => {
              const next = new Map(prev);
              newCellValues.forEach(([k, v]) => next.set(k, v));
              return next;
            });
          }
          toast.success("Record duplicated.");
        }
      } catch {
        toast.error("Failed to duplicate record.");
      }
    },
    [board, cellValues, records],
  );

  const handleMoveToGroup = useCallback(
    async (recordIds: string[], targetGroupId: string) => {
      const prevRecords = records.filter((r) => recordIds.includes(r.id));
      setRecords((prev) =>
        prev.map((r) => (recordIds.includes(r.id) ? { ...r, groupId: targetGroupId } : r)),
      );
      try {
        // Use bulkUpdate to move records to group
        const response = await fetch("/api/boards/records/bulk-update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recordIds, targetGroupId }),
        });
        const data = await response.json();
        if (data.error) {
          setRecords((prev) => [...prev.filter((r) => !recordIds.includes(r.id)), ...prevRecords]);
          toast.error(data.error);
        } else {
          toast.success(`${recordIds.length} record${recordIds.length !== 1 ? "s" : ""} moved.`);
        }
      } catch {
        setRecords((prev) => [...prev.filter((r) => !recordIds.includes(r.id)), ...prevRecords]);
        toast.error("Failed to move records.");
      }
    },
    [records],
  );

  const handleMoveToStatus = useCallback(
    async (recordIds: string[], statusName: string) => {
      const prevRecords = records.filter((r) => recordIds.includes(r.id));
      setRecords((prev) =>
        prev.map((r) => (recordIds.includes(r.id) ? { ...r, status: statusName as EntityStatus } : r)),
      );
      try {
        const response = await fetch("/api/boards/records/bulk-update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recordIds, cellValues: { status: statusName } }),
        });
        const data = await response.json();
        if (data.error) {
          setRecords((prev) => [...prev.filter((r) => !recordIds.includes(r.id)), ...prevRecords]);
          toast.error(data.error);
        } else {
          toast.success(`${recordIds.length} record${recordIds.length !== 1 ? "s" : ""} updated.`);
        }
      } catch {
        setRecords((prev) => [...prev.filter((r) => !recordIds.includes(r.id)), ...prevRecords]);
        toast.error("Failed to update records.");
      }
    },
    [records],
  );

const handleColumnAdd = useCallback(async (type: string, afterColumnId?: string, settings?: Record<string, unknown>) => {
     const newColumn: ColumnDefinition = {
       id: crypto.randomUUID(),
      boardId: board.id,
      key: `col_${Date.now()}`,
      label: `New ${type}`,
      type: type as ColumnDefinition["type"],
      required: false,
      hidden: false,
      frozen: false,
      defaultValue: null,
      settings: settings ?? {},
      permissions: { view: ["owner", "editor", "commenter", "viewer"], edit: ["owner", "editor"], configure: ["owner"] },
      validation: [],
      version: 1,
      order: columns.length,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setColumns((prev) => [...prev, newColumn]);
    try {
      await upsertBoardColumns(board.id, board.organizationId, board.workspaceId, [...columns, newColumn]);
    } catch (err) {
      toast.error("Failed to create column");
      console.error(err);
    }
  }, [board, columns]);

  const handleColumnDelete = useCallback(async (columnId: string) => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(columnId)) {
      toast.error("Invalid column ID");
      return;
    }

    const targetColumn = columns.find((c) => c.id === columnId);
    if (!targetColumn) return;

    const isNameColumn = targetColumn.key === "name";
    const remainingColumns = columns.filter((c) => c.id !== columnId);

    // Never leave a board with zero columns. If the user deletes the last
    // remaining column, refuse with a clear message instead of crashing views.
    if (remainingColumns.length === 0) {
      toast.error("Cannot delete the last column. Add another column first.");
      return;
    }

    setDeletingColumnId(columnId);
    const prevColumns = columns;

    // When the primary/title column (key "name") is deleted, promote another
    // column to be the record-title column so views never lose their title.
    // Preference: first remaining text-type column, else the first column.
    let nextPrimaryLabel: string | null = null;
    if (isNameColumn) {
      const nextPrimary =
        remainingColumns.find((c) => c.type === "text") ?? remainingColumns[0];
      nextPrimaryLabel = nextPrimary?.label ?? null;
    }

    // Optimistic UI update — remove the column and its cell values
    setColumns((prev) => prev.filter((c) => c.id !== columnId));
    setCellValues((prev) => {
      const next = new Map(prev);
      for (const key of next.keys()) {
        if (key.endsWith(`:${columnId}`)) next.delete(key);
      }
      return next;
    });

    // Clean up view config references in local state
    setBoardViews((prevViews) =>
      prevViews.map((view) => {
        if (!view.visibleColumnIds?.includes(columnId) &&
            !view.columnWidths?.[columnId] &&
            !(view.filters || []).some((f) => f.columnId === columnId) &&
            !(view.sorting || []).some((s) => s.columnId === columnId) &&
            !(view.grouping || []).some((g) => g.columnId === columnId)) {
          return view;
        }
        const nextFilters = (view.filters || []).filter((f) => f.columnId !== columnId);
        const nextSorting = (view.sorting || []).filter((s) => s.columnId !== columnId);
        const nextGrouping = (view.grouping || []).filter((g) => g.columnId !== columnId);
        const nextVisibleColumnIds = (view.visibleColumnIds || []).filter((id) => id !== columnId);
        const nextColumnWidths = { ...(view.columnWidths || {}) };
        delete nextColumnWidths[columnId];
        // Clear view-type-specific refs to this column. Walks the settings
        // object generically so it works for every view type (kanban groupBy,
        // calendar dateColumnId, timeline startDateColumnId, chart valueColumnId,
        // cardFields, collapsedColumns, ...).
        const nextSettings = clearColumnRefsFromViewSettings(
          view.settings ?? ({} as BoardView["settings"]),
          columnId,
        );
        return {
          ...view,
          filters: nextFilters,
          sorting: nextSorting,
          grouping: nextGrouping,
          visibleColumnIds: nextVisibleColumnIds,
          columnWidths: nextColumnWidths,
          settings: nextSettings,
          updatedAt: new Date().toISOString(),
        };
      }),
    );

    try {
      // When the primary/title column is deleted, promote another column to be
      // the record-title column so views never lose their title. Preference:
      // first remaining text-type column, else the first column.
      if (isNameColumn && nextPrimaryLabel) {
        try {
          await updateBoardPrimaryLabel(board.id, nextPrimaryLabel);
        } catch {
          // Non-fatal: the column still deletes; the label just stays stale.
        }
      }

      const response = await deleteColumn(columnId);
      if (response.error) {
        // Restore columns on failure
        setColumns(prevColumns);
        toast.error(response.error);
      } else {
        toast.success(
          nextPrimaryLabel
            ? `Column deleted. "${nextPrimaryLabel}" is now the item name column.`
            : `Column "${targetColumn.label}" deleted.`,
        );
      }
    } catch (err) {
      setColumns(prevColumns);
      const message = err instanceof Error ? err.message : "Failed to delete column";
      toast.error(message);
    } finally {
      setDeletingColumnId(null);
    }
  }, [columns]);

  const handleColumnRename = useCallback(async (columnId: string, label: string) => {
    setColumns((prev) => prev.map((c) => (c.id === columnId ? { ...c, label, updatedAt: new Date().toISOString() } : c)));
    try {
      await renameColumn(columnId, label);
      toast.success(`Column renamed to "${label}".`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to rename column";
      toast.error(message);
    }
  }, []);

  const handleColumnDuplicate = useCallback(async (columnId: string) => {
    try {
      const response = await duplicateColumn(columnId);
      if (response.error) {
        toast.error(response.error);
      } else if (response.data) {
        setColumns((prev) => [...prev, response.data!]);
        toast.success(`Column duplicated.`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to duplicate column";
      toast.error(message);
    }
  }, []);

  const handleColumnDuplicateWithValues = useCallback(async (columnId: string) => {
    try {
      const response = await duplicateColumn(columnId);
      if (response.error) {
        toast.error(response.error);
      } else if (response.data) {
        setColumns((prev) => [...prev, response.data!]);
        toast.success(`Column and values duplicated.`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to duplicate column";
      toast.error(message);
    }
  }, []);

  const handleColumnToggleHidden = useCallback(async (columnId: string) => {
    setColumns((prev) =>
      prev.map((c) => (c.id === columnId ? { ...c, hidden: !c.hidden, updatedAt: new Date().toISOString() } : c)),
    );
    try {
      // Toggle the hidden flag. If the column isn't found locally (e.g. it was
      // just removed), default to un-hiding it so the toggle is a no-op rather
      // than a hard error.
      const currentHidden = columns.find((c) => c.id === columnId)?.hidden ?? false;
      await hideColumns([columnId], !currentHidden);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update column";
      toast.error(message);
    }
  }, [columns]);

  const handleColumnToggleFrozen = useCallback(async (columnId: string) => {
    const current = columns.find((c) => c.id === columnId);
    if (!current) return;
    setColumns((prev) =>
      prev.map((c) => (c.id === columnId ? { ...c, frozen: !c.frozen, updatedAt: new Date().toISOString() } : c)),
    );
    try {
      await freezeColumn(columnId, !current.frozen);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update column";
      toast.error(message);
    }
  }, [columns]);

  const handleColumnChangeType = useCallback(async (columnId: string, newType: ColumnTypeKey) => {
    try {
      const response = await changeColumnType(columnId, newType);
      if (response.error) {
        toast.error(response.error);
      } else {
        toast.success("Column type changed.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to change column type";
      toast.error(message);
    }
  }, []);

  const handleColumnUpdateSettings = useCallback(async (columnId: string, patch: Partial<ColumnDefinition>) => {
    const prevColumns = columns;
    setColumns((prev) => prev.map((c) => (c.id === columnId ? { ...c, ...patch, updatedAt: new Date().toISOString() } : c)));
    try {
      await upsertBoardColumns(board.id, board.organizationId, board.workspaceId, columns.map((c) => (c.id === columnId ? { ...c, ...patch, updatedAt: new Date().toISOString() } : c)));
    } catch (err) {
      setColumns(prevColumns);
      toast.error("Failed to update column");
      console.error(err);
    }
  }, [board, columns]);

  const handleColumnUpdateDescription = useCallback(async (columnId: string, description: string) => {
    handleColumnUpdateSettings(columnId, { description });
  }, [handleColumnUpdateSettings]);

  const handleColumnToggleRestrictEditing = useCallback((columnId: string) => {
    setColumns((prev) =>
      prev.map((c) => (c.id === columnId ? { ...c, restrictEditing: !c.restrictEditing, updatedAt: new Date().toISOString() } : c)),
    );
  }, []);

  const handleColumnToggleRestrictView = useCallback((columnId: string) => {
    setColumns((prev) =>
      prev.map((c) => (c.id === columnId ? { ...c, restrictView: !c.restrictView, updatedAt: new Date().toISOString() } : c)),
    );
  }, []);

  const handleColumnToggleWrapText = useCallback((columnId: string) => {
    setColumns((prev) =>
      prev.map((c) =>
        c.id === columnId ? { ...c, wrapText: !c.wrapText, updatedAt: new Date().toISOString() } : c,
      ),
    );
  }, []);

  const handleColumnResize = useCallback((columnId: string, newWidth: number) => {
    setBoardViews((prev) =>
      prev.map((v) =>
        v.id === activeViewId
          ? { ...v, columnWidths: { ...(v.columnWidths || {}), [columnId]: newWidth } }
          : v,
      ),
    );
  }, [activeViewId]);

  const handleColumnReorder = useCallback(async (activeId: string, overId: string) => {
    const oldIndex = columns.findIndex((c) => c.id === activeId);
    const newIndex = columns.findIndex((c) => c.id === overId);
    if (oldIndex === -1 || newIndex === -1) return;
    const newColumns = Array.from(columns);
    const [moved] = newColumns.splice(oldIndex, 1);
    newColumns.splice(newIndex, 0, moved);
    newColumns.forEach((c, i) => {
      c.order = i;
      c.updatedAt = new Date().toISOString();
    });
    setColumns(newColumns);
    try {
      await upsertBoardColumns(board.id, board.organizationId, board.workspaceId, newColumns);
    } catch (err) {
      toast.error("Failed to reorder columns");
    }
  }, [columns, board]);

  const handleImportConfirm = useCallback(
    async (args: {
      newColumns: ColumnDefinition[];
      updatedColumns: ColumnDefinition[];
      records: Array<{ title: string; cellValues: Record<string, ColumnValue> }>;
      skippedRows: Array<{ rowIndex: number; reason: string; rawRow: Record<string, ColumnValue> }>;
      columnsToDelete: string[];
      targetGroupId: string | null;
      keepUnmappedColumns: boolean;
      columnPlan: {
        finalColumns: ColumnDefinition[];
        columnsToDelete: ColumnDefinition[];
      };
    }) => {
setImporting(true);
      try {
        // The final column set comes from the explicit column plan built in
        // the wizard BEFORE any backend writes. It is ordered to match the
        // source file's left-to-right layout, it contains each imported column
        // exactly once (mapped defaults keep their id/type/settings, unmapped
        // defaults are excluded), and the unmapped defaults are listed in
        // `columnsToDelete` as live ColumnDefinition objects with real backend
        // ids. Persisting this list (not a concat of updated+new) is what makes
        // the order survive a page refresh.
        const finalColumns = args.columnPlan.finalColumns;
        const columnsToDelete = args.columnPlan.columnsToDelete;

        const newRecords: BoardRecord[] = args.records.map((r, idx) => ({
          id: crypto.randomUUID(),
          organizationId: board.organizationId,
          workspaceId: board.workspaceId,
          boardId: board.id,
          groupId: args.targetGroupId,
          title: r.title,
          status: "active" as const,
          version: 1,
          archivedAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }));

        const newCellValues: Array<[string, ColumnValue]> = [];
        args.records.forEach((r, recordIdx) => {
          const recordId = newRecords[recordIdx].id;
          Object.entries(r.cellValues).forEach(([colId, value]) => {
            if (value !== null && value !== undefined && value !== "") {
              newCellValues.push([`${recordId}:${colId}`, value]);
            }
          });
        });

        // (a) Create the new columns and (c) set the final order for ALL
        // remaining columns in one pass. Each column's `order` is assigned
        // 0..n-1 following the file order from the column plan, so the order
        // is persisted in the backend (columns.sort_order) and survives a
        // page refresh. Inserting columns one-by-one is what caused the
        // random placement before.
        const orderedFinalColumns = finalColumns.map((col, index) => ({
          ...col,
          order: index,
          updatedAt: new Date().toISOString(),
        }));
        await upsertBoardColumns(board.id, board.organizationId, board.workspaceId, orderedFinalColumns);

        if (newRecords.length > 0) {
          await upsertBoardRecords(board.id, board.organizationId, board.workspaceId, newRecords);
        }

        if (newCellValues.length > 0) {
          await upsertBoardCellValues(board.id, board.organizationId, board.workspaceId, newCellValues);
        }

        // (d) Delete the unmapped default columns. Runs ONCE, after the import
        // has succeeded. Only the unmapped default columns are removed; mapped
        // default columns stay and hold the imported data. If the import had
        // failed above, this block is never reached and nothing is deleted.
        //
        // The delete list comes from the column plan built in the wizard, so it
        // contains live ColumnDefinition objects with real backend ids. A stale
        // id (non-UUID demo placeholder, an id that no longer exists after the
        // upsert, or a leftover from a previous run) would make the
        // deleteBoardColumns endpoint reject the whole batch with
        // "invalid column id" and leave every unmapped default column behind.
        if (!importCleanupDoneRef.current) {
          importCleanupDoneRef.current = true;
          try {
            // Log the id AND its type right before each delete call so any
            // "invalid column id" regression is traceable to a specific id.
            if (columnsToDelete.length > 0) {
              console.warn("[EngineBoardPage] import cleanup delete batch", {
                boardId: board.id,
                count: columnsToDelete.length,
                ids: columnsToDelete.map((c) => c.id),
                idsWithType: columnsToDelete.map((c) => ({ id: c.id, type: typeof c.id, label: c.label })),
              });
              await deleteBoardColumns(
                board.id,
                columnsToDelete.map((c) => c.id),
              );
            }

            // (e) Refetch the board columns from the backend and replace local
            // state with that result. This guarantees the UI matches the
            // source of truth (including the new `order` values written above)
            // rather than trusting the in-memory plan.
            const freshColumnsResult = await loadBoardColumns(board.id);
            let freshColumns: ColumnDefinition[] = [];
            if (freshColumnsResult.error || !freshColumnsResult.data) {
              throw new Error(freshColumnsResult.error ?? "Failed to load columns");
            }
            freshColumns = freshColumnsResult.data;

            setColumns(freshColumns);
            setBoardViews((prevViews) =>
              prevViews.map((view) => ({
                ...view,
                visibleColumnIds: freshColumns.map((c) => c.id),
                columnWidths: Object.fromEntries(
                  Object.entries(view.columnWidths ?? {}).filter(([id]) =>
                    freshColumns.some((c) => c.id === id),
                  ),
                ),
                filters: (view.filters ?? []).filter((f) =>
                  freshColumns.some((c) => c.id === f.columnId),
                ),
                sorting: (view.sorting ?? []).filter((s) =>
                  freshColumns.some((c) => c.id === s.columnId),
                ),
                grouping: (view.grouping ?? []).filter((g) =>
                  freshColumns.some((c) => c.id === g.columnId),
                ),
              })),
            );
          } catch (cleanupErr) {
            // The import itself succeeded; a cleanup failure must not roll it
            // back or lose the imported data. Surface it and let the user
            // retry the cleanup from the board UI.
            console.error("[EngineBoardPage] import cleanup failed:", cleanupErr);
            toast.error("Import finished, but some unmapped columns could not be removed. You can delete them manually.");
          }
        }

        setRecords((prev) => [...prev, ...newRecords]);
        setCellValues((prev) => {
          const next = new Map(prev);
          newCellValues.forEach(([key, value]) => next.set(key, value));
          return next;
        });

        // Update the active view to include all remaining columns and set the column order (via visibleColumnIds)
        // Use the post-cleanup remaining ids so removed columns stay out of the view.
        setBoardViews((prevViews) => {
          const activeView = prevViews.find((v) => v.id === activeViewId);
          if (!activeView) return prevViews;

          const remainingColumns = finalColumns.filter((c) => !columnsToDelete.some((d) => d.id === c.id));
          const newVisibleColumnIds = remainingColumns.map((c) => c.id);
          // Set the visible column ids to the remaining column ids (all columns visible, in the order of finalColumns)
          const updatedView = {
            ...activeView,
            visibleColumnIds: newVisibleColumnIds,
            updatedAt: new Date().toISOString(),
          };

          return prevViews.map((v) => (v.id === activeViewId ? updatedView : v));
        });

        try {
          const result = await refreshClient360Snapshot();
          if (!result.success) {
            console.warn("[EngineBoardPage] Client 360 snapshot refresh failed:", result.error);
          }
        } catch (err) {
          console.warn("[EngineBoardPage] Client 360 snapshot refresh failed:", err);
        }

        setImportWizardOpen(false);
        return { createdCount: newRecords.length, importErrors: args.skippedRows.map((s) => ({ rowIndex: s.rowIndex, reason: s.reason })) };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Import failed";
        toast.error(message);
        throw err;
      } finally {
        setImporting(false);
      }
    },
    [board, columns, activeViewId],
  );

  const handleOpenImport = useCallback(() => {
    setImportWizardOpen(true);
  }, []);

  const handleExportExcel = useCallback(async () => {
    setExporting(true);
    try {
      const { buildExportWorkbook } = await import("@/features/boards/engine/lib/import-export");
      const workbook = buildExportWorkbook({
        boardName: board.name,
        columns,
        columnOrder: columns.map((c) => c.id),
        primaryColumnLabel: board.primaryColumnLabel ?? "Name",
        records: records.map((r) => ({
          record: { id: r.id, title: r.title, groupId: r.groupId ?? null },
          cellValues: Object.fromEntries(
            Array.from(cellValues.entries())
              .filter(([key]) => key.startsWith(`${r.id}:`))
              .map(([key, value]) => [key.split(":")[1], value]),
          ),
        })),
        groups,
      });
      const arrayBuffer = workbookToArrayBuffer(workbook);
      const blob = new Blob([arrayBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${board.name}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Export downloaded");
    } catch (err) {
      toast.error("Export failed");
      console.error(err);
    } finally {
      setExporting(false);
    }
  }, [board, columns, records, cellValues, groups]);

   useEffect(() => {
     const handleImportEvent = () => handleOpenImport();
     const handleExportEvent = () => handleExportExcel();
     window.addEventListener("board:open-import", handleImportEvent);
     window.addEventListener("board:export-excel", handleExportEvent);
     return () => {
       window.removeEventListener("board:open-import", handleImportEvent);
       window.removeEventListener("board:export-excel", handleExportEvent);
     };
}, [handleOpenImport, handleExportExcel]);

   const boardData = useMemo(
    () => ({
      board,
      columns,
      groups,
      records,
      cellValues,
      totalRecords: records.length,
      filteredRecordCount: records.length,
      page: 1,
      pageSize: records.length,
      totalPages: 1,
    }),
    [board, columns, groups, records, cellValues],
  );

  return (
    <>
      <BoardLayout
        boardId={board.id}
        board={board}
        description={description}
        onNewItem={() => {}}
        onImport={handleOpenImport}
        onExport={handleExportExcel}
        importing={importing}
        exporting={exporting}
        views={views}
        activeViewId={activeViewId}
        onViewChange={setActiveViewId}
        columns={columns}
      >
          <ViewEngine
            boardData={boardData}
            view={boardViews.find((v) => v.id === activeViewId) ?? boardViews[0]}
            views={boardViews}
            onViewChange={setActiveViewId}
            onCellChange={handleCellChange}
            columnOps={{
              onColumnRename: handleColumnRename,
              onColumnDuplicate: handleColumnDuplicate,
              onColumnDuplicateWithValues: handleColumnDuplicateWithValues,
              onColumnToggleHidden: handleColumnToggleHidden,
              onColumnToggleFrozen: handleColumnToggleFrozen,
              onColumnChangeType: handleColumnChangeType,
              onColumnDelete: handleColumnDelete,
              deletingColumnId,
              onColumnAdd: handleColumnAdd,
              onUpdateColumnSettings: handleColumnUpdateSettings,
              onColumnUpdateDescription: handleColumnUpdateDescription,
              onColumnToggleRestrictEditing: handleColumnToggleRestrictEditing,
              onColumnToggleRestrictView: handleColumnToggleRestrictView,
               onColumnToggleWrapText: handleColumnToggleWrapText,
               onColumnResize: handleColumnResize,
               onColumnReorder: handleColumnReorder,
               columnWidths: boardViews.find((v) => v.id === activeViewId)?.columnWidths ?? {},
              primaryColumnLabel: board.primaryColumnLabel ?? "Name",
              onPrimaryColumnRename: (label: string) => {
                try {
                  updateBoardPrimaryLabel(board.id, label);
                  toast.success("Column label updated.");
                } catch (err) {
                  const message = err instanceof Error ? err.message : "Failed to update label";
                  toast.error(message);
                }
              },
            }}
            onBulkArchive={handleBulkArchive}
            onBulkDelete={handleBulkDelete}
            onRowDelete={handleRowDelete}
            onRowDuplicate={handleRowDuplicate}
            onMoveToGroup={handleMoveToGroup}
            onMoveToStatus={handleMoveToStatus}
            bulkArchiveLoading={bulkArchiveLoading}
            bulkDeleteLoading={bulkDeleteLoading}
          />
      </BoardLayout>

      <BoardSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        boardId={board.id}
        workspaceId={board.workspaceId}
        boardName={board.name}
        description={description}
      />

      <ImportWizard
        open={importWizardOpen}
        onOpenChange={(open) => {
          // Reset the per-import cleanup guard when the wizard closes so a
          // later import can run its cleanup again.
          if (!open) importCleanupDoneRef.current = false;
          setImportWizardOpen(open);
        }}
        boardName={board.name}
        columns={columns}
        groups={groups}
        onConfirm={handleImportConfirm}
      />
    </>
  );
}