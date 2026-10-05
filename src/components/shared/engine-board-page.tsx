"use client";

import { Component, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { BoardLayout } from "@/components/shared/board-layout";
import { TableView } from "@/features/boards/engine";
import { CalendarView } from "@/features/boards/engine/view-engine/views/calendar-view";
import { KanbanView } from "@/features/boards/engine/view-engine/views/kanban-view";
import { DashboardView } from "@/features/boards/engine/view-engine/views/dashboard/dashboard-view";
import type { DemoBoardPageData } from "@/features/boards/engine/demo-data";
import { createColumn } from "@/features/boards/engine/demo-data";
import type {
  BoardRecord,
  BoardView,
  ColumnDefinition,
  ColumnTypeKey,
  ColumnValue,
  ConnectedBoardColumnSettings,
  DropdownOption,
  Group,
  MirrorColumnSettings,
} from "@/features/boards/engine/types";
import { columnTypeRegistry } from "@/features/boards/engine/column-registry";
import { registerAllCellRenderers } from "@/features/boards/engine";
import {
  updateCell,
  reorderColumns,
  moveRecord,
  editRecord,
  createRecord,
  bulkCreateRecords,
  renameView,
  updateViewSettings,
  duplicateView,
  deleteView,
  ensureBoardViews,
  updateColumnOptions,
  addColumn,
  renameColumn,
  deleteColumn,
  updateBoardPrimaryLabel,
  loadRecordsPaginated,
} from "@/features/boards/engine/actions";
import { viewCatalog, getDefaultSettings } from "@/features/boards/engine";
import {
  applyConnectBoardTwoWaySync,
  extractLinkedItems,
} from "@/features/boards/engine/connected-data/two-way-sync";
import { MirrorSettingsModal } from "@/features/boards/engine/components/mirror-settings-modal";
import { MirrorDataProvider } from "@/features/boards/engine/connected-data/mirror-data-context";
import { useGroup } from "@/features/boards/engine/hooks/use-group";
import { useExportToExcel } from "@/features/boards/engine/hooks/use-export-to-excel";
import { ImportWizard } from "@/features/boards/engine/components/import-wizard";
import {
  isOptionColumn,
  normalizeOptions,
  resolveOptionIdForColumn,
} from "@/features/boards/engine/lib/import-export";
import type { ViewSettingsByType } from "@/features/boards/engine/types";

registerAllCellRenderers();

class RenderErrorBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[RENDER_CRASH]", error?.message, error?.stack, info?.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, color: "red" }}>
          <h2>Render Error</h2>
          <pre>{this.state.error?.message}</pre>
          <pre>{this.state.error?.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

interface EngineBoardPageProps {
  data: DemoBoardPageData;
}

const DEMO_GROUPS: Omit<Group, "boardId">[] = [
  {
    id: "group-all",
    name: "All Tasks",
    color: "#94a3b8",
    collapsed: false,
    order: 0,
    status: "active",
    statusOptions: [],
    organizationId: "",
    workspaceId: "",
  },
];

function ensureDefaultView(
  boardId: string,
  organizationId: string,
  workspaceId: string,
): BoardView {
  return {
    id: `view-${boardId}-table`,
    boardId,
    organizationId,
    workspaceId,
    name: "Table",
    type: "table",
    visibility: "shared",
    filters: [],
    sorting: [],
    grouping: [],
    visibleColumnIds: [],
    columnWidths: {},
    rowHeight: 44,
    settings: {},
    sharedWith: ["owner", "editor", "viewer"],
    isDefault: true,
    order: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function EngineBoardPage({ data }: EngineBoardPageProps) {
  console.warn(`[EngineBoardPage] Rendering board: ${data.board.name} (${data.board.id})`, {
    columns: data.columns.length,
    records: data.records.length,
    views: data.views.length,
    groups: data.groups.length,
  });

  const effectiveColumns = useMemo<ColumnDefinition[]>(() => data.columns.length > 0
    ? data.columns
    : [
        {
          id: `col-${data.board.id}-name`,
          boardId: data.board.id,
          key: "name",
          label: "Name",
          type: "text" as ColumnDefinition["type"],
          required: false,
          hidden: false,
          frozen: false,
          defaultValue: "",
          settings: {},
          permissions: { view: ["owner", "editor", "commenter", "viewer"], edit: ["owner", "editor"], configure: ["owner"] },
          validation: [],
          version: 1,
          order: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
  [data.columns, data.board.id]);

  const effectiveGroups = useMemo<Group[]>(() => data.groups.length > 0
    ? data.groups
    : [
        {
          id: `group-${data.board.id}-default`,
          boardId: data.board.id,
          organizationId: data.board.organizationId,
          workspaceId: data.board.workspaceId,
          name: "Group Title",
          color: "#94a3b8",
          collapsed: false,
          order: 0,
          status: "active" as const,
          parentGroupId: null,
          permissions: undefined,
          statusOptions: [],
        },
      ],
  [data.groups, data.board.id, data.board.organizationId, data.board.workspaceId]);

  const effectiveViews = useMemo<BoardView[]>(() => data.views && data.views.length > 0
    ? data.views
    : [
        ensureDefaultView(
          data.board.id,
          data.board.organizationId,
          data.board.workspaceId,
        ),
      ],
  [data.views, data.board.id, data.board.organizationId, data.board.workspaceId]);

  console.warn(`[EngineBoardPage] Effective data after defaults:`, {
    columns: effectiveColumns.length,
    records: data.records.length,
    views: effectiveViews.length,
    groups: effectiveGroups.length,
  });

  const [columns, setColumns] = useState<ColumnDefinition[]>(effectiveColumns);
  const [records, setRecords] = useState<BoardRecord[]>(data.records);
  const [recordTotal, setRecordTotal] = useState<number>(data.recordCount ?? data.records.length);
  const [recordOffset, setRecordOffset] = useState<number>(data.recordOffset ?? 0);
  const [hasMoreRecords, setHasMoreRecords] = useState<boolean>(
    (data.recordCount ?? data.records.length) > data.records.length,
  );
  const [loadingMoreRecords, setLoadingMoreRecords] = useState(false);
  const [cellValues, setCellValues] = useState<Map<string, ColumnValue>>(
    new Map(data.cellValues),
  );

  const PAGE_SIZE = 100;

  const loadMoreRecords = useCallback(async () => {
    if (loadingMoreRecords || !hasMoreRecords) return;
    setLoadingMoreRecords(true);
    try {
      const result = await loadRecordsPaginated(data.board.id, PAGE_SIZE, recordOffset + records.length);
      const pageData = result.data;
      if (pageData) {
        setRecords((prev) => [...prev, ...pageData.records]);
        setRecordTotal(pageData.total);
        setHasMoreRecords(pageData.hasMore);
      }
    } catch (err) {
      console.error("Failed to load more records:", err);
    } finally {
      setLoadingMoreRecords(false);
    }
  }, [data.board.id, recordOffset, records.length, hasMoreRecords, loadingMoreRecords]);

  // Infinite scroll handler
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const { scrollTop, scrollHeight, clientHeight } = target;
    if (scrollHeight - scrollTop - clientHeight < 200) {
      loadMoreRecords();
    }
  }, [loadMoreRecords]);

  const [views, setViews] = useState<BoardView[]>(effectiveViews);
  const [activeViewId, setActiveViewId] = useState<string>(
    effectiveViews[0]?.id ?? "table",
  );
  const [viewSettings, setViewSettings] = useState<Record<string, ViewSettingsByType>>(
    {},
  );

  console.warn(`[EngineBoardPage] Views initialized:`, effectiveViews.map(v => ({ id: v.id, type: v.type, name: v.name })));
  console.warn(`[EngineBoardPage] Active view ID: ${activeViewId}`);

  // Mirror column creation (shared settings step for both the manual "+"
  // flow and the prompted "link → create mirror" flow).
  const [mirrorModalOpen, setMirrorModalOpen] = useState(false);
  const [mirrorAfterColumnId, setMirrorAfterColumnId] = useState<string | null>(null);
  const [mirrorSourceColumnId, setMirrorSourceColumnId] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.columnId || !detail?.options) return;
      setColumns((prev) =>
        prev.map((col) =>
          col.id === detail.columnId
            ? { ...col, settings: { ...col.settings, options: detail.options } }
            : col,
        ),
      );
    };
    window.addEventListener("column-options-updated", handler as EventListener);
    return () =>
      window.removeEventListener("column-options-updated", handler as EventListener);
  }, []);

  const syncedViewIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const viewsToSync = effectiveViews;
    const viewIds = new Set(viewsToSync.map((v) => v.id));

    const needsSync = [...viewIds].some((id) => !syncedViewIdsRef.current.has(id));
    if (!needsSync) return;

    console.warn(`[EngineBoardPage] Syncing ${viewIds.size} views to database...`);
    ensureBoardViews(viewsToSync)
      .then((result) => {
        if (result.error) {
          console.error(`[EngineBoardPage] Failed to sync views:`, result.error);
          toast.error(`Failed to sync views: ${result.error}`);
        } else {
          console.warn(`[EngineBoardPage] Views synced successfully`);
          syncedViewIdsRef.current = viewIds;
        }
      })
      .catch((err) => {
        console.error("[EngineBoardPage] Failed to ensure board views:", err);
        toast.error("Failed to sync views to database.");
      });
  }, [data.board.id, effectiveViews]);

  const handleColumnAdd = useCallback(
    async (
      type: ColumnTypeKey,
      afterColumnId?: string,
      settings?: Record<string, unknown>,
    ) => {
      if (type === "mirror") {
        setMirrorSourceColumnId(null);
        setMirrorAfterColumnId(afterColumnId ?? null);
        setMirrorModalOpen(true);
        return;
      }
      const definition = columnTypeRegistry[type];
      const columnId = `col-${Date.now()}`;
      const columnKey = `column-${columns.length + 1}`;
      const newColumn = createColumn(
        data.board.id,
        columnId,
        columnKey,
        "New Column",
        type,
        columns.length,
        definition.defaultValue,
        settings ?? {},
      );

      setColumns((prev) => {
        if (!afterColumnId) return [...prev, newColumn];
        const idx = prev.findIndex((c) => c.id === afterColumnId);
        if (idx === -1) return prev;
        const next = [...prev];
        next.splice(idx + 1, 0, newColumn);
        return next;
      });

      try {
        const fd = new FormData();
        fd.set("organizationId", data.board.organizationId);
        fd.set("workspaceId", data.board.workspaceId);
        fd.set("boardId", data.board.id);
        fd.set("key", columnKey);
        fd.set("label", "New Column");
        fd.set("type", type);
        fd.set("required", "false");
        if (definition.defaultValue !== undefined && definition.defaultValue !== null) {
          fd.set("defaultValue", JSON.stringify(definition.defaultValue));
        }
        fd.set("settings", JSON.stringify(settings ?? {}));
        const response = await addColumn(fd);
        if (response.error) {
          toast.error(response.error);
        }
      } catch {
        toast.error("Failed to create column.");
      }
    },
    [data.board.id, data.board.organizationId, data.board.workspaceId, columns.length],
  );

  const handleMirrorConfirm = useCallback(
    (settings: MirrorColumnSettings) => {
      const type = "mirror" as const;
      const definition = columnTypeRegistry[type];
      const order = !mirrorAfterColumnId
        ? columns.length
        : (() => {
            const idx = columns.findIndex((c) => c.id === mirrorAfterColumnId);
            return idx === -1 ? columns.length : idx + 1;
          })();
      const newColumn = createColumn(
        data.board.id,
        `col-mirror-${Date.now()}`,
        `column-${columns.length + 1}`,
        "New Mirror",
        type,
        order,
        definition.defaultValue,
        settings as unknown as Record<string, unknown>,
      );

      setColumns((prev) => {
        if (!mirrorAfterColumnId) return [...prev, newColumn];
        const idx = prev.findIndex((c) => c.id === mirrorAfterColumnId);
        if (idx === -1) return prev;
        const next = [...prev];
        next.splice(idx + 1, 0, newColumn);
        return next;
      });

      setMirrorModalOpen(false);
      setMirrorAfterColumnId(null);
      setMirrorSourceColumnId(null);
      toast.success("Mirror column created.");
    },
    [data.board.id, columns, mirrorAfterColumnId],
  );

  const handleColumnRename = useCallback(
    async (columnId: string, label: string) => {
      setColumns((prev) =>
        prev.map((c) => (c.id === columnId ? { ...c, label } : c)),
      );
      try {
        const response = await renameColumn(columnId, label);
        if (response.error) {
          toast.error(response.error);
        } else {
          toast.success("Column renamed.");
        }
      } catch {
        toast.error("Failed to rename column.");
      }
    },
    [toast],
  );

  const handlePrimaryColumnRename = useCallback(
    async (label: string) => {
      try {
        const response = await updateBoardPrimaryLabel(
          data.board.id,
          label,
        );
        if (response.error) {
          toast.error(response.error);
        }
      } catch {
        toast.error("Failed to rename column.");
      }
    },
    [data.board.id, toast],
  );

  const handleColumnDelete = useCallback((columnId: string) => {
    setColumns((prev) => prev.filter((c) => c.id !== columnId));
  }, []);

  const handleColumnChangeType = useCallback((columnId: string, type: ColumnTypeKey) => {
    setColumns((prev) =>
      prev.map((c) => {
        if (c.id !== columnId) return c;
        const typeDef = columnTypeRegistry[type];
        const currentOptions =
          (c.settings?.options as DropdownOption[] | undefined) ?? [];
        const options =
          typeDef?.defaultOptions && currentOptions.length === 0
            ? typeDef.defaultOptions.map((opt) => ({ ...opt }))
            : c.settings?.options;
        return {
          ...c,
          type,
          settings: {
            ...c.settings,
            ...(options !== c.settings?.options ? { options } : {}),
          },
        };
      }),
    );
  }, []);

  const handleColumnDuplicate = useCallback((columnId: string, withValues: boolean) => {
    const newId = `col-${Date.now()}`;
    setColumns((prev) => {
      const idx = prev.findIndex((c) => c.id === columnId);
      if (idx === -1) return prev;
      const source = prev[idx];
      const newColumn: ColumnDefinition = {
        ...source,
        id: newId,
        key: `column-${prev.length + 1}`,
        label: `${source.label} (copy)`,
        order: source.order + 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const next = [...prev];
      next.splice(idx + 1, 0, newColumn);
      return next;
    });
    if (withValues) {
      setCellValues((prev) => {
        const next = new Map(prev);
        for (const [key, value] of prev.entries()) {
          if (key.endsWith(`:${columnId}`)) {
            const recordId = key.slice(0, key.length - columnId.length - 1);
            next.set(`${recordId}:${newId}`, value);
          }
        }
        return next;
      });
    }
  }, []);

  const handleColumnDuplicateOnly = useCallback(
    (columnId: string) => handleColumnDuplicate(columnId, false),
    [handleColumnDuplicate],
  );

  const handleColumnDuplicateWithValues = useCallback(
    (columnId: string) => handleColumnDuplicate(columnId, true),
    [handleColumnDuplicate],
  );

  const handleColumnUpdateDescription = useCallback(
    (columnId: string, description: string) => {
      setColumns((prev) =>
        prev.map((c) => (c.id === columnId ? { ...c, description } : c)),
      );
    },
    [],
  );

  const handleColumnUpdateSettings = useCallback(
    (columnId: string, patch: Partial<ColumnDefinition>) => {
      setColumns((prev) =>
        prev.map((c) =>
          c.id === columnId
            ? {
                ...c,
                ...patch,
                settings: { ...c.settings, ...(patch.settings ?? {}) },
                updatedAt: new Date().toISOString(),
              }
            : c,
        ),
      );
    },
    [],
  );

  const creatingRef = useRef(false);

  const handleNewItem = useCallback(
    async (groupId?: string | null) => {
      if (creatingRef.current) return;
      creatingRef.current = true;

      const tempId = `record-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const targetGroupId = groupId ?? null;
      const newRecord = {
        id: tempId,
        organizationId: data.board.organizationId,
        workspaceId: data.board.workspaceId,
        boardId: data.board.id,
        groupId: targetGroupId,
        title: `New ${data.board.name === "Production" ? "batch" : data.board.name === "Video" ? "cut" : data.board.name === "CGI" ? "shot" : data.board.name === "Retouching" ? "item" : "item"}`,
        status: "active" as const,
        version: 1,
        archivedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      setRecords((prev) => {
        const next = [...prev];
        let insertAt = next.length;
        for (let i = next.length - 1; i >= 0; i--) {
          if ((next[i].groupId ?? null) === targetGroupId) {
            insertAt = i + 1;
            break;
          }
        }
        next.splice(insertAt, 0, newRecord);
        return next;
      });

      try {
        const fd = new FormData();
        fd.set("organizationId", data.board.organizationId);
        fd.set("workspaceId", data.board.workspaceId);
        fd.set("boardId", data.board.id);
        fd.set("groupId", targetGroupId ?? "");
        fd.set("title", newRecord.title);
        const response = await createRecord(fd);
        if (response.error || !response.data) {
          setRecords((prev) => prev.filter((r) => r.id !== tempId));
          toast.error(response.error || "Failed to create item.");
          return;
        }

        setRecords((prev) => prev.map((r) => (r.id === tempId ? response.data! : r)));
        toast.success("Item created.");
      } catch {
        setRecords((prev) => prev.filter((r) => r.id !== tempId));
        toast.error("Failed to create item.");
      } finally {
        creatingRef.current = false;
      }
    },
    [data.board, toast],
  );

  const handleCellChange = useCallback(
    async (args: { recordId: string; columnId: string; value: ColumnValue }) => {
      const key = `${args.recordId}:${args.columnId}`;
      const prevValue = cellValues.get(key) ?? null;
      const prevRecord = records.find((r) => r.id === args.recordId);
      setCellValues((prev) => {
        const next = new Map(prev);
        next.set(key, args.value);
        return next;
      });
      setRecords((prev) =>
        prev.map((r) =>
          r.id === args.recordId ? { ...r, updatedAt: new Date().toISOString() } : r,
        ),
      );
      try {
        const response = await updateCell(
          data.board.organizationId,
          data.board.workspaceId,
          data.board.id,
          args.recordId,
          args.columnId,
          args.value,
        );
        if (response.error) {
          setCellValues((prev) => {
            const next = new Map(prev);
            if (prevValue === null) {
              next.delete(key);
            } else {
              next.set(key, prevValue);
            }
            return next;
          });
          setRecords((prev) =>
            prev.map((r) =>
              r.id === args.recordId && prevRecord
                ? { ...r, updatedAt: prevRecord.updatedAt }
                : r,
            ),
          );
          toast.error(response.error);
          return;
        }
      } catch {
        setCellValues((prev) => {
          const next = new Map(prev);
          if (prevValue === null) {
            next.delete(key);
          } else {
            next.set(key, prevValue);
          }
          return next;
        });
        setRecords((prev) =>
          prev.map((r) =>
            r.id === args.recordId && prevRecord
              ? { ...r, updatedAt: prevRecord.updatedAt }
              : r,
          ),
        );
        toast.error("Failed to save cell value.");
      }

      // ── Two-way sync (Part 5) ──────────────────────────
      const column = columns.find((c) => c.id === args.columnId);
      if (column?.type === "connected_board") {
        const settings = column.settings as unknown as ConnectedBoardColumnSettings;
        if (settings?.two_way_sync) {
          const prevItems = extractLinkedItems(prevValue);
          const nextItems = extractLinkedItems(args.value);
          const added = nextItems.filter(
            (n) =>
              !prevItems.some(
                (p) => p.board_id === n.board_id && p.item_id === n.item_id,
              ),
          );
          const removed = prevItems.filter(
            (p) =>
              !nextItems.some(
                (n) => n.board_id === p.board_id && n.item_id === n.item_id,
              ),
          );
          if (added.length > 0 || removed.length > 0) {
            const result = applyConnectBoardTwoWaySync({
              sourceBoardId: data.board.id,
              sourceColumnId: column.id,
              sourceRecordId: args.recordId,
              added,
              removed,
              sourceAllowMultiple: settings.allow_multiple_items,
            });
            if (result.sourceColumnSettingsPatch) {
              const patch = result.sourceColumnSettingsPatch;
              setColumns((prev) =>
                prev.map((c) =>
                  c.id === column.id
                    ? { ...c, settings: { ...c.settings, ...patch } }
                    : c,
                ),
              );
            }
          }
        }

        // ── Prompted Mirror creation ──────────────────────────
        // Immediately after a user links an item via a Connect Boards cell,
        // offer to create a Mirror column that rides on this column.
        if (column?.type === "connected_board") {
          const prevItems = extractLinkedItems(prevValue);
          const nextItems = extractLinkedItems(args.value);
          const added = nextItems.filter(
            (n) =>
              !prevItems.some(
                (p) => p.board_id === n.board_id && p.item_id === n.item_id,
              ),
          );
          if (added.length > 0) {
            const sourceColumn = column;
            toast("Create a mirror column?", {
              description: "Mirror a column from the linked record into this board.",
              duration: Infinity,
              action: {
                label: "Set up",
                onClick: () => {
                  setMirrorSourceColumnId(sourceColumn.id);
                  setMirrorAfterColumnId(null);
                  setMirrorModalOpen(true);
                },
              },
              cancel: "Dismiss",
            });
          }
        }
      }
    },
    [data.board, cellValues, columns, records],
  );

  const handleRecordTitleChange = useCallback(
    async (recordId: string, newTitle: string) => {
      const prev = records.find((r) => r.id === recordId);
      setRecords((p) =>
        p.map((r) =>
          r.id === recordId
            ? { ...r, title: newTitle, updatedAt: new Date().toISOString() }
            : r,
        ),
      );
      try {
        const fd = new FormData();
        fd.set("recordId", recordId);
        fd.set("title", newTitle);
        const response = await editRecord(fd);
        if (response.error) {
          if (prev) setRecords((p) => p.map((r) => (r.id === recordId ? prev : r)));
          toast.error(response.error);
        }
      } catch {
        if (prev) setRecords((p) => p.map((r) => (r.id === recordId ? prev : r)));
      }
    },
    [records],
  );

  const handleColumnReorder = useCallback(
    async (activeId: string, overId: string, _columns: ColumnDefinition[]) => {
      const activeIdx = columns.findIndex((c) => c.id === activeId);
      const overIdx = columns.findIndex((c) => c.id === overId);
      if (activeIdx === -1 || overIdx === -1) return;

      const reordered = [...columns];
      const [moved] = reordered.splice(activeIdx, 1);
      reordered.splice(overIdx, 0, moved);

      setColumns(reordered);

      try {
        await reorderColumns(
          data.board.id,
          reordered.map((c, idx) => ({ id: c.id, order: idx })),
        );
      } catch {
        setColumns(columns);
      }
    },
    [columns, data.board.id],
  );

  const {
    groups,
    loading: groupsLoading,
    createGroup: createGroupAction,
    renameGroup: renameGroupAction,
    reorderGroups: reorderGroupsAction,
    moveGroup: moveGroupAction,
    duplicateGroup: duplicateGroupAction,
    collapseGroup: collapseGroupAction,
    deleteGroup: deleteGroupAction,
    updateGroupColor: updateGroupColorAction,
    updateGroupStatusOptions: updateGroupStatusOptionsAction,
  } = useGroup(
    effectiveGroups.map((g) => ({
      ...g,
      boardId: data.board.id,
      organizationId: data.board.organizationId,
      workspaceId: data.board.workspaceId,
      parentGroupId: g.parentGroupId ?? null,
      permissions: {},
    })),
  );

  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});

  // ── Import / Export state ─────────────────────────────
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);

  // Records currently visible on the board (after sort/filter).
  // Used for the "Export to Excel" feature — it only exports what the
  // user can see on the board.
  const visibleRecords = records;

  const exportView = views.find((v) => v.id === activeViewId) ?? views[0];
  const exportColumnOrder =
    exportView?.visibleColumnIds.length > 0
      ? exportView.visibleColumnIds
      : columns.map((c) => c.id);

  const { exportToExcel } = useExportToExcel({
    board: data.board,
    columns,
    columnOrder: exportColumnOrder,
    primaryColumnLabel: data.board.primaryColumnLabel ?? "Name",
    groups,
    visibleCellValues: cellValues,
    visibleRecordIds: visibleRecords.map((r) => r.id),
    records: visibleRecords.map((r) => ({
      id: r.id,
      title: r.title,
      groupId: r.groupId ?? null,
    })),
  });

  useEffect(() => {
    const handleOpenImport = () => setImportOpen(true);
    const handleExport = () => exportToExcel();

    window.addEventListener("board:open-import", handleOpenImport);
    window.addEventListener("board:export-excel", handleExport);

    return () => {
      window.removeEventListener("board:open-import", handleOpenImport);
      window.removeEventListener("board:export-excel", handleExport);
    };
  }, [exportToExcel]);

  const handleImportConfirm = useCallback(
    async (args: {
      newColumns: ColumnDefinition[];
      updatedColumns: ColumnDefinition[];
      records: Array<{ title: string; cellValues: Record<string, ColumnValue> }>;
      skippedRows: Array<{
        rowIndex: number;
        reason: string;
        rawRow: Record<string, ColumnValue>;
      }>;
      columnsToDelete: string[];
      targetGroupId: string | null;
    }): Promise<{
      createdCount: number;
      importErrors: Array<{ rowIndex: number; reason: string }>;
    }> => {
      setImporting(true);
      const importErrors: Array<{ rowIndex: number; reason: string }> = [];
      const createdRecords: BoardRecord[] = [];
      const newCellValues: Array<[string, ColumnValue]> = [];
      const deletedColumnIds = new Set(args.columnsToDelete);

      console.warn("[IMPORT] stage=persist-start", {
        newColumns: args.newColumns.map((column) => ({
          id: column.id,
          label: column.label,
          type: column.type,
        })),
        updatedColumns: args.updatedColumns
          .filter(isOptionColumn)
          .map((column) => ({
            id: column.id,
            label: column.label,
            options: normalizeOptions(column.settings?.options),
          })),
        recordCount: args.records.length,
      });

      try {
        const updatedColumnsById = new Map(
          args.updatedColumns.map((column) => [column.id, column]),
        );
        const columnIdRemap = new Map<string, string>();
        const persistedNewColumns: ColumnDefinition[] = [];

        if (args.newColumns.length > 0) {
          for (const nc of args.newColumns) {
            const columnToPersist = updatedColumnsById.get(nc.id) ?? nc;
            const fd = new FormData();
            fd.set("organizationId", data.board.organizationId);
            fd.set("workspaceId", data.board.workspaceId);
            fd.set("boardId", data.board.id);
            fd.set("key", columnToPersist.key);
            fd.set("label", columnToPersist.label);
            fd.set("type", columnToPersist.type);
            fd.set("required", String(columnToPersist.required ?? false));
            if (
              columnToPersist.defaultValue !== undefined &&
              columnToPersist.defaultValue !== null
            ) {
              fd.set("defaultValue", JSON.stringify(columnToPersist.defaultValue));
            }
            fd.set("settings", JSON.stringify(columnToPersist.settings ?? {}));
            const response = await addColumn(fd);
            if (response.error || !response.data) {
              const reason = response.error ?? "Unknown error";
              console.error("[IMPORT] failed to persist column", {
                sourceColumnId: nc.id,
                label: nc.label,
                reason,
              });
              throw new Error(`Failed to persist imported column "${nc.label}": ${reason}`);
            }
            const persisted = { ...columnToPersist, ...response.data };
            columnIdRemap.set(nc.id, persisted.id);
            persistedNewColumns.push(persisted);
          }
        }

        console.warn("[IMPORT] stage=columns-persisted", {
          columnIdRemap: Object.fromEntries(columnIdRemap),
          persistedNewColumns: persistedNewColumns.map((column) => ({
            id: column.id,
            label: column.label,
            type: column.type,
            options: normalizeOptions(column.settings?.options),
          })),
        });

        const persistedUpdatedColumns: ColumnDefinition[] = [];
        for (const updated of args.updatedColumns) {
          if (!isOptionColumn(updated) || columnIdRemap.has(updated.id)) continue;
          const options = normalizeOptions(updated.settings?.options);
          if (options.length === 0) continue;
          const response = await updateColumnOptions(updated.id, options);
          if (response.error || !response.data) {
            const reason = response.error ?? "Unknown error";
            console.error("[IMPORT] failed to persist column options", {
              columnId: updated.id,
              label: updated.label,
              reason,
            });
            throw new Error(
              `Failed to persist imported options for "${updated.label}": ${reason}`,
            );
          }
          persistedUpdatedColumns.push({ ...updated, ...response.data });
        }

        console.warn("[IMPORT] stage=options-persisted", {
          columns: persistedUpdatedColumns.map((column) => ({
            id: column.id,
            label: column.label,
            options: normalizeOptions(column.settings?.options),
          })),
        });

        // Delete unmapped existing columns (excluding protected ones like
        // Status / Assigned To). This runs before record creation so any
        // cell references to deleted columns are already excluded from the
        // records built by the wizard.
        for (const columnId of args.columnsToDelete) {
          try {
            const response = await deleteColumn(columnId);
            if (response.error) {
              console.error("[IMPORT] failed to delete column", {
                columnId,
                error: response.error,
              });
            }
          } catch (err) {
            console.error("[IMPORT] failed to delete column", {
              columnId,
              error: err,
            });
          }
        }

        const effectiveColumnsById = new Map<string, ColumnDefinition>();
        for (const column of columns) {
          if (deletedColumnIds.has(column.id)) continue;
          effectiveColumnsById.set(column.id, column);
        }
        for (const column of persistedUpdatedColumns) {
          effectiveColumnsById.set(column.id, column);
        }
        for (const column of persistedNewColumns) {
          effectiveColumnsById.set(column.id, column);
        }

        const resolveOptionId = (
          columnId: string,
          value: ColumnValue,
        ): ColumnValue => {
          const column = effectiveColumnsById.get(columnId);
          return column ? resolveOptionIdForColumn(column, value) : value;
        };

        console.warn("[IMPORT] stage=option-values-resolved", {
          columnCount: effectiveColumnsById.size,
          columnIdRemap: Object.fromEntries(columnIdRemap),
        });

        // Verify all cell value column IDs can be resolved.
        const allCellColumnIds = new Set<string>();
        for (const rec of args.records) {
          for (const columnId of Object.keys(rec.cellValues)) {
            allCellColumnIds.add(columnId);
          }
        }
        const unmappedIds: string[] = [];
        for (const id of allCellColumnIds) {
          if (columnIdRemap.has(id)) continue;
          if (effectiveColumnsById.has(id)) continue;
          unmappedIds.push(id);
        }
        if (unmappedIds.length > 0) {
          console.error("[IMPORT] unmapped cell value column IDs", unmappedIds);
        } else {
          console.info("[IMPORT] all cell value column IDs resolved", {
            totalIds: allCellColumnIds.size,
            remapped: columnIdRemap.size,
            existing: allCellColumnIds.size - columnIdRemap.size,
          });
        }

        // Bulk-create all records and their cell values in batched
        // multi-row inserts (single round-trip per batch of 500) instead
        // of one server-action call per row.
        const BATCH_SIZE = 500;
        console.warn(
          "[IMPORT] stage=records-start",
          { recordCount: args.records.length, batchSize: BATCH_SIZE },
        );

        for (let i = 0; i < args.records.length; i += BATCH_SIZE) {
          const batch = args.records.slice(i, i + BATCH_SIZE);

          // Remap wizard-generated column IDs to persisted DB IDs and
          // resolve option IDs for this slice of records.
          const remappedBatch = batch.map((rec) => {
            const remappedCellValues: Record<string, ColumnValue> = {};
            for (const [columnId, value] of Object.entries(rec.cellValues)) {
              const targetColumnId = columnIdRemap.get(columnId) ?? columnId;
              remappedCellValues[targetColumnId] = resolveOptionId(targetColumnId, value);
            }
            return { title: rec.title, cellValues: remappedCellValues };
          });

          const response = await bulkCreateRecords({
            organizationId: data.board.organizationId,
            workspaceId: data.board.workspaceId,
            boardId: data.board.id,
            groupId: args.targetGroupId,
            records: remappedBatch,
          });

          if (response.error || !response.data) {
            for (let j = 0; j < batch.length; j++) {
              importErrors.push({
                rowIndex: i + j,
                reason: response.error || "Failed to create item.",
              });
            }
          } else {
            for (let k = 0; k < response.data.createdRecords.length; k++) {
              createdRecords.push(response.data.createdRecords[k]);
              const remapped = remappedBatch[k];
              if (remapped) {
                for (const [columnId, value] of Object.entries(remapped.cellValues)) {
                  newCellValues.push([`${response.data.createdRecords[k].id}:${columnId}`, value]);
                }
              }
            }
            for (const err of response.data.importErrors) {
              importErrors.push(err);
            }
          }

        }

        console.warn("[IMPORT] stage=records-done", {
          createdCount: createdRecords.length,
          errorCount: importErrors.length,
          errors: importErrors,
        });

        if (createdRecords.length > 0) {
          setRecords((prev) => {
            const isOnlyPlaceholder =
              prev.length === 1 &&
              prev[0].title === "New Item" &&
              prev[0].status === "active";
            return isOnlyPlaceholder ? createdRecords : [...prev, ...createdRecords];
          });
          setCellValues((prev) => {
            const next = new Map(prev);
            for (const [key, value] of newCellValues) {
              next.set(key, value);
            }
            return next;
          });
        }

        // Update local column state: remove deleted columns and append
        // newly-created ones so the board reflects the post-import layout.
        if (args.columnsToDelete.length > 0 || persistedNewColumns.length > 0) {
          setColumns((prev) => {
            const next = prev.filter((c) => !deletedColumnIds.has(c.id));
            for (const nc of persistedNewColumns) {
              if (!next.some((c) => c.id === nc.id)) {
                next.push(nc);
              }
            }
            return next;
          });
        }
        const skippedCount = importErrors.length;
        toast.success(
          `Imported ${createdRecords.length.toLocaleString()} item${createdRecords.length === 1 ? "" : "s"}${skippedCount > 0 ? `, ${skippedCount.toLocaleString()} row${skippedCount === 1 ? "" : "s"} failed` : ""}.`,
        );
        return { createdCount: createdRecords.length, importErrors };
      } finally {
        setImporting(false);
      }
    },
    [columns, data.board],
  );

  // ── View management ──────────────────────────────────

  const getSettings = useCallback(
    (viewId: string): ViewSettingsByType => {
      const view = views.find((v) => v.id === viewId);
      const viewType = view?.type ?? "table";
      return {
        ...getDefaultSettings(viewType),
        ...view?.settings,
        ...viewSettings[viewId],
      } as ViewSettingsByType;
    },
    [viewSettings, views],
  );

  const handleViewSettingsChange = useCallback(
    (viewId: string, newSettings: Partial<ViewSettingsByType>) => {
      const updated = { ...getSettings(viewId), ...newSettings } as ViewSettingsByType;
      setViewSettings((prev) => ({ ...prev, [viewId]: updated }));
      setViews((prev) =>
        prev.map((v) =>
          v.id === viewId
            ? { ...v, settings: updated as unknown as BoardView["settings"] }
            : v,
        ),
      );
      void updateViewSettings(
        viewId,
        updated as unknown as Record<string, unknown>,
      ).catch((err) => {
        console.error("Failed to persist view settings:", err);
      });
    },
    [getSettings],
  );

  const handleViewChange = useCallback((viewId: string) => {
    setActiveViewId(viewId);
  }, []);

  const handleCreateView = useCallback(
    (input: { type: string; name?: string; settings?: Record<string, unknown> }) => {
      const catalogEntry = viewCatalog.find((v) => v.id === input.type);
      const newView: BoardView = {
        id: `view-${data.board.id}-${input.type}-${Date.now()}`,
        boardId: data.board.id,
        organizationId: data.board.organizationId,
        workspaceId: data.board.workspaceId,
        name: input.name ?? catalogEntry?.label ?? input.type,
        type: input.type as BoardView["type"],
        visibility: "shared",
        filters: [],
        sorting: [],
        grouping: [],
        visibleColumnIds: [],
        columnWidths: {},
        rowHeight: 44,
        settings: {
          ...getDefaultSettings(input.type),
          ...(input.settings ?? {}),
        } as BoardView["settings"],
        sharedWith: ["owner", "editor", "viewer"],
        isDefault: views.length === 0,
        order: views.length,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setViews((prev) => [...prev, newView]);
      setActiveViewId(newView.id);

      ensureBoardViews([newView]).catch((err) => {
        console.error("Failed to persist new view:", err);
        toast.error("Failed to save new view.");
      });
    },
    [
      data.board.id,
      data.board.organizationId,
      data.board.workspaceId,
      views.length,
      toast,
    ],
  );

  const handleRenameView = useCallback(
    async (viewId: string, name: string) => {
      const prev = views.find((v) => v.id === viewId);
      const sourceView = views.find((v) => v.id === viewId);

      setViews((p) => p.map((v) => (v.id === viewId ? { ...v, name } : v)));
      try {
        const response = await renameView(viewId, name);
        if (response.error) {
          if (prev) setViews((p) => p.map((v) => (v.id === viewId ? prev : v)));

          if (response.error === "views not found" && sourceView) {
            const syncResult = await ensureBoardViews([sourceView]);
            if (!syncResult.error) {
              const retryResponse = await renameView(viewId, name);
              if (retryResponse.error) {
                toast.error(retryResponse.error);
              } else {
                toast.success("View renamed.");
              }
              return;
            }
            toast.error(syncResult.error);
            return;
          }

          toast.error(response.error);
        } else {
          toast.success("View renamed.");
        }
      } catch {
        if (prev) setViews((p) => p.map((v) => (v.id === viewId ? prev : v)));
        toast.error("Failed to rename view.");
      }
    },
    [views],
  );

  const handleDuplicateView = useCallback(
    async (viewId: string) => {
      const source = views.find((v) => v.id === viewId);
      if (!source) return;

      const newView: BoardView = {
        ...source,
        id: `view-${data.board.id}-${source.type}-${Date.now()}`,
        name: `${source.type.charAt(0).toUpperCase() + source.type.slice(1)} copy`,
        isDefault: false,
        order: views.length,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const sourceSettings = viewSettings[viewId];

      setViews((prev) => [...prev, newView]);
      if (sourceSettings) {
        setViewSettings((prev) => ({ ...prev, [newView.id]: sourceSettings }));
      }
      setActiveViewId(newView.id);

      try {
        const response = await duplicateView(viewId);
        if (response.error) {
          setViews((prev) => prev.filter((v) => v.id !== newView.id));
          if (sourceSettings) {
            setViewSettings((prev) => {
              const next = { ...prev };
              delete next[newView.id];
              return next;
            });
          }
          setActiveViewId(viewId);
          toast.error(response.error);
        } else if (response.data) {
          setViews((prev) => prev.map((v) => (v.id === newView.id ? response.data! : v)));
          setViewSettings((prev) => {
            const next = { ...prev };
            if (sourceSettings) {
              next[response.data!.id] = sourceSettings;
            }
            delete next[newView.id];
            return next;
          });
          setActiveViewId(response.data.id);
          toast.success("View duplicated.");
        }
      } catch {
        setViews((prev) => prev.filter((v) => v.id !== newView.id));
        if (sourceSettings) {
          setViewSettings((prev) => {
            const next = { ...prev };
            delete next[newView.id];
            return next;
          });
        }
        setActiveViewId(viewId);
        toast.error("Failed to duplicate view.");
      }
    },
    [views, data.board.id, viewSettings],
  );

  const handleDeleteView = useCallback(
    async (viewId: string) => {
      if (views.length <= 1) {
        toast.error(
          "Cannot delete the last view on a board. A board must have at least one view.",
        );
        return;
      }

      const prevViews = views;
      const prevSettings = viewSettings[viewId];
      const deletedView = views.find((v) => v.id === viewId);
      const remainingViews = views.filter((v) => v.id !== viewId);

      setViews(remainingViews);
      setViewSettings((prev) => {
        const next = { ...prev };
        delete next[viewId];
        return next;
      });
      if (activeViewId === viewId) {
        setActiveViewId(remainingViews[0]?.id ?? "");
      }

      try {
        const response = await deleteView(viewId);
        if (response.error) {
          setViews(prevViews);
          if (prevSettings) {
            setViewSettings((prev) => ({ ...prev, [viewId]: prevSettings }));
          }
          if (deletedView && activeViewId === viewId) {
            setActiveViewId(deletedView.id);
          }

          if (
            (response.error === "views not found" ||
              response.error === "View not found") &&
            deletedView
          ) {
            const syncResult = await ensureBoardViews([deletedView]);
            if (!syncResult.error) {
              const retryResponse = await deleteView(viewId);
              if (retryResponse.error) {
                toast.error(retryResponse.error);
              } else {
                toast.success("View deleted.");
              }
              return;
            }
          }

          toast.error(response.error);
        } else {
          toast.success("View deleted.");
        }
      } catch {
        setViews(prevViews);
        if (prevSettings) {
          setViewSettings((prev) => ({ ...prev, [viewId]: prevSettings }));
        }
        if (deletedView && activeViewId === viewId) {
          setActiveViewId(deletedView.id);
        }
        toast.error("Failed to delete view.");
      }
    },
    [views, activeViewId, viewSettings],
  );

  const handleColumnResize = useCallback((columnId: string, newWidth: number) => {
    setColumnWidths((prev) => ({ ...prev, [columnId]: newWidth }));
  }, []);

  const handleMoveToGroup = useCallback(
    async (recordIds: string[], targetGroupId: string) => {
      setRecords((prev) =>
        prev.map((r) =>
          recordIds.includes(r.id) ? { ...r, groupId: targetGroupId } : r,
        ),
      );
      for (const recordId of recordIds) {
        await moveRecord(recordId, targetGroupId);
      }
      toast.success(
        `${recordIds.length} record${recordIds.length !== 1 ? "s" : ""} moved.`,
      );
    },
    [],
  );

  const handleMoveToStatus = useCallback(
    async (recordIds: string[], statusName: string) => {
      let targetGroupId = groups.find((g) => g.name === statusName)?.id ?? null;

      if (!targetGroupId) {
        const newGroupId = await createGroupAction({
          boardId: data.board.id,
          organizationId: data.board.organizationId,
          workspaceId: data.board.workspaceId,
          name: statusName,
        });
        if (!newGroupId) {
          toast.error(`Failed to create "${statusName}" group.`);
          return;
        }
        targetGroupId = newGroupId;
      }

      setRecords((prev) =>
        prev.map((r) =>
          recordIds.includes(r.id) ? { ...r, groupId: targetGroupId } : r,
        ),
      );
      for (const recordId of recordIds) {
        await moveRecord(recordId, targetGroupId);
      }
      toast.success(
        `${recordIds.length} record${recordIds.length !== 1 ? "s" : ""} moved to ${statusName}.`,
      );
    },
    [
      groups,
      createGroupAction,
      data.board.id,
      data.board.organizationId,
      data.board.workspaceId,
    ],
  );

  const handleMoveGroupToBoard = useCallback(
    (groupId: string, _targetBoardId: string) => {
      deleteGroupAction(groupId);
      toast.success("Group moved to another board.");
    },
    [deleteGroupAction],
  );

  const handleMoveGroupToTop = useCallback(
    (groupId: string) => {
      const ordered = groups.map((g) => ({ ...g })).sort((a, b) => a.order - b.order);
      const idx = ordered.findIndex((g) => g.id === groupId);
      if (idx <= 0) return;
      const [moved] = ordered.splice(idx, 1);
      ordered.unshift(moved);
      reorderGroupsAction(
        data.board.id,
        ordered.map((g, i) => ({ id: g.id, order: i })),
      );
      toast.success("Group moved to top.");
    },
    [groups, reorderGroupsAction, data.board.id],
  );

  // ── Render the active view ──────────────────────────
  const activeView = views.find((v) => v.id === activeViewId) ?? views[0];

  console.warn(`[EngineBoardPage] Active view:`, activeView ? { id: activeView.id, type: activeView.type, name: activeView.name } : 'none');

  const renderActiveView = () => {
    if (!activeView) {
      console.warn(`[EngineBoardPage] No active view found, returning fallback`);
      return (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <div className="text-center">
            <p className="font-medium">No view available</p>
            <p className="mt-1 text-xs">This board has no views configured.</p>
          </div>
        </div>
      );
    }

    const viewProps = {
      board: data.board,
      view: activeView,
      columns,
      records,
      cellValues,
      groups,
      settings: getSettings(activeView.id),
      onCellChange: handleCellChange,
      onSettingsChange: (newSettings: Partial<ViewSettingsByType>) =>
        handleViewSettingsChange(activeView.id, newSettings),
      isActive: true,
    };

    switch (activeView.type) {
      case "calendar":
        return <CalendarView {...viewProps} />;
      case "kanban":
        return <KanbanView {...viewProps} />;
      case "table":
        return (
          <TableView
            board={data.board}
            columns={columns}
            records={records}
            cellValues={cellValues}
            groups={groups}
            columnWidths={columnWidths}
            onColumnResize={handleColumnResize}
            onCellChange={handleCellChange}
            onColumnAdd={handleColumnAdd}
            onColumnRename={handleColumnRename}
            onPrimaryColumnRename={handlePrimaryColumnRename}
            primaryColumnLabel={data.board.primaryColumnLabel ?? "Name"}
            onColumnDelete={handleColumnDelete}
            onColumnChangeType={handleColumnChangeType}
            onColumnReorder={handleColumnReorder}
            onColumnUpdateDescription={handleColumnUpdateDescription}
            onUpdateColumnSettings={handleColumnUpdateSettings}
            onColumnDuplicate={handleColumnDuplicateOnly}
            onColumnDuplicateWithValues={handleColumnDuplicateWithValues}
            onNewItem={handleNewItem}
            onRecordTitleChange={handleRecordTitleChange}
            onBulkDelete={(ids) =>
              setRecords((prev) => prev.filter((r) => !ids.includes(r.id)))
            }
            onRowDelete={(id) => setRecords((prev) => prev.filter((r) => r.id !== id))}
            onRowDuplicate={(id) => {
              const record = records.find((r) => r.id === id);
              if (record) {
                const newRecord = {
                  id: `record-${Date.now()}`,
                  organizationId: data.board.organizationId,
                  workspaceId: data.board.workspaceId,
                  boardId: data.board.id,
                  groupId: record.groupId,
                  title: `${record.title} (copy)`,
                  status: "active" as const,
                  version: records.length + 1,
                  archivedAt: null,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                };
                setRecords((prev) => [...prev, newRecord]);
              }
            }}
            onMoveToGroup={handleMoveToGroup}
            onMoveToStatus={handleMoveToStatus}
            onMoveGroupToBoard={handleMoveGroupToBoard}
            onMoveGroupToTop={handleMoveGroupToTop}
            onRenameGroup={renameGroupAction}
            onDeleteGroup={deleteGroupAction}
            onUpdateGroupColor={updateGroupColorAction}
            onUpdateGroupStatusOptions={updateGroupStatusOptionsAction}
            onAddGroup={(name) =>
              createGroupAction({
                boardId: data.board.id,
                organizationId: data.board.organizationId,
                workspaceId: data.board.workspaceId,
                name,
                statusOptions: [],
              })
            }
            onScrollBottom={loadMoreRecords}
            loadingMore={loadingMoreRecords}
            hasMore={hasMoreRecords}
            recordTotal={recordTotal}
          />
        );
      case "dashboard":
        return <DashboardView {...viewProps} />;
      // ── Planned but not yet built views ──
      default:
        return (
          <div className="border-border bg-card flex min-h-[400px] flex-col items-center justify-center rounded-xl border border-dashed p-12">
            <div className="text-center">
              <p className="text-foreground text-sm font-medium">
                {activeView.type.charAt(0).toUpperCase() + activeView.type.slice(1)} view
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                This view type is coming soon. Stay tuned!
              </p>
            </div>
          </div>
        );
    }
  };

  return (
    <RenderErrorBoundary>
      <MirrorDataProvider boardId={data.board.id} cellValues={cellValues}>
        <BoardLayout
          boardId={data.board.id}
          board={data.board}
          description={data.description}
          onNewItem={handleNewItem}
          onImport={() => setImportOpen(true)}
          onExport={exportToExcel}
          importing={importing}
          views={views}
          activeViewId={activeViewId}
          onViewChange={handleViewChange}
          onCreateView={handleCreateView}
          onRenameView={handleRenameView}
          onDuplicateView={handleDuplicateView}
          onDeleteView={handleDeleteView}
          columns={columns}
        >
          <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
            {renderActiveView()}
          </div>

          <MirrorSettingsModal
            open={mirrorModalOpen}
            onOpenChange={setMirrorModalOpen}
            boardId={data.board.id}
            columns={columns}
            sourceConnectColumnId={mirrorSourceColumnId}
            onConfirm={handleMirrorConfirm}
          />
        </BoardLayout>

        <ImportWizard
          open={importOpen}
          onOpenChange={setImportOpen}
          boardName={data.board.name}
          columns={columns}
          groups={groups}
          onConfirm={handleImportConfirm}
        />
      </MirrorDataProvider>
    </RenderErrorBoundary>
  );
}
