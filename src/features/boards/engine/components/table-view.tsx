"use client";

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Archive,
  Trash2,
  Plus,
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  Copy,
  ArrowUpDown,
  Download,
  Bot,
  LayoutGrid,
  RefreshCw,
  Pencil,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ColumnHeader } from "./column-header";
import { CellRenderer } from "./cell-renderer";
import { ColumnTypePicker } from "./column-type-picker";
import { ConnectBoardColumnModal } from "./connect-board-column-modal";
import { ConfirmDialog } from "./confirm-dialog";
import { useSelection } from "../hooks/use-selection";
import { toast } from "sonner";
import type {
  BoardDefinition,
  BoardRecord,
  ColumnDefinition,
  ColumnValue,
  Group,
} from "../types";
import type { ColumnTypeKey, ConnectedBoardColumnSettings } from "../types";
import {
  getColumnOptions,
  isOptionColumnType,
  resolveOptionDisplay,
} from "../lib/option-lookup";

const PRESET_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16",
  "#22c55e", "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9",
  "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7", "#d946ef",
  "#ec4899", "#f43f5e", "#78716c", "#71717a", "#64748b",
  "#94a3b8", "#b91c1c", "#c2410c", "#a16207", "#4d7c0f",
  "#15803d", "#0f766e", "#0e7490", "#1d4ed8", "#4338ca",
];

// ── Constants ──────────────────────────────────────────────

const DEFAULT_COLUMN_WIDTH = 180;
const ROW_CHECKBOX_WIDTH = 48;
const ROW_TITLE_MIN_WIDTH = 220;
const STATUS_OPTIONS = [
  { id: "status-todo", name: "To-Do", color: "#94a3b8" },
  { id: "status-inprogress", name: "In Progress", color: "#3b82f6" },
  { id: "status-review", name: "Review", color: "#f59e0b" },
  { id: "status-done", name: "Done", color: "#22c55e" },
] as const;

// ── Types ──────────────────────────────────────────────────

export interface TableViewProps {
  board: BoardDefinition;
  columns: ColumnDefinition[];
  records: BoardRecord[];
  cellValues: Map<string, ColumnValue>;
  onCellChange?: (args: {
    recordId: string;
    columnId: string;
    value: ColumnValue;
  }) => void;
  visibleRowRange?: { start: number; count: number };
  visibleColumnRange?: { start: number; count: number };
  emptyState?: ReactNode;
  /** Column operations */
  columnWidths?: Record<string, number>;
  onColumnResize?: (columnId: string, newWidth: number) => void;
  onColumnReorder?: (
    activeId: string,
    overId: string,
    columns: ColumnDefinition[],
  ) => void;
  onColumnRename?: (columnId: string, label: string) => void;
  onColumnDuplicate?: (columnId: string) => void;
  onColumnDuplicateWithValues?: (columnId: string) => void;
  onColumnToggleHidden?: (columnId: string) => void;
  onColumnToggleFrozen?: (columnId: string) => void;
  onColumnChangeType?: (columnId: string, type: ColumnTypeKey) => void;
  onColumnToggleWrapText?: (columnId: string) => void;
  onColumnDelete?: (columnId: string) => void;
  onColumnAdd?: (type: ColumnTypeKey, afterColumnId?: string, settings?: Record<string, unknown>) => void;
  onUpdateColumnSettings?: (columnId: string, patch: Partial<ColumnDefinition>) => void;
  onColumnUpdateDescription?: (columnId: string, description: string) => void;
  onColumnToggleRestrictEditing?: (columnId: string) => void;
  onColumnToggleRestrictView?: (columnId: string) => void;
  /** Primary (record-title) column label */
  primaryColumnLabel?: string;
  /** Rename the primary (record-title) column */
  onPrimaryColumnRename?: (label: string) => void;
  /** Sort */
  sortColumnId?: string;
  sortDirection?: "asc" | "desc";
  onSort?: (columnId: string, direction: "asc" | "desc") => void;
  /** Bulk record operations */
  onBulkArchive?: (recordIds: string[]) => void;
  onBulkDelete?: (recordIds: string[]) => void;
  /** Row-level operations */
  onRowDelete?: (recordId: string) => void;
  onRowDuplicate?: (recordId: string) => void;
  /** Selection group move */
  onMoveToGroup?: (recordIds: string[], targetGroupId: string) => void;
  onMoveToStatus?: (recordIds: string[], statusName: string) => void;
  /** Group header actions */
  onMoveGroupToBoard?: (groupId: string, targetBoardId: string) => void;
  onMoveGroupToTop?: (groupId: string) => void;
  onRenameGroup?: (groupId: string, name: string) => void;
  onDeleteGroup?: (groupId: string) => void;
  onUpdateGroupColor?: (groupId: string, color: string | null) => void;
  onUpdateGroupStatusOptions?: (groupId: string, statusOptions: Array<{ id: string; label: string; color?: string }>) => void;
  onAddGroup?: (name: string) => Promise<string | void> | string | void;
  /** New item callback */
  onNewItem?: (groupId?: string | null) => void;
  /** Record title change callback */
  onRecordTitleChange?: (recordId: string, title: string) => void;
  /** Groups for collapsible row grouping */
  groups?: Group[];
  /** Pagination / infinite scroll */
  onScrollBottom?: () => void;
  loadingMore?: boolean;
  hasMore?: boolean;
  recordTotal?: number;
}

// ── SortableColumnHeader wrapper ───────────────────────────

function SortableColumnHeaderWrapper({
  column,
  columns: _columns,
  frozen,
  hidden,
  width,
  onResize,
  onRename,
  onDuplicate,
  onDuplicateWithValues,
  onToggleHidden,
  onToggleFrozen,
  onChangeType,
  onDelete,
  onAddColumn,
  onUpdateColumnSettings,
  sortColumnId,
  sortDirection,
  onSort,
  onAddDescription,
  onToggleRestrictEditing,
  onToggleRestrictView,
  onSetFilter,
  onClearFilter,
  onToggleCollapse,
  onWrapText,
  columnDescription,
  restrictEditing,
  restrictView,
  isFiltered,
  isCollapsed,
  isWrapped,
}: {
  column: ColumnDefinition;
  columns: ColumnDefinition[];
  frozen: boolean;
  hidden: boolean;
  width: number;
  onResize?: (columnId: string, newWidth: number) => void;
  onRename?: (columnId: string, label: string) => void;
  onDuplicate?: (columnId: string) => void;
  onDuplicateWithValues?: (columnId: string) => void;
  onToggleHidden?: (columnId: string) => void;
  onToggleFrozen?: (columnId: string) => void;
  onChangeType?: (columnId: string, type: ColumnTypeKey) => void;
  onDelete?: (columnId: string) => void;
  onAddColumn?: (type: ColumnTypeKey, afterColumnId?: string, settings?: Record<string, unknown>) => void;
  onUpdateColumnSettings?: (columnId: string, patch: Partial<ColumnDefinition>) => void;
  sortColumnId?: string;
  sortDirection?: "asc" | "desc";
  onSort?: (columnId: string, direction: "asc" | "desc") => void;
  onAddDescription?: (columnId: string, description: string) => void;
  onToggleRestrictEditing?: (columnId: string) => void;
  onToggleRestrictView?: (columnId: string) => void;
  onSetFilter?: (columnId: string, operator: string, value: ColumnValue) => void;
  onClearFilter?: (columnId: string) => void;
  onToggleCollapse?: (columnId: string) => void;
  onWrapText?: (columnId: string) => void;
  columnDescription?: string;
  restrictEditing?: boolean;
  restrictView?: boolean;
  isFiltered?: boolean;
  isCollapsed?: boolean;
  isWrapped?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: column.id });

  const style = useMemo(
    () => ({
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
    }),
    [transform, transition, isDragging],
  );

  return (
    <div ref={setNodeRef} style={style}>
      <ColumnHeader
        column={column}
        frozen={frozen}
        hidden={hidden}
        width={width}
        onResize={onResize}
        onDragStart={() => {}}
        onRename={onRename}
        onDuplicate={onDuplicate}
        onDuplicateWithValues={onDuplicateWithValues}
        onToggleHidden={onToggleHidden}
        onToggleFrozen={onToggleFrozen}
        onChangeType={onChangeType}
        onDelete={onDelete}
        onAddColumn={onAddColumn}
        onUpdateColumnSettings={onUpdateColumnSettings}
        sortColumnId={sortColumnId}
        sortDirection={sortDirection}
        onSort={onSort}
        sortableListeners={listeners as unknown as Record<string, unknown>}
        sortableAttributes={attributes as unknown as Record<string, unknown>}
        onAddDescription={onAddDescription}
        onToggleRestrictEditing={onToggleRestrictEditing}
        onToggleRestrictView={onToggleRestrictView}
        onSetFilter={onSetFilter}
        onClearFilter={onClearFilter}
        onToggleCollapse={onToggleCollapse}
        onWrapText={onWrapText}
        columnDescription={columnDescription}
        restrictEditing={restrictEditing}
        restrictView={restrictView}
        isFiltered={isFiltered}
        isCollapsed={isCollapsed}
        isWrapped={isWrapped}
      />
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────

function getCellKey(recordId: string, columnId: string): string {
  return `${recordId}:${columnId}`;
}

function getColumnWidth(
  column: ColumnDefinition,
  columnWidths?: Record<string, number>,
): number {
  return columnWidths?.[column.id] ?? DEFAULT_COLUMN_WIDTH;
}

function matchesFilter(
  value: ColumnValue,
  operator: string,
  filterValue: ColumnValue,
  column?: ColumnDefinition,
): boolean {
  if (value === null || value === undefined) {
    return operator === "is_empty";
  }
  if (operator === "is_empty") return false;
  if (operator === "not_empty") return true;
  if (operator === "is_true") return value === true;
  if (operator === "is_false") return value !== true;

  // Option columns store the option id. Compare against BOTH the raw stored
  // value and the option's label so a filter set from the label (or a legacy
  // filter saved with the label) matches either representation.
  const candidates = [String(value)];
  if (column && isOptionColumnType(column.type)) {
    const label = resolveOptionDisplay(getColumnOptions(column), value).label;
    if (label) candidates.push(label);
  }

  const matches = (candidate: string): boolean => {
    const c = candidate.toLowerCase();
    const f = String(filterValue ?? "").toLowerCase();
    switch (operator) {
      case "contains":
        return c.includes(f);
      case "equals":
        return c === f;
      case "starts_with":
        return c.startsWith(f);
      case "ends_with":
        return c.endsWith(f);
      case "is_one_of":
        return Array.isArray(filterValue)
          ? (filterValue as string[]).some((v) => String(v ?? "").toLowerCase() === c)
          : false;
      default:
        return false;
    }
  };

  switch (operator) {
    case "contains":
    case "equals":
    case "starts_with":
    case "ends_with":
    case "is_one_of":
      return candidates.some(matches);
    case "gt":
      return Number(value) > Number(filterValue);
    case "lt":
      return Number(value) < Number(filterValue);
    case "gte":
      return Number(value) >= Number(filterValue);
    case "lte":
      return Number(value) <= Number(filterValue);
    case "before":
      return new Date(String(value)) < new Date(String(filterValue ?? ""));
    case "after":
      return new Date(String(value)) > new Date(String(filterValue ?? ""));
    case "on":
      return new Date(String(value)).toDateString() === new Date(String(filterValue ?? "")).toDateString();
    default:
      return true;
  }
}

// ── RowMenu ─────────────────────────────────────────────────

function RowMenu({
  recordId,
  _recordTitle,
  groups,
  currentGroupId,
  onMoveToGroup,
  onMoveToStatus,
  onDelete,
  onDuplicate,
}: {
  recordId: string;
  _recordTitle: string;
  groups?: Group[];
  currentGroupId?: string | null;
  onMoveToGroup?: (recordIds: string[], targetGroupId: string) => void;
  onMoveToStatus?: (recordIds: string[], statusName: string) => void;
  onDelete?: (recordId: string) => void;
  onDuplicate?: (recordId: string) => void;
}) {
  const existingGroupNames = useMemo(
    () => new Set((groups ?? []).filter((g) => g.id !== currentGroupId).map((g) => g.name)),
    [groups, currentGroupId],
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-accent hover:text-foreground"
          onClick={(e) => e.stopPropagation()}
          aria-label="Row menu"
        >
          <MoreHorizontal className="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem onSelect={() => onDuplicate?.(recordId)}>
          <Copy className="mr-2 size-3.5" />
          Duplicate
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <ArrowUpDown className="mr-2 size-3.5" />
            Move to
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {STATUS_OPTIONS.map((status) => (
              <DropdownMenuItem
                key={status.id}
                onSelect={() => onMoveToStatus?.([recordId], status.name)}
              >
                <span
                  className="mr-2 size-2.5 rounded-sm"
                  style={{ backgroundColor: status.color }}
                />
                {status.name}
              </DropdownMenuItem>
            ))}
            {(groups ?? []).filter((g) => g.id !== currentGroupId && !existingGroupNames.has(g.name)).length > 0 && (
              <>
                <DropdownMenuSeparator />
                {(groups ?? []).filter((g) => g.id !== currentGroupId && !existingGroupNames.has(g.name)).map((group) => (
                  <DropdownMenuItem
                    key={group.id}
                    onSelect={() => onMoveToGroup?.([recordId], group.id)}
                  >
                    {group.name}
                  </DropdownMenuItem>
                ))}
              </>
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onSelect={() => onDelete?.(recordId)}
        >
          <Trash2 className="mr-2 size-3.5" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── GroupHeaderMenu ──────────────────────────────────────────

function GroupHeaderMenu({
  group,
  _boardId,
  onMoveGroupToBoard,
  onMoveGroupToTop,
  onRenameGroup,
  onDeleteGroup,
  onUpdateGroupColor,
  onUpdateGroupStatusOptions,
}: {
  group: Group;
  _boardId: string;
  onMoveGroupToBoard?: (groupId: string, targetBoardId: string) => void;
  onMoveGroupToTop?: (groupId: string) => void;
  onRenameGroup?: (groupId: string, name: string) => void;
  onDeleteGroup?: (groupId: string) => void;
  onUpdateGroupColor?: (groupId: string, color: string | null) => void;
  onUpdateGroupStatusOptions?: (groupId: string, statusOptions: Array<{ id: string; label: string; color?: string }>) => void;
}) {
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [editingStatus, setEditingStatus] = useState(false);
  const [localStatusOptions, setLocalStatusOptions] = useState(group.statusOptions ?? []);

  const handleStatusStartEdit = () => {
    setLocalStatusOptions(group.statusOptions ?? []);
    setEditingStatus(true);
  };

  const handleStatusApply = () => {
    setEditingStatus(false);
    onUpdateGroupStatusOptions?.(group.id, localStatusOptions);
  };

  const handleStatusCancel = () => {
    setEditingStatus(false);
    setLocalStatusOptions(group.statusOptions ?? []);
  };

  const handleStatusAdd = () => {
    const newId = `opt-${Date.now()}`;
    setLocalStatusOptions((prev) => [...prev, { id: newId, label: "", color: PRESET_COLORS[0] }]);
  };

  const handleStatusDelete = (id: string) => {
    setLocalStatusOptions((prev) => prev.filter((opt) => opt.id !== id));
  };

  const handleStatusLabelChange = (id: string, label: string) => {
    setLocalStatusOptions((prev) => prev.map((opt) => (opt.id === id ? { ...opt, label } : opt)));
  };

  const handleStatusColorChange = (id: string, color: string) => {
    setLocalStatusOptions((prev) => prev.map((opt) => (opt.id === id ? { ...opt, color } : opt)));
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-accent hover:text-foreground"
          onClick={(e) => e.stopPropagation()}
          aria-label="Group menu"
        >
          <MoreHorizontal className="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {onRenameGroup && (
          <DropdownMenuItem onSelect={() => onRenameGroup(group.id, group.name)}>
            Rename
          </DropdownMenuItem>
        )}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <div className="mr-2 size-3.5 rounded-sm" style={{ backgroundColor: group.color ?? "#94a3b8" }} />
            Group color
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="p-2">
            <div className="grid grid-cols-7 gap-1">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => onUpdateGroupColor?.(group.id, color)}
                  className={cn(
                    "size-5 rounded-sm border border-border hover:scale-110 transition-transform",
                    group.color === color && "ring-1 ring-ring",
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => onUpdateGroupColor?.(group.id, null)}
              className="mt-1.5 w-full rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Reset color
            </button>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <ArrowUpDown className="mr-2 size-3.5" />
            Move group
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onSelect={() => onMoveGroupToBoard?.(group.id, group.boardId)}>
              Move to another board
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onMoveGroupToTop?.(group.id)}>
              Move to top
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={handleStatusStartEdit}>
          Edit status options
        </DropdownMenuItem>
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onSelect={() => onDeleteGroup?.(group.id)}
        >
          Delete group
        </DropdownMenuItem>
      </DropdownMenuContent>

      {/* Status options editor panel */}
      {editingStatus && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={handleStatusCancel}>
          <div className="w-80 rounded-lg border border-border bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="text-xs font-medium text-foreground">Status Options</span>
              <button type="button" onClick={handleStatusCancel} className="flex size-6 items-center justify-center rounded text-muted-foreground hover:text-foreground">
                <span className="text-xs">✕</span>
              </button>
            </div>
            <div className="max-h-64 overflow-y-auto p-2">
              <div className="space-y-1">
                {localStatusOptions.map((opt) => (
                  <div key={opt.id} className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const idx = PRESET_COLORS.indexOf(opt.color ?? "");
                        const next = PRESET_COLORS[(idx + 1) % PRESET_COLORS.length];
                        handleStatusColorChange(opt.id, next);
                      }}
                      className="flex size-6 shrink-0 items-center justify-center rounded border border-border hover:border-primary"
                    >
                      <span className="block size-3.5 rounded-sm" style={{ backgroundColor: opt.color ?? "#94a3b8" }} />
                    </button>
                    <input
                      value={opt.label}
                      onChange={(e) => handleStatusLabelChange(opt.id, e.target.value)}
                      className="h-7 flex-1 rounded-md border border-input px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
                      placeholder="Label"
                    />
                    <button
                      type="button"
                      onClick={() => handleStatusDelete(opt.id)}
                      className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-destructive"
                    >
                      <span className="text-xs">✕</span>
                    </button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={handleStatusAdd} className="mt-2 flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
                <Plus className="size-3.5" />
                Add status option
              </button>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border px-3 py-2">
              <button type="button" onClick={handleStatusCancel} className="rounded-md px-2 py-1 text-xs hover:bg-accent">Cancel</button>
              <button type="button" onClick={handleStatusApply} className="rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground">Apply</button>
            </div>
          </div>
        </div>
      )}
    </DropdownMenu>
  );
}

// ── TableView ──────────────────────────────────────────────

export function TableView({
  board,
  columns,
  records,
  cellValues,
  onCellChange,
  visibleRowRange,
  visibleColumnRange,
  emptyState,
  columnWidths,
  onColumnResize,
  onColumnReorder,
  onColumnRename,
  onColumnDuplicate,
  onColumnDuplicateWithValues,
  onColumnToggleHidden,
  onColumnToggleFrozen,
  onColumnChangeType,
  onColumnDelete,
  onColumnAdd,
  onUpdateColumnSettings,
  onColumnUpdateDescription,
  onColumnToggleRestrictEditing,
  onColumnToggleRestrictView,
  primaryColumnLabel,
  onPrimaryColumnRename,
  sortColumnId,
  sortDirection,
  onSort,
  onBulkArchive,
  onBulkDelete,
  groups,
  onNewItem,
  onRecordTitleChange,
  onRowDelete,
  onRowDuplicate,
  onMoveToGroup,
  onMoveToStatus,
  onMoveGroupToBoard,
  onMoveGroupToTop,
  onRenameGroup,
  onDeleteGroup,
  onUpdateGroupColor,
  onUpdateGroupStatusOptions,
  onAddGroup,
  onScrollBottom,
  loadingMore,
  hasMore,
  recordTotal,
}: TableViewProps) {
  console.log("[TableView] Rendering, board:", board?.id, "columns:", columns?.length, "records:", records?.length, "groups:", groups?.length);
  // ── Selection ──────────────────────────────────────────
  const recordIds = useMemo(() => records.map((r) => r.id), [records]);
  const selection = useSelection<string>();
  const [bulkAction, setBulkAction] = useState<"archive" | "delete" | null>(
    null,
  );

  // ── Column-level UI state ──────────────────────────────
  const [collapsedColumns, setCollapsedColumns] = useState<Set<string>>(new Set());
  const [activeFilters, setActiveFilters] = useState<Map<string, { operator: string; value: ColumnValue }>>(new Map());
  const [restrictEditingColumns, setRestrictEditingColumns] = useState<Set<string>>(new Set());
  const [restrictViewColumns, setRestrictViewColumns] = useState<Set<string>>(new Set());
  const [wrappedColumns, setWrappedColumns] = useState<Set<string>>(new Set());

  const handleToggleCollapse = useCallback((columnId: string) => {
    setCollapsedColumns((prev) => {
      const next = new Set(prev);
      if (next.has(columnId)) {
        next.delete(columnId);
      } else {
        next.add(columnId);
      }
      return next;
    });
  }, []);

  const handleSetFilter = useCallback((columnId: string, operator: string, value: ColumnValue) => {
    setActiveFilters((prev) => {
      const next = new Map(prev);
      next.set(columnId, { operator, value });
      return next;
    });
  }, []);

  const handleClearFilter = useCallback((columnId: string) => {
    setActiveFilters((prev) => {
      const next = new Map(prev);
      next.delete(columnId);
      return next;
    });
  }, []);

  const handleAddDescription = useCallback((columnId: string, description: string) => {
    onColumnUpdateDescription?.(columnId, description);
  }, [onColumnUpdateDescription]);

  const handleToggleRestrictEditing = useCallback((columnId: string) => {
    setRestrictEditingColumns((prev) => {
      const next = new Set(prev);
      if (next.has(columnId)) {
        next.delete(columnId);
      } else {
        next.add(columnId);
      }
      return next;
    });
    onColumnToggleRestrictEditing?.(columnId);
  }, [onColumnToggleRestrictEditing]);

  const handleToggleRestrictView = useCallback((columnId: string) => {
    setRestrictViewColumns((prev) => {
      const next = new Set(prev);
      if (next.has(columnId)) {
        next.delete(columnId);
      } else {
        next.add(columnId);
      }
      return next;
    });
    onColumnToggleRestrictView?.(columnId);
  }, [onColumnToggleRestrictView]);

  const handleToggleWrapText = useCallback((columnId: string) => {
    setWrappedColumns((prev) => {
      const next = new Set(prev);
      if (next.has(columnId)) {
        next.delete(columnId);
      } else {
        next.add(columnId);
      }
      return next;
    });
  }, []);

  // ── Groups ────────────────────────────────────────────
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState("");
  const editingGroupInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingGroupId && editingGroupInputRef.current) {
      editingGroupInputRef.current.focus();
      editingGroupInputRef.current.select();
    }
  }, [editingGroupId]);

  const toggleGroup = useCallback((groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, []);

  // ── Sort state ────────────────────────────────────────
  const [internalSort, setInternalSort] = useState<{ columnId: string; direction: "asc" | "desc" } | null>(null);
  const activeSortColumnId = sortColumnId ?? internalSort?.columnId;
  const activeSortDirection = sortDirection ?? internalSort?.direction ?? "asc";

  const handleSort = useCallback(
    (columnId: string, direction?: "asc" | "desc") => {
      const nextDirection =
        direction ??
        (activeSortColumnId === columnId && activeSortDirection === "asc"
          ? "desc"
          : "asc");
      if (onSort) {
        onSort(columnId, nextDirection);
      } else {
        setInternalSort({ columnId, direction: nextDirection });
      }
    },
    [activeSortColumnId, activeSortDirection, onSort],
  );

  // ── Sorted records ────────────────────────────────────
  const sortedRecords = useMemo(() => {
    if (!activeSortColumnId) return records;
    const col = columns.find((c) => c.id === activeSortColumnId);
    if (!col) return records;

    const sorted = [...records].sort((a, b) => {
      const aVal = cellValues.get(getCellKey(a.id, col.id)) ?? col.defaultValue;
      const bVal = cellValues.get(getCellKey(b.id, col.id)) ?? col.defaultValue;

      let cmp = 0;
      if (aVal === null || aVal === undefined) cmp = 1;
      else if (bVal === null || bVal === undefined) cmp = -1;
      else if (typeof aVal === "number" && typeof bVal === "number") {
        cmp = aVal - bVal;
      } else {
        cmp = String(aVal).localeCompare(String(bVal));
      }

      return activeSortDirection === "desc" ? -cmp : cmp;
    });
    return sorted;
  }, [records, columns, cellValues, activeSortColumnId, activeSortDirection]);

  // ── Filtered records ──────────────────────────────────
  const filteredRecords = useMemo(() => {
    if (activeFilters.size === 0) return sortedRecords;
    return sortedRecords.filter((record) => {
      for (const [columnId, filter] of activeFilters) {
        const col = columns.find((c) => c.id === columnId);
        if (!col) continue;
        const value = cellValues.get(getCellKey(record.id, col.id)) ?? col.defaultValue;
        if (!matchesFilter(value, filter.operator, filter.value, col)) return false;
      }
      return true;
    });
  }, [sortedRecords, columns, cellValues, activeFilters]);

  const handleSelectAll = useCallback(() => {
    if (selection.isAllSelected(recordIds)) {
      selection.deselectAll();
    } else {
      selection.selectAll(recordIds);
    }
  }, [selection, recordIds]);

  // ── Groups ────────────────────────────────────────────
  const groupedRecords = useMemo(() => {
    if (!groups || groups.length === 0) {
      return [{ groupId: null as string | null, group: null, records: filteredRecords }];
    }
    const groupMap = new Map<string | null, { groupId: string | null; group: Group | null; records: BoardRecord[] }>();
    for (const group of groups) {
      groupMap.set(group.id, { groupId: group.id, group, records: [] });
    }
    groupMap.set(null, { groupId: null, group: null, records: [] });
    for (const record of filteredRecords) {
      const entry = groupMap.get(record.groupId ?? null) ?? groupMap.get(null)!;
      entry.records.push(record);
    }
    const all = Array.from(groupMap.values());
    const defined = all.filter((entry) => entry.groupId !== null);
    const ungrouped = all.find((entry) => entry.groupId === null);
    return [...defined, ...(ungrouped && ungrouped.records.length > 0 ? [ungrouped] : [])];
  }, [groups, filteredRecords]);

  const visibleRecords = useMemo(() => {
    const start = visibleRowRange?.start ?? 0;
    const count = visibleRowRange?.count ?? filteredRecords.length;
    return filteredRecords.slice(start, start + count);
  }, [filteredRecords, visibleRowRange]);

  // ── Add column state ──────────────────────────────────
  const [addColumnAfterId, setAddColumnAfterId] = useState<string | null>(null);
  const [connectBoardAfterId, setConnectBoardAfterId] = useState<string | null>(null);

  const [recordColumnLabel, setRecordColumnLabel] = useState(primaryColumnLabel ?? "Name");
  const [recordTitleWidth, setRecordTitleWidth] = useState(ROW_TITLE_MIN_WIDTH);

  const [primaryColumnRenameOpen, setPrimaryColumnRenameOpen] = useState(false);
  const primaryColumnRenameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (primaryColumnLabel && primaryColumnLabel !== recordColumnLabel) {
      setRecordColumnLabel(primaryColumnLabel);
    }
  }, [primaryColumnLabel, recordColumnLabel]);

  useEffect(() => {
    if (primaryColumnRenameOpen && primaryColumnRenameInputRef.current) {
      primaryColumnRenameInputRef.current.focus();
      primaryColumnRenameInputRef.current.select();
    }
  }, [primaryColumnRenameOpen]);

  const handleRecordTitleResize = useCallback((newWidth: number) => {
    setRecordTitleWidth(newWidth);
  }, []);

  const handleAddColumn = useCallback(
    (type: ColumnTypeKey, afterColumnId?: string) => {
      if (type === "connected_board") {
        setConnectBoardAfterId(afterColumnId ?? null);
        setAddColumnAfterId(null);
        return;
      }
      onColumnAdd?.(type, afterColumnId);
      setAddColumnAfterId(null);
    },
    [onColumnAdd],
  );

  // ── Drag Sensors ───────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      onColumnReorder?.(
        String(active.id),
        String(over.id),
        columns,
      );
    },
    [columns, onColumnReorder],
  );

  // ── Visible rows / columns ─────────────────────────────
  const { frozenColumns, nonFrozenColumns } = useMemo(() => {
    const frozen: ColumnDefinition[] = [];
    const nonFrozen: ColumnDefinition[] = [];
    for (const col of columns) {
      if (col.frozen) {
        frozen.push(col);
      } else {
        nonFrozen.push(col);
      }
    }
    return { frozenColumns: frozen, nonFrozenColumns: nonFrozen };
  }, [columns]);

  const allVisibleColumns = useMemo(
    () => [...frozenColumns, ...nonFrozenColumns],
    [frozenColumns, nonFrozenColumns],
  );

  const visibleColumns = useMemo(() => {
    const start = visibleColumnRange?.start ?? 0;
    const count = visibleColumnRange?.count ?? allVisibleColumns.length;
    return allVisibleColumns.slice(start, start + count);
  }, [allVisibleColumns, visibleColumnRange]);

  const hasSelection = selection.count > 0;

  // ── Number column sums for footer ─────────────────────
  const numberColumnSums = useMemo(() => {
    const sums: Record<string, number> = {};
    for (const col of columns) {
      if (col.type === "number" || col.type === "currency") {
        let sum = 0;
        for (const record of records) {
          const val = cellValues.get(getCellKey(record.id, col.id)) ?? col.defaultValue;
          if (typeof val === "number") sum += val;
        }
        sums[col.id] = sum;
      }
    }
    return sums;
  }, [columns, records, cellValues]);

  // ── Keyboard navigation ────────────────────────────────
  const tableRef = useRef<HTMLDivElement>(null);
  const [focusedCell, setFocusedCell] = useState<{
    rowIdx: number;
    colIdx: number;
  } | null>(null);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }
      if (!focusedCell) return;
      const { rowIdx, colIdx } = focusedCell;
      const maxRow = visibleRecords.length - 1;
      const maxCol = visibleColumns.length + 1; // +1 for title column

      let newRow = rowIdx;
      let newCol = colIdx;

      switch (e.key) {
        case "ArrowUp":
          newRow = Math.max(0, rowIdx - 1);
          e.preventDefault();
          break;
        case "ArrowDown":
          newRow = Math.min(maxRow, rowIdx + 1);
          e.preventDefault();
          break;
        case "ArrowLeft":
          newCol = Math.max(0, colIdx - 1);
          e.preventDefault();
          break;
        case "ArrowRight":
          newCol = Math.min(maxCol, colIdx + 1);
          e.preventDefault();
          break;
        case "Home":
          if (e.ctrlKey || e.metaKey) {
            newRow = 0;
          }
          newCol = 0;
          e.preventDefault();
          break;
        case "End":
          if (e.ctrlKey || e.metaKey) {
            newRow = maxRow;
          }
          newCol = maxCol;
          e.preventDefault();
          break;
        case " ":
          // Space to toggle selection
          if (visibleRecords[rowIdx]) {
            selection.toggle(visibleRecords[rowIdx].id);
            e.preventDefault();
          }
          break;
        case "Enter":
          // Focus the cell input
          if (
            visibleRecords[rowIdx]
          ) {
            const cell = document.querySelector(
              `[data-cell-row="${rowIdx}"][data-cell-col="${colIdx}"] input, [data-cell-row="${rowIdx}"][data-cell-col="${colIdx}"] textarea`,
            );
            (cell as HTMLElement)?.focus();
          }
          e.preventDefault();
          break;
        case "Escape":
          setFocusedCell(null);
          tableRef.current?.focus();
          break;
      }

      if (newRow !== rowIdx || newCol !== colIdx) {
        setFocusedCell({ rowIdx: newRow, colIdx: newCol });
        // Scroll into view
        const cellEl = document.querySelector(
          `[data-cell-row="${newRow}"][data-cell-col="${newCol}"]`,
        );
        cellEl?.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
    },
    [focusedCell, visibleRecords, visibleColumns, selection],
  );

  // ── Grid template ──────────────────────────────────────
  const columnWidthsList = useMemo(() => {
    const widths = [`${ROW_CHECKBOX_WIDTH}px`, `${recordTitleWidth}px`];
    for (const col of visibleColumns) {
      if (collapsedColumns.has(col.id)) {
        widths.push("10px");
      } else {
        widths.push(`${getColumnWidth(col, columnWidths)}px`);
      }
    }
    return widths.join(" ");
  }, [visibleColumns, columnWidths, collapsedColumns, recordTitleWidth]);

  // ── Virtual scrolling state ─────────────────────────────
  // Record rows are py-3 (24px) around an h-8 control (32px) = 56px,
  // so the estimate must match or rows overlap while scrolling.
  const ROW_HEIGHT = 56;
  const GROUP_HEADER_HEIGHT = 44;
  const VIRTUAL_OVERSCAN = 8;

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const target = e.currentTarget;
      if (target.scrollHeight - target.scrollTop - target.clientHeight < 200) {
        onScrollBottom?.();
      }
    },
    [onScrollBottom],
  );

  // Flat list of every visual row (group headers + records + add-row),
  // honouring collapsed groups. Only the slice inside the viewport is rendered.
  const allRows = useMemo(() => {
    return groupedRecords.flatMap((entry) => {
      const isCollapsed = collapsedGroups.has(entry.groupId ?? "null");
      if (isCollapsed) return [];
      // Group header + records + add-row button
      const headerHeight = entry.group ? GROUP_HEADER_HEIGHT : 0;
      const addRowHeight = entry.records.length > 0 ? ROW_HEIGHT : 0;
      return [
        {
          type: "header" as const,
          height: headerHeight,
          groupId: entry.groupId,
        },
        ...entry.records.map((r) => ({
          type: "row" as const,
          height: ROW_HEIGHT,
          record: r,
          groupId: entry.groupId,
        })),
        {
          type: "addRow" as const,
          height: addRowHeight,
          groupId: entry.groupId,
        },
      ];
    });
  }, [groupedRecords, collapsedGroups]);

  // Virtualize against the real scroll container so the window/trackpad
  // scroll inside the table drives which rows exist in the DOM.
  const rowVirtualizer = useVirtualizer({
    count: allRows.length,
    getScrollElement: () => tableRef.current,
    estimateSize: (index) => allRows[index]?.height ?? ROW_HEIGHT,
    overscan: VIRTUAL_OVERSCAN,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalRowsHeight = rowVirtualizer.getTotalSize();

  // ── Always render the full table shell ─────────────────────────
  // Even a brand-new board with zero rows / zero groups must show the
  // toolbar, headers, group headers, and "+ Add new group" so the user is
  // never looking at a blank screen while data loads.
  const emptyStateNode = emptyState ?? (
    <EmptyState
      title={`No records yet`}
      description={`Create a new record to get started on ${board.name}.`}
      compact
    />
  );

  const hasAnyData = records.length > 0 || (groups && groups.length > 0);

  // ── Data Rows ──────────────────────────────────────────

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-none border border-border bg-card shadow-sm">
      {/* Bulk action bar */}
      {hasSelection && (
        <div className="flex items-center gap-2 border-b border-border bg-accent/30 px-4 py-2 text-sm">
          <span className="font-medium text-foreground">
            {selection.count} selected
          </span>
          <div className="ml-auto flex items-center gap-1">
            {onBulkArchive && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setBulkAction("archive")}
              >
                <Archive className="mr-1 size-3.5" />
                Archive
              </Button>
            )}
            {onBulkDelete && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => setBulkAction("delete")}
              >
                <Trash2 className="mr-1 size-3.5" />
                Delete
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={selection.deselectAll}
            >
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* Empty state panel — shown only when there is no data at all.
          The full table shell (toolbar + headers + group controls) is always
          rendered by the parent BoardLayout, so a zero-row board is never
          blank. */}
      {!hasAnyData && (
        <div className="rounded-xl border border-dashed border-border bg-card p-6">
          {emptyStateNode}
        </div>
      )}

      {/* Table container */}
      <div
        ref={tableRef}
        className="min-h-0 flex-1 overflow-auto"
        tabIndex={0}
        role="grid"
        aria-label={`${board.name} table`}
        onKeyDown={handleKeyDown}
        onScroll={handleScroll}
      >
        <div className="min-w-max">
          {/* ── Sticky Header Row ───────────────────────────── */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <div
              className="sticky top-0 z-30 grid rounded-none border-b border-border bg-white"
              style={{
                gridTemplateColumns: columnWidthsList,
              }}
            >
              {/* Selection checkbox header */}
              <div className="flex items-center justify-center border-r border-border bg-white px-2 py-3">
                <input
                  type="checkbox"
                  className="size-4 rounded border-border"
                  checked={selection.isAllSelected(recordIds)}
                  ref={(el) => {
                    if (el) {
                      el.indeterminate = selection.isPartiallySelected(
                        recordIds,
                      );
                    }
                  }}
                  onChange={handleSelectAll}
                  aria-label="Select all rows"
                />
              </div>

              {/* Record title header */}
               <div
                 className="group relative flex items-center border-r border-border bg-white px-3 py-2 text-xs font-medium text-muted-foreground sticky left-0 z-20 overflow-hidden"
                 style={{ width: recordTitleWidth, minWidth: recordTitleWidth }}
                 onDoubleClick={() => setPrimaryColumnRenameOpen(true)}
               >
                 <span className="truncate">{recordColumnLabel}</span>
                 <DropdownMenu>
                   <DropdownMenuTrigger asChild>
                     <button
                       type="button"
                       className="ml-auto flex size-5 shrink-0 items-center justify-center rounded opacity-0 transition-opacity group-hover:opacity-100 hover:bg-accent"
                       aria-label="Column menu"
                     >
                       <MoreHorizontal className="size-3.5" />
                     </button>
                   </DropdownMenuTrigger>
                   <DropdownMenuContent align="end" className="w-44">
                     <DropdownMenuItem onSelect={() => setPrimaryColumnRenameOpen(true)}>
                       <Pencil className="mr-2 size-3.5" />
                       Rename
                     </DropdownMenuItem>
                   </DropdownMenuContent>
                 </DropdownMenu>
                 <div
                   className="absolute right-0 top-0 z-20 h-full w-1.5 cursor-col-resize"
                   onMouseDown={(e) => {
                     e.preventDefault();
                     e.stopPropagation();
                     const startX = e.clientX;
                     const startWidth = recordTitleWidth;
                     const handleMouseMove = (moveEvent: MouseEvent) => {
                       const delta = moveEvent.clientX - startX;
                       const newWidth = Math.max(120, Math.min(600, startWidth + delta));
                       setRecordTitleWidth(newWidth);
                     };
                     const handleMouseUp = (upEvent: MouseEvent) => {
                       const delta = upEvent.clientX - startX;
                       const finalWidth = Math.max(120, Math.min(600, startWidth + delta));
                       handleRecordTitleResize(finalWidth);
                       document.removeEventListener("mousemove", handleMouseMove);
                       document.removeEventListener("mouseup", handleMouseUp);
                       document.body.style.cursor = "";
                       document.body.style.userSelect = "";
                     };
                     document.addEventListener("mousemove", handleMouseMove);
                     document.addEventListener("mouseup", handleMouseUp);
                     document.body.style.cursor = "col-resize";
                     document.body.style.userSelect = "none";
                   }}
                 >
                   <div className="mx-auto h-full w-0.5 rounded-full bg-border opacity-60 transition-opacity group-hover:opacity-100" />
                 </div>
               </div>

               {/* Primary column rename dialog */}
               <Dialog open={primaryColumnRenameOpen} onOpenChange={setPrimaryColumnRenameOpen}>
                 <DialogContent className="sm:max-w-sm">
                   <DialogHeader>
                     <DialogTitle>Rename column</DialogTitle>
                   </DialogHeader>
                   <div className="py-4">
                     <Input
                       ref={primaryColumnRenameInputRef}
                       defaultValue={recordColumnLabel}
                       onChange={(e) => setRecordColumnLabel(e.target.value)}
                       onKeyDown={(e) => {
                         if (e.key === "Enter") {
                           const trimmed = (e.target as HTMLInputElement).value.trim();
                           if (trimmed && trimmed !== (primaryColumnLabel ?? "Name")) {
                             onPrimaryColumnRename?.(trimmed);
                           }
                           setPrimaryColumnRenameOpen(false);
                         } else if (e.key === "Escape") {
                           setPrimaryColumnRenameOpen(false);
                         }
                       }}
                       placeholder="Column label"
                       className="h-7 text-xs"
                     />
                   </div>
                   <DialogFooter>
                     <Button variant="outline" onClick={() => setPrimaryColumnRenameOpen(false)}>
                       Cancel
                     </Button>
                     <Button
                       onClick={() => {
                         const trimmed = recordColumnLabel.trim();
                         if (trimmed && trimmed !== (primaryColumnLabel ?? "Name")) {
                           onPrimaryColumnRename?.(trimmed);
                         }
                         setPrimaryColumnRenameOpen(false);
                       }}
                     >
                       Save
                     </Button>
                   </DialogFooter>
                 </DialogContent>
               </Dialog>

              {/* Column headers */}
              <SortableContext
                items={visibleColumns.map((c) => c.id)}
                strategy={horizontalListSortingStrategy}
              >
                {visibleColumns.map((column) => {
                  if (collapsedColumns.has(column.id)) {
                    return (
                      <button
                        key={column.id}
                        onClick={() => handleToggleCollapse(column.id)}
                        className="flex items-center justify-center border-r border-border bg-white hover:bg-gray-50 cursor-pointer"
                        style={{ width: 10, minWidth: 10 }}
                        aria-label={`Expand ${column.label}`}
                      >
                        <span className="text-[9px] font-bold text-muted-foreground">⇄</span>
                      </button>
                    );
                  }
                  return (
                    <SortableColumnHeaderWrapper
                      key={column.id}
                      column={column}
                      columns={columns}
                      frozen={column.frozen}
                      hidden={column.hidden}
                      width={getColumnWidth(column, columnWidths)}
                      onResize={onColumnResize}
                      onRename={onColumnRename}
                      onDuplicate={onColumnDuplicate}
                      onDuplicateWithValues={onColumnDuplicateWithValues}
                      onToggleHidden={onColumnToggleHidden}
                      onToggleFrozen={onColumnToggleFrozen}
                      onChangeType={onColumnChangeType}
                      onDelete={onColumnDelete}
                      onAddColumn={onColumnAdd}
                      sortColumnId={activeSortColumnId}
                      sortDirection={activeSortDirection}
                      onSort={handleSort}
                      onAddDescription={handleAddDescription}
                      onToggleRestrictEditing={handleToggleRestrictEditing}
                      onToggleRestrictView={handleToggleRestrictView}
                      onSetFilter={handleSetFilter}
                      onClearFilter={handleClearFilter}
                      onToggleCollapse={handleToggleCollapse}
                      onWrapText={handleToggleWrapText}
                      columnDescription={column.description}
                      restrictEditing={restrictEditingColumns.has(column.id)}
                      restrictView={restrictViewColumns.has(column.id)}
                      isFiltered={activeFilters.has(column.id)}
                      isCollapsed={collapsedColumns.has(column.id)}
                      isWrapped={wrappedColumns.has(column.id)}
                    />
                  );
                })}
              </SortableContext>
            </div>
          </DndContext>

          {/* ── Data Rows (virtualized) ──────────────────────────────── */}
          <div
            className="relative w-full"
            style={{ height: totalRowsHeight }}
          >
          {virtualRows.map((virtualRow) => {
            const item = allRows[virtualRow.index];
            if (!item) return null;
            const actualIdx = virtualRow.index;
            const style = {
              position: "absolute" as const,
              top: 0,
              left: 0,
              right: 0,
              transform: `translateY(${virtualRow.start}px)`,
            };
            if (item.type === "header" && item.groupId) {
              const groupEntry = groupedRecords.find((g) => g.groupId === item.groupId);
              if (!groupEntry) return null;
              const group = groupEntry.group;
              const isCollapsed = collapsedGroups.has(groupEntry.groupId ?? "null");
              const groupRecords = groupEntry.records;
              return (
                <div key={`header-${item.groupId}`} style={style}>
                  <div
                    className="flex items-center gap-2 border-l-2 bg-muted/30 px-4 py-2 text-sm font-medium"
                    style={{ borderLeftColor: group?.color ?? "#94a3b8" }}
                  >
                    <button
                      onClick={() => toggleGroup(group!.id)}
                      className="flex size-5 items-center justify-center rounded hover:bg-accent"
                      aria-label={isCollapsed ? "Expand group" : "Collapse group"}
                    >
                      {isCollapsed ? (
                        <ChevronRight className="size-3.5" />
                      ) : (
                        <ChevronDown className="size-3.5" />
                      )}
                    </button>
                    {editingGroupId === group!.id ? (
                      <input
                        ref={editingGroupInputRef}
                        value={editingGroupName}
                        onChange={(e) => setEditingGroupName(e.target.value)}
                        onBlur={() => {
                          const trimmed = editingGroupName.trim();
                          if (trimmed && onRenameGroup) {
                            onRenameGroup(group!.id, trimmed);
                          }
                          setEditingGroupId(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            const trimmed = editingGroupName.trim();
                            if (trimmed && onRenameGroup) {
                              onRenameGroup(group!.id, trimmed);
                            }
                            setEditingGroupId(null);
                          } else if (e.key === "Escape") {
                            setEditingGroupId(null);
                          }
                        }}
                        className="h-7 min-w-0 flex-1 rounded-md border border-input px-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                      />
                    ) : (
                      <span
                        className="flex-1 truncate cursor-pointer"
                        onDoubleClick={() => {
                          setEditingGroupId(group!.id);
                          setEditingGroupName(group!.name);
                        }}
                      >
                        {group!.name}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">{groupRecords.length}</span>
                    <GroupHeaderMenu
                      group={group!}
                      _boardId={board.id}
                      onMoveGroupToBoard={onMoveGroupToBoard}
                      onMoveGroupToTop={onMoveGroupToTop}
                      onRenameGroup={(groupId) => {
                        setEditingGroupId(groupId);
                        setEditingGroupName(groups?.find((g) => g.id === groupId)?.name ?? "");
                      }}
                      onDeleteGroup={onDeleteGroup}
                      onUpdateGroupColor={onUpdateGroupColor}
                      onUpdateGroupStatusOptions={onUpdateGroupStatusOptions}
                    />
                  </div>
                </div>
              );
            }
            if (item.type === "row" && item.record) {
              const record = item.record;
              const isSelected = selection.isSelected(record.id);
              return (
                <div
                  key={record.id}
                  className={cn(
                    "grid border-b border-border transition-colors",
                    isSelected && "bg-accent/30",
                    focusedCell?.rowIdx === actualIdx && "ring-1 ring-inset ring-primary/20",
                  )}
                  style={{ gridTemplateColumns: columnWidthsList, ...style }}
                  role="row"
                  aria-selected={isSelected}
                >
                  <div className="flex items-center justify-center border-r border-border bg-white px-2 py-3">
                    <input
                      type="checkbox"
                      className="size-4 rounded border-border"
                      checked={isSelected}
                      onChange={() => selection.toggle(record.id)}
                      onClick={(e) => {
                        if ((e as unknown as MouseEvent).shiftKey) {
                          e.preventDefault();
                          selection.selectRange(record.id, recordIds, true);
                        }
                      }}
                      aria-label={`Select ${record.title}`}
                    />
                  </div>
                  <div
                    className={cn(
                      "sticky left-0 z-20 bg-white px-4 py-3 group border-r border-border overflow-hidden",
                      isSelected && "bg-accent/30",
                    )}
                    data-cell-row={actualIdx}
                    data-cell-col={0}
                    onClick={() => setFocusedCell({ rowIdx: actualIdx, colIdx: 0 })}
                    style={{ width: recordTitleWidth, minWidth: recordTitleWidth }}
                  >
                    <div className="flex items-center min-w-0">
                      <Input
                        value={record.title}
                        onChange={(e) => onRecordTitleChange?.(record.id, e.target.value)}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === "Enter") {
                            e.stopPropagation();
                            (e.target as HTMLElement).blur();
                          }
                        }}
                        placeholder="Type here..."
                        className="h-8 border-0 bg-transparent flex-1 min-w-0 text-sm font-medium shadow-none focus-visible:bg-muted/50 focus-visible:ring-1 focus-visible:ring-ring"
                      />
                      <div className="ml-auto shrink-0">
                        <RowMenu
                          recordId={record.id}
                          _recordTitle={record.title}
                          groups={groups}
                          currentGroupId={record.groupId}
                          onMoveToGroup={onMoveToGroup}
                          onMoveToStatus={onMoveToStatus}
                          onDelete={onRowDelete}
                          onDuplicate={onRowDuplicate}
                        />
                      </div>
                    </div>
                  </div>
                  {visibleColumns.map((column, colIdx) => {
                    if (collapsedColumns.has(column.id)) {
                      return (
                        <div
                          key={column.id}
                          className="flex items-center justify-center border-r border-border bg-white"
                          style={{ width: 10, minWidth: 10 }}
                          data-cell-row={actualIdx}
                          data-cell-col={colIdx + 1}
                        >
                          <button
                            onClick={() => handleToggleCollapse(column.id)}
                            className="flex items-center justify-center text-muted-foreground hover:text-foreground"
                            aria-label={`Expand ${column.label}`}
                          >
                            <span className="text-[9px] font-bold">⇄</span>
                          </button>
                        </div>
                      );
                    }
                    const value = cellValues.get(getCellKey(record.id, column.id)) ?? column.defaultValue;
                    return (
                      <div
                        key={column.id}
                        className={cn(
                          "px-4 py-2 align-top border-r border-border bg-white overflow-hidden",
                          column.frozen && "sticky left-0 z-10 shadow-sm",
                          isSelected && column.frozen && "bg-accent/30",
                          wrappedColumns.has(column.id)
                            ? "whitespace-normal break-words"
                            : "whitespace-nowrap",
                        )}
                        data-cell-row={actualIdx}
                        data-cell-col={colIdx + 1}
                        onClick={() => setFocusedCell({ rowIdx: actualIdx, colIdx: colIdx + 1 })}
                      >
                        <CellRenderer
                          board={board}
                          column={column}
                          record={record}
                          value={value}
                          readOnly={restrictEditingColumns.has(column.id)}
                          onChange={(nextValue) =>
                            onCellChange?.({
                              recordId: record.id,
                              columnId: column.id,
                              value: nextValue,
                            })
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              );
            }
            return null;
})}
          </div>

          {/* Load more indicator */}
          {hasMore && (
            <div className="flex items-center justify-center border-b border-border py-3">
              {loadingMore ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="size-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                  Loading more records...
                </div>
              ) : (
                <button
                  onClick={() => onScrollBottom?.()}
                  className="text-xs text-primary hover:underline"
                >
                  Load more records
                </button>
              )}
            </div>
          )}
          {hasMore === false && recordTotal !== undefined && recordTotal > records.length && (
            <div className="border-b border-border bg-muted/20 px-4 py-2 text-center text-xs text-muted-foreground">
              Showing {records.length} of {recordTotal} records
            </div>
          )}

          {/* Add new group button */}
          {onAddGroup && (
            <div
              className="flex items-center gap-2 border-b border-border px-4 py-2 text-xs text-muted-foreground hover:bg-accent/50 cursor-pointer"
              onClick={async () => {
                const result = await onAddGroup("New Group");
                if (typeof result === "string") {
                  setEditingGroupId(result);
                  setEditingGroupName("New Group");
                }
              }}
            >
              <Plus className="size-3.5" />
              <span>Add new group</span>
            </div>
          )}

          {/* ── Footer with sums for number columns ────────── */}
          {Object.keys(numberColumnSums).length > 0 && (
            <div
              className="grid border-t border-border bg-white"
              style={{ gridTemplateColumns: columnWidthsList }}
              role="row"
            >
              <div className="flex items-center justify-center border-r border-border px-2 py-2 text-xs font-medium text-muted-foreground">
                Sum
              </div>
              <div className="sticky left-0 z-10 bg-white px-4 py-2 text-xs font-medium text-muted-foreground">
                Total
              </div>
              {visibleColumns.map((column) => {
                if (collapsedColumns.has(column.id)) {
                  return <div key={column.id} style={{ width: 10, minWidth: 10 }} />;
                }
                const sum = numberColumnSums[column.id];
                if (sum === undefined) return <div key={column.id} className="px-4 py-2" />;
                return (
                  <div
                    key={column.id}
                    className={cn(
                      "px-4 py-2 align-top text-sm font-medium tabular-nums",
                      column.frozen && "sticky left-0 z-10 bg-white shadow-sm",
                    )}
                  >
                    {sum.toLocaleString()}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Floating bottom selection toolbar */}
      {hasSelection && (
        <div className="flex shrink-0 items-center gap-2 border-t border-border bg-accent/30 px-4 py-2 text-sm">
          <span className="font-medium text-foreground">
            {selection.count} Client names selected
          </span>
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                Array.from(selection.selectedIds).forEach((id) => {
                  onRowDuplicate?.(id);
                });
              }}
            >
              <Copy className="mr-1 size-3.5" />
              Duplicate
            </Button>
            <Button variant="ghost" size="sm" onClick={() => toast.message("Export coming soon")}>
              <Download className="mr-1 size-3.5" />
              Export
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setBulkAction("archive")}
            >
              <Archive className="mr-1 size-3.5" />
              Archive
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => setBulkAction("delete")}
            >
              <Trash2 className="mr-1 size-3.5" />
              Delete
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">
                  <ArrowUpDown className="mr-1 size-3.5" />
                  Move to
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {STATUS_OPTIONS.map((status) => (
                  <DropdownMenuItem
                    key={status.id}
                    onSelect={() => onMoveToStatus?.(Array.from(selection.selectedIds), status.name)}
                  >
                    <span
                      className="mr-2 size-2.5 rounded-sm"
                      style={{ backgroundColor: status.color }}
                    />
                    {status.name}
                  </DropdownMenuItem>
                ))}
                {(groups ?? []).filter((g) => !selection.selectedIds.has(g.id) && !STATUS_OPTIONS.some((s) => s.name === g.name)).length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    {(groups ?? []).filter((g) => !selection.selectedIds.has(g.id) && !STATUS_OPTIONS.some((s) => s.name === g.name)).map((group) => (
                      <DropdownMenuItem
                        key={group.id}
                        onSelect={() => onMoveToGroup?.(Array.from(selection.selectedIds), group.id)}
                      >
                        {group.name}
                      </DropdownMenuItem>
                    ))}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="sm" onClick={() => toast.message("Convert coming soon")}>
              <RefreshCw className="mr-1 size-3.5" />
              Convert
            </Button>
            <Button variant="ghost" size="sm" onClick={() => toast.message("Sidekick coming soon")}>
              <Bot className="mr-1 size-3.5" />
              Sidekick
            </Button>
            <Button variant="ghost" size="sm" onClick={() => toast.message("Apps coming soon")}>
              <LayoutGrid className="mr-1 size-3.5" />
              Apps
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={selection.deselectAll}
            >
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* Bulk Archive Confirmation */}
      <ConfirmDialog
        open={bulkAction === "archive"}
        onOpenChange={(open) => !open && setBulkAction(null)}
        title="Archive records"
        description={`Are you sure you want to archive ${selection.count} record${selection.count !== 1 ? "s" : ""}?`}
        confirmLabel="Archive"
        variant="default"
        onConfirm={() => {
          onBulkArchive?.(Array.from(selection.selectedIds));
          selection.clear();
          setBulkAction(null);
        }}
      />

      {/* Bulk Delete Confirmation */}
      <ConfirmDialog
        open={bulkAction === "delete"}
        onOpenChange={(open) => !open && setBulkAction(null)}
        title="Delete records"
        description={`Are you sure you want to permanently delete ${selection.count} record${selection.count !== 1 ? "s" : ""}? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => {
          onBulkDelete?.(Array.from(selection.selectedIds));
          selection.clear();
          setBulkAction(null);
        }}
      />

      {/* Add Column Picker */}
      <ColumnTypePicker
        open={addColumnAfterId !== null}
        onOpenChange={(open) => !open && setAddColumnAfterId(null)}
        onSelect={handleAddColumn}
      />

      {/* Connect Board Column Modal */}
      <ConnectBoardColumnModal
        open={connectBoardAfterId !== null}
        onOpenChange={(open) => !open && setConnectBoardAfterId(null)}
        onConfirm={(settings: ConnectedBoardColumnSettings) => {
          onColumnAdd?.(
            "connected_board",
            connectBoardAfterId ?? undefined,
            settings as unknown as Record<string, unknown>,
          );
          setConnectBoardAfterId(null);
        }}
      />
    </div>
  );
}

