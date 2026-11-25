import type { Member } from '@/lib/members-types';
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
import { AddGroupPopover, type AddGroupPayload } from "./add-group-popover";
import { DEFAULT_TITLE_COLUMN_LABEL } from "../lib/title-column";
import { getPrimaryColumn, isPlaceholderTitle } from "../lib/primary-column";
import { isBlankCellValue, cellTitleText } from "../lib/cell-value";
import { ConnectBoardColumnModal } from "./connect-board-column-modal";
import { ConfirmDialog } from "./confirm-dialog";
import { useSelection } from "../hooks/use-selection";
import { toast } from "sonner";
import type {
  BoardDefinition,
  BoardRecord,
  ColumnDefinition,
  ColumnValue,
  CellChangeMetadata,
  DropdownOption,
  Group,
} from "../types";
import type { ColumnTypeKey, ConnectedBoardColumnSettings } from "../types";
import {
  getColumnOptions,
  isOptionColumnType,
  resolveOptionDisplay,
  findOptionForValue,
} from "../lib/option-lookup";
import { formatDateTimeIST, formatRelativeIST, getUserLabel } from "../cell-change-utils";
import {
  GRID_MATRIX_MIME,
  mapSourceColumnsToTarget,
  matrixToHtml as gridMatrixToHtml,
  matrixToTSV,
  matrixSize,
  padMatrix,
  resolveClipboardMatrix,
  serializeMatrix,
  type CellMatrix,
  type ColumnMapping,
  type ColumnMeta,
  type GridClipboardPayload,
  type ColumnDefinitionMinimal,
} from "../lib/grid-clipboard";

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
const STATUS_OPTIONS = [
  { id: "status-todo", name: "To-Do", color: "#94a3b8" },
  { id: "status-inprogress", name: "In Progress", color: "#3b82f6" },
  { id: "status-review", name: "Review", color: "#f59e0b" },
  { id: "status-done", name: "Done", color: "#22c55e" },
] as const;

const PASTE_CHUNK_SIZE = 200;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}


// -- Grid paste/copy helpers --------------------------------------------------
// Serialization lives in ../lib/grid-clipboard so it can be unit tested.
const COMPUTED_TYPES = new Set(["formula", "mirror", "rollup", "lookup", "created_by", "created_at", "updated_at", "last_edited_by", "last_edited_time", "auto_number"]);
const isComputedColumn = (c: ColumnDefinition) => COMPUTED_TYPES.has(c.type);

function formatYmd(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function parseDateForPaste(str: string): string | null {
  const s = str.trim();
  let m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) return formatYmd(+m[3], +m[2], +m[1]);
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2})$/);
  if (m) { const yy = +m[3]; return formatYmd(yy < 50 ? 2000 + yy : 1900 + yy, +m[2], +m[1]); }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[Ts])/);
  if (m) return formatYmd(+m[1], +m[2], +m[3]);
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (n > 59 && n < 100000) {
      const d = new Date(Date.UTC(1899, 11, 30) + Math.round(n * 86400000));
      return formatYmd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    }
  }
  return null;
}

function formatDateForCopy(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : String(ymd);
}

/** True when a day/month/year string is ambiguous (both parts <= 12, unequal). */
function isAmbiguousDate(str: string): boolean {
  const m = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (!m) return false;
  const d = +m[1], mo = +m[2];
  return d !== mo && d <= 12 && mo <= 12;
}

type PasteConvert = { value: ColumnValue; skip: boolean; reason?: string; clear?: boolean; warning?: string };

function convertPastedValue(raw: string, column: ColumnDefinition, options: DropdownOption[], members: Member[]): PasteConvert {
  const str = raw.trim();
  if (str === "") return { value: null, skip: false, clear: true };
  if (isOptionColumnType(column.type)) {
    const matched = findOptionForValue(options, str);
    return matched ? { value: matched.id, skip: false } : { value: null, skip: true, reason: `no matching option for "${str}"` };
  }
  if (column.type === "person") {
    const low = str.toLowerCase();
    const matched = members.find((m) => m.name?.toLowerCase() === low || m.email?.toLowerCase() === low);
    return matched ? { value: matched.user_id, skip: false } : { value: null, skip: true, reason: `no matching user for "${str}"` };
  }
  if (column.type === "date" || column.type === "timeline") {
    const parsed = parseDateForPaste(str);
    const ambiguous = parsed != null && isAmbiguousDate(str);
    return parsed
      ? { value: parsed, skip: false, warning: ambiguous ? `ambiguous date "${str}" — read as ${parsed} (day-first)` : undefined }
      : { value: null, skip: true, reason: `invalid date "${str}"` };
  }
  if (column.type === "number" || column.type === "currency") {
    const cleaned = str.replace(/[\s,₹$€£¥]/g, "");
    if (cleaned === "" || Number.isNaN(Number(cleaned))) return { value: null, skip: true, reason: `invalid number "${str}"` };
    return { value: Number(cleaned), skip: false };
  }
  if (column.type === "checkbox") {
    const lower = str.toLowerCase();
    if (["true","yes","1","on"].includes(lower)) return { value: true, skip: false };
    if (["false","no","0","off"].includes(lower)) return { value: false, skip: false };
    return { value: null, skip: true, reason: `invalid boolean "${str}"` };
  }
  return { value: str, skip: false };
}

export interface TableViewProps {
  board: BoardDefinition;
  columns: ColumnDefinition[];
  records: BoardRecord[];
  cellValues: Map<string, ColumnValue>;
  cellMetadata?: Map<string, CellChangeMetadata>;
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
  onColumnSetPrimary?: (columnId: string) => void;
  onColumnChangeType?: (columnId: string, type: ColumnTypeKey) => void;
  onColumnToggleWrapText?: (columnId: string) => void;
  onColumnDelete?: (columnIds: string | string[]) => void;
  canEditColumns?: boolean;
  /** ID of the column currently being deleted (for loading state) */
  deletingColumnId?: string | null;
  onColumnAdd?: (type: ColumnTypeKey, afterColumnId?: string, settings?: Record<string, unknown>) => Promise<string | undefined>;
  onUpdateColumnSettings?: (columnId: string, patch: Partial<ColumnDefinition>) => void;
  onConfigureMirror?: (column: ColumnDefinition) => void;
  /**
   * Persist a column's label list (Edit Labels "Apply").
   * Resolves to `true` only when the store AND the database were updated.
   */
  onUpdateColumnLabels?: (columnId: string, labels: DropdownOption[]) => Promise<boolean>;
  onColumnUpdateDescription?: (columnId: string, description: string) => void;
  onColumnToggleRestrictEditing?: (columnId: string) => void;
  onColumnToggleRestrictView?: (columnId: string) => void;
  onColumnManageAccess?: (column: ColumnDefinition) => void;
  members?: Member[];
  membersLoading?: boolean;
  titleColumnLabel?: string;
  /** Rename the title (record-title) column */
  onTitleColumnRename?: (label: string) => void;
  /** Sort */
  sortColumnId?: string;
  sortDirection?: "asc" | "desc";
  onSort?: (columnId: string, direction: "asc" | "desc") => void;
  /** Bulk record operations */
  onBulkArchive?: (recordIds: string[]) => void;
  onBulkDelete?: (recordIds: string[]) => void;
  /** Loading states for bulk operations */
  bulkArchiveLoading?: boolean;
  bulkDeleteLoading?: boolean;
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
  onAddGroup?: (payload: AddGroupPayload) => Promise<string | void> | string | void;
  onDuplicateGroup?: (groupId: string) => void;
  onToggleGroupCollapse?: (groupId: string, collapsed: boolean) => void;
  /** Persist a group's own title column label */
  onUpdateGroupTitleColumnLabel?: (groupId: string, titleColumnLabel: string) => void;
  onUpdateGroupColumnMode?: (groupId: string, mode: "inherit" | "custom", copyBoardColumns?: boolean) => void;
  /** New item callback */
  onNewItem?: (groupId?: string | null) => Promise<string | undefined>;
  /** Batched new item callback (preferred for paste): creates N rows in one write, returns their IDs */
  onBulkNewItem?: (count: number, groupId?: string | null) => Promise<string[]>;
  /** Record title change callback */
  onRecordTitleChange?: (recordId: string, title: string) => void | Promise<boolean>;
  /** Batched title change callback (preferred for paste / undo / redo) */
  onBulkRecordTitleChange?: (updates: Array<{ recordId: string; title: string }>) => Promise<void> | void;
  /** Batched cell change callback (preferred for paste / undo / redo) */
  onBulkCellChange?: (updates: Array<{ recordId: string; columnId: string; value: ColumnValue }>) => Promise<void> | void;
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
  onSetPrimary,
  onChangeType,
  onDelete,
  selectedColumnIds,
  onDeleteColumns,
  canEdit,
  onAddColumn,
  onUpdateColumnSettings,
  onConfigureMirror,
  selected,
  onSelect,
  onSelectStart,
  sortColumnId,
  sortDirection,
  onSort,
  onAddDescription,
  onToggleRestrictEditing,
  onToggleRestrictView,
  onManageAccess,
  members,
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
  onSetPrimary?: (columnId: string) => void;
  onChangeType?: (columnId: string, type: ColumnTypeKey) => void;
  onDelete?: (columnId: string) => void;
  selectedColumnIds?: string[];
  onDeleteColumns?: (columnIds: string[]) => void;
  canEdit?: boolean;
  onAddColumn?: (type: ColumnTypeKey, afterColumnId?: string, settings?: Record<string, unknown>) => void;
  onUpdateColumnSettings?: (columnId: string, patch: Partial<ColumnDefinition>) => void;
  sortColumnId?: string;
  sortDirection?: "asc" | "desc";
  onSort?: (columnId: string, direction: "asc" | "desc") => void;
  onAddDescription?: (columnId: string, description: string) => void;
  onToggleRestrictEditing?: (columnId: string) => void;
  onToggleRestrictView?: (columnId: string) => void;
  onManageAccess?: (column: ColumnDefinition) => void;
  members?: Member[];
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
  deleteLoading?: boolean;
  onConfigureMirror?: (column: ColumnDefinition) => void;
  selected?: boolean;
  onSelect?: (columnId: string, e: React.MouseEvent) => void;
  onSelectStart?: (columnId: string, e: React.MouseEvent) => void;
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
        onSetPrimary={onSetPrimary}
        onChangeType={onChangeType}
        onDelete={onDelete}
        selectedColumnIds={selectedColumnIds}
        onDeleteColumns={onDeleteColumns}
        canEdit={canEdit}
        onAddColumn={onAddColumn}
        onUpdateColumnSettings={onUpdateColumnSettings}
        onConfigureMirror={onConfigureMirror}
        sortColumnId={sortColumnId}
        sortDirection={sortDirection}
        onSort={onSort}
        sortableListeners={listeners as unknown as Record<string, unknown>}
        sortableAttributes={attributes as unknown as Record<string, unknown>}
        onAddDescription={onAddDescription}
        onToggleRestrictEditing={onToggleRestrictEditing}
        onToggleRestrictView={onToggleRestrictView}
        onManageAccess={onManageAccess}
        members={members}
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
        selected={selected}
        onSelect={onSelect}
        onSelectStart={onSelectStart}
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
  onDuplicateGroup,
  onUpdateGroupColor,
  onUpdateGroupStatusOptions,
  onRenameTitleColumn,
  onUpdateGroupColumnMode,
}: {
  group: Group;
  _boardId: string;
  onMoveGroupToBoard?: (groupId: string, targetBoardId: string) => void;
  onMoveGroupToTop?: (groupId: string) => void;
  onRenameGroup?: (groupId: string, name: string) => void;
  onDeleteGroup?: (groupId: string) => void;
  onDuplicateGroup?: (groupId: string) => void;
  onUpdateGroupColor?: (groupId: string, color: string | null) => void;
  onUpdateGroupStatusOptions?: (groupId: string, statusOptions: Array<{ id: string; label: string; color?: string }>) => void;
  onRenameTitleColumn?: (groupId: string) => void;
  onUpdateGroupColumnMode?: (groupId: string, mode: "inherit" | "custom", copyBoardColumns?: boolean) => void;
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
        {onDuplicateGroup && (
          <DropdownMenuItem onSelect={() => onDuplicateGroup(group.id)}>
            Duplicate group
          </DropdownMenuItem>
        )}
        {onRenameTitleColumn && (
          <DropdownMenuItem onSelect={() => onRenameTitleColumn(group.id)}>
            Rename title column
          </DropdownMenuItem>
        )}
        {onUpdateGroupColumnMode && (
          <>
            <DropdownMenuSeparator />
            {group.columnMode !== "custom" && (
              <DropdownMenuItem onSelect={() => {
                const copy = window.confirm("Copy the current board columns into this group? Select Cancel to start with only the title column.");
                onUpdateGroupColumnMode(group.id, "custom", copy);
              }}>
                Use independent columns for this group
              </DropdownMenuItem>
            )}
            {group.columnMode === "custom" && (
              <DropdownMenuItem onSelect={() => {
                if (window.confirm("Switch to board columns? Custom columns and their data will be hidden, not deleted.")) {
                  onUpdateGroupColumnMode(group.id, "inherit");
                }
              }}>
                Use board columns (shared)
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => onUpdateGroupColumnMode(group.id, "inherit")}>
              Reset to board columns
            </DropdownMenuItem>
          </>
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
        <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/50" onClick={handleStatusCancel}>
          <div className="w-80 popover-surface" onClick={(e) => e.stopPropagation()}>
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
  cellMetadata,
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
  onColumnSetPrimary,
  onColumnChangeType,
  onColumnDelete,
  canEditColumns = true,
  deletingColumnId,
  onColumnAdd,
  onUpdateColumnSettings,
  onUpdateColumnLabels,
  onColumnUpdateDescription,
  onColumnToggleRestrictEditing,
  onColumnToggleRestrictView,
  onColumnManageAccess,
  members,
  membersLoading,
  titleColumnLabel,
  onTitleColumnRename,
  sortColumnId,
  sortDirection,
  onSort,
  onBulkArchive,
  onBulkDelete,
  bulkArchiveLoading,
  bulkDeleteLoading,
  onConfigureMirror,
  groups,
  onNewItem,
  onBulkNewItem,
  onRecordTitleChange,
  onBulkRecordTitleChange,
  onBulkCellChange,
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
  onDuplicateGroup,
  onToggleGroupCollapse,
  onUpdateGroupTitleColumnLabel,
  onUpdateGroupColumnMode,
  onScrollBottom,
  loadingMore,
  hasMore,
  recordTotal,
}: TableViewProps) {
  const [showLastEdited, setShowLastEdited] = useState(true);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(`board:${board.id}:show-last-edited`);
      if (saved !== null) setShowLastEdited(saved !== "false");
    } catch { /* optional preference */ }
  }, [board.id]);
  const toggleLastEdited = useCallback(() => {
    setShowLastEdited((current) => {
      const next = !current;
      try { window.localStorage.setItem(`board:${board.id}:show-last-edited`, String(next)); } catch { /* optional preference */ }
      return next;
    });
  }, [board.id]);
  // ── Selection ──────────────────────────────────────────
  const recordIds = useMemo(() => records.map((r) => r.id), [records]);
  const selection = useSelection<string>();
  // -- Excel-style grid selection (anchor/focus = grid range) ----------------
  const [gridAnchor, setGridAnchor] = useState<{ row: number; col: number } | null>(null);
  const [gridEnd, setGridEnd] = useState<{ row: number; col: number } | null>(null); // focus
  const gridSelectingRef = useRef(false);
  const [gridDragSelecting, setGridDragSelecting] = useState(false);
  const gridCutRef = useRef<{r1:number;r2:number;c1:number;c2:number}|null>(null);
  const gridFillRef = useRef<{ active: boolean; source: {r1:number;r2:number;c1:number;c2:number} | null }>({ active: false, source: null });
  const internalClipboardRef = useRef<{ payload: GridClipboardPayload; raw: GridChange[] } | null>(null);
  // Set when Ctrl+C/Ctrl+X already wrote the clipboard, so the native copy
  // event that follows does not write it a second time.
  const gridCopyHandledRef = useRef(false);
  type GridChange = { kind: "title"; recordId: string; value: string } | { kind: "cell"; recordId: string; columnId: string; value: ColumnValue };
  type GridUndo = { prev: GridChange[]; next: GridChange[]; createdIds?: string[] };
  const [gridUndo, setGridUndo] = useState<GridUndo[]>([]);
  const [gridRedo, setGridRedo] = useState<GridUndo[]>([]);
  const [gridCtx, setGridCtx] = useState<{x:number;y:number;r:number;c:number}|null>(null);
  const [bulkAction, setBulkAction] = useState<"archive" | "delete" | null>(
    null,
  );

  // ── Column-level UI state ──────────────────────────────
  const [collapsedColumns, setCollapsedColumns] = useState<Set<string>>(new Set());
  const [activeFilters, setActiveFilters] = useState<Map<string, { operator: string; value: ColumnValue }>>(new Map());
  const [restrictEditingColumns, setRestrictEditingColumns] = useState<Set<string>>(new Set());
  const [restrictViewColumns, setRestrictViewColumns] = useState<Set<string>>(new Set());
  const [wrappedColumns, setWrappedColumns] = useState<Set<string>>(new Set());
  // Excel-style header selection
  const [selectedHeaderIds, setSelectedHeaderIds] = useState<string[]>([]);
  const [pendingColumnDeleteIds, setPendingColumnDeleteIds] = useState<string[]>([]);
  const [headerAnchorId, setHeaderAnchorId] = useState<string | null>(null);
  const selectDragRef = useRef<{
    active: boolean;
    anchorId: string | null;
    startX: number;
    startY: number;
    moved: boolean;
  }>({ active: false, anchorId: null, startX: 0, startY: 0, moved: false });
  const suppressHeaderClickRef = useRef(false);

  const requestDeleteSelectedColumns = useCallback((ids: string[]) => {
    if (!canEditColumns) return;
    const selected = columns.filter((column) => ids.includes(column.id));
    if (selected.length === 0) return;
    setPendingColumnDeleteIds(selected.map((column) => column.id));
  }, [columns, canEditColumns]);

  const confirmDeleteSelectedColumns = useCallback(() => {
    if (pendingColumnDeleteIds.length === 0) return;
    onColumnDelete?.(pendingColumnDeleteIds);
    setPendingColumnDeleteIds([]);
    setSelectedHeaderIds([]);
    setHeaderAnchorId(null);
  }, [onColumnDelete, pendingColumnDeleteIds]);

  const handleSingleColumnDelete = useCallback((columnId: string) => {
    if (!canEditColumns) return;
    if (!columns.some((column) => column.id === columnId)) return;
    onColumnDelete?.(columnId);
    setSelectedHeaderIds([]);
    setHeaderAnchorId(null);
  }, [canEditColumns, columns, onColumnDelete]);

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

  const handleHeaderSelect = useCallback((columnId: string, e: React.MouseEvent) => {
    if (suppressHeaderClickRef.current) {
      suppressHeaderClickRef.current = false;
      return;
    }
    const ids = [...columns].sort((a, b) => a.order - b.order).map((c) => c.id);
    if (e.shiftKey && headerAnchorId) {
      const start = ids.indexOf(headerAnchorId);
      const end = ids.indexOf(columnId);
      if (start >= 0 && end >= 0) {
        const [lo, hi] = start < end ? [start, end] : [end, start];
        setSelectedHeaderIds(ids.slice(lo, hi + 1));
      }
    } else if (e.ctrlKey || e.metaKey) {
      setSelectedHeaderIds((prev) =>
        prev.includes(columnId) ? prev.filter((id) => id !== columnId) : [...prev, columnId],
      );
      setHeaderAnchorId(columnId);
    } else {
      setSelectedHeaderIds([columnId]);
      setHeaderAnchorId(columnId);
    }
  }, [columns, headerAnchorId]);

  const handleHeaderSelectStart = useCallback((columnId: string, e: React.MouseEvent) => {
    selectDragRef.current = {
      active: true,
      anchorId: columnId,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    };
  }, []);

  useEffect(() => {
    const onCopy = (e: ClipboardEvent) => {
      if (selectedHeaderIds.length === 0) return;
      const target = e.target as HTMLElement;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      const ordered = [...columns]
        .sort((a, b) => a.order - b.order)
        .filter((c) => selectedHeaderIds.includes(c.id));
      if (ordered.length === 0) return;
      const payload = {
        version: 1,
        sourceBoardId: board.id,
        columns: ordered.map((c) => ({
          label: c.label,
          description: c.description,
          type: c.type,
          required: c.required,
          hidden: c.hidden,
          frozen: c.frozen,
          isPrimary: c.isPrimary,
          pinned: c.pinned,
          defaultValue: c.defaultValue,
          settings: JSON.parse(JSON.stringify(c.settings ?? {})),
          permissions: JSON.parse(JSON.stringify(c.permissions)),
          validation: JSON.parse(JSON.stringify(c.validation ?? [])),
          restrictEditing: c.restrictEditing,
          restrictView: c.restrictView,
          collapsed: c.collapsed,
          wrapText: c.wrapText,
          width: columnWidths?.[c.id] ?? 180,
        })),
      };
       e.clipboardData?.setData("application/x-board-columns", JSON.stringify(payload));
       e.clipboardData?.setData("text/plain", ordered.map((c) => c.label).join("\t"));
       copyKindRef.current = "columns";
       headerCopyDefsRef.current = payload.columns;
       e.preventDefault();
      toast(`Copied ${ordered.length} column${ordered.length === 1 ? "" : "s"}`);
    };
    window.addEventListener("copy", onCopy);
    return () => window.removeEventListener("copy", onCopy);
  }, [selectedHeaderIds, columns, board.id, columnWidths]);

  useEffect(() => {
    const onPaste = async (e: ClipboardEvent) => {
      const target = e.target as HTMLElement;
       if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
       if (selection.count > 0) return; // row paste handled separately; never create columns
       // A cell range owns the clipboard: without this guard a range paste also
       // created columns named after the first copied row.
       if (selectedHeaderIds.length === 0 && (gridAnchor || gridEnd)) return;
       if (!document.querySelector("[data-column-id]")) return;
      const cd = e.clipboardData;
      if (!cd) return;
      const custom = cd.getData("application/x-board-columns");
      const plain = cd.getData("text/plain");
      if (!custom && !plain) return;
      let names: string[] = [];
      let defs: any[] = [];
      if (custom) {
        try {
          const parsed = JSON.parse(custom);
          if (parsed?.version === 1 && Array.isArray(parsed.columns)) defs = parsed.columns;
        } catch { /* ignore */ }
      }
      if (defs.length === 0 && plain) {
        const lines = plain.split(/\r?\n/);
        const first = lines[0] ?? "";
        names = first.split("\t").map((s) => s.trim()).filter(Boolean);
      }
      if (defs.length === 0 && names.length === 0) return;
      e.preventDefault();
      const skip: string[] = [];
      const existing = new Set(columns.map((c) => c.label.toLowerCase()));
      const addedNames = new Set<string>();
      const unsupported = new Set(["formula", "lookup", "rollup", "mirror", "connected_board", "person"]);
      const afterId = selectedHeaderIds.length
        ? selectedHeaderIds[selectedHeaderIds.length - 1]
        : undefined;
      let pasted = 0;
      const items = defs.length
        ? defs
        : names.map((n) => ({ label: n, type: "text", width: 180, settings: {}, required: false, hidden: false, frozen: false, permissions: { view: [], edit: [], configure: [] }, validation: [], defaultValue: null }));
      for (const d of items) {
        const type = String(d.type ?? "text");
        if (unsupported.has(type)) { skip.push(d.label); continue; }
        let name = String(d.label ?? "Column").trim() || "Column";
        let candidate = name;
        let i = 2;
        while (existing.has(candidate.toLowerCase()) || addedNames.has(candidate.toLowerCase())) {
          candidate = `${name} (${i++})`;
        }
        addedNames.add(candidate.toLowerCase());
        existing.add(candidate.toLowerCase());
        const settings = d.settings ? JSON.parse(JSON.stringify(d.settings)) : {};
        const newId = await onColumnAdd?.(type as any, afterId, {
          ...settings,
          label: candidate,
          width: d.width,
          required: d.required,
          hidden: d.hidden,
          frozen: d.frozen,
          defaultValue: d.defaultValue,
          permissions: d.permissions,
          validation: d.validation,
        });
        if (newId && d.width != null) {
          onColumnResize?.(newId, d.width);
        }
        pasted++;
      }
      const msg = skip.length
        ? `Pasted ${pasted} columns, skipped ${skip.length}: ${skip.join(", ")}`
        : `Pasted ${pasted} columns`;
      toast(msg);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [selectedHeaderIds, gridAnchor, gridEnd, selection.count, columns, onColumnAdd, onColumnResize]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const editing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      if ((e.key === "Delete" || e.key === "Backspace") && !editing && selectedHeaderIds.length > 0) {
        e.preventDefault();
        requestDeleteSelectedColumns(selectedHeaderIds);
        return;
      }
      if (e.key === "Escape") {
        setSelectedHeaderIds([]);
        setHeaderAnchorId(null);
      }
    };
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-column-id]")) {
        setSelectedHeaderIds([]);
        setHeaderAnchorId(null);
      }
    };
    const onMove = (e: MouseEvent) => {
      if (!selectDragRef.current.active) return;
      const dx = Math.abs(e.clientX - selectDragRef.current.startX);
      const dy = Math.abs(e.clientY - selectDragRef.current.startY);
      if (!selectDragRef.current.moved && (dx > 4 || dy > 4)) {
        selectDragRef.current.moved = true;
      }
      if (!selectDragRef.current.moved) return;
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const header = el?.closest("[data-column-id]");
      if (!header) return;
      const id = header.getAttribute("data-column-id")!;
      const anchor = selectDragRef.current.anchorId;
      if (!anchor || id === anchor) return;
      const ids = [...columns].sort((a, b) => a.order - b.order).map((c) => c.id);
      const a = ids.indexOf(anchor);
      const b = ids.indexOf(id);
      if (a >= 0 && b >= 0) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        setSelectedHeaderIds(ids.slice(lo, hi + 1));
      }
    };
    const onUp = () => {
      if (selectDragRef.current.moved) {
        suppressHeaderClickRef.current = true;
        window.setTimeout(() => {
          suppressHeaderClickRef.current = false;
        }, 0);
      }
      selectDragRef.current.active = false;
      selectDragRef.current.moved = false;
      selectDragRef.current.anchorId = null;
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [columns, selectedHeaderIds, requestDeleteSelectedColumns]);

  // ── Groups ────────────────────────────────────────────
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [showAddGroupPopover, setShowAddGroupPopover] = useState(false);
  const [editingGroupName, setEditingGroupName] = useState("");
  const editingGroupInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingGroupId && editingGroupInputRef.current) {
      editingGroupInputRef.current.focus();
      editingGroupInputRef.current.select();
    }
  }, [editingGroupId]);

  const toggleGroup = useCallback(
    (groupId: string) => {
      const willCollapse = !collapsedGroups.has(groupId);
      setCollapsedGroups((prev) => {
        const next = new Set(prev);
        if (next.has(groupId)) {
          next.delete(groupId);
        } else {
          next.add(groupId);
        }
        return next;
      });
      onToggleGroupCollapse?.(groupId, willCollapse);
    },
    [collapsedGroups, onToggleGroupCollapse],
  );

  // ── Sort state ────────────────────────────────────────
  const [internalSort, setInternalSort] = useState<{ columnId: string; direction: "asc" | "desc" } | null>(null);
  const activeSortColumnId = sortColumnId ?? internalSort?.columnId;
  const activeSortDirection = sortDirection ?? internalSort?.direction ?? "asc";
  const lastEditedAt = useCallback(
    (record: BoardRecord) => record.lastEditedAt ?? record.updatedAt ?? record.createdAt ?? null,
    [],
  );

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
    if (!col && activeSortColumnId !== "__last_edited__") return records;

    const sorted = [...records].sort((a, b) => {
      const aVal = activeSortColumnId === "__last_edited__"
        ? lastEditedAt(a)
        : cellValues.get(getCellKey(a.id, col!.id)) ?? col!.defaultValue;
      const bVal = activeSortColumnId === "__last_edited__"
        ? lastEditedAt(b)
        : cellValues.get(getCellKey(b.id, col!.id)) ?? col!.defaultValue;

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
  }, [records, columns, cellValues, activeSortColumnId, activeSortDirection, lastEditedAt]);

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
  const [addColumnAfterId, setAddColumnAfterId] = useState<string | null | "end">(null);
  const [connectBoardAfterId, setConnectBoardAfterId] = useState<string | null>(null);

  /** Per-group title column rename (the group keeps its own label). */
  const [groupTitleRename, setGroupTitleRename] = useState<{
    groupId: string;
    label: string;
  } | null>(null);

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
  const allVisibleColumns = useMemo(
    () =>
      [...columns]
        .filter((column) => !column.groupId)
        .sort((a, b) => a.order - b.order),
    [columns],
  );

  const hasColumnLayout = allVisibleColumns.length > 0;

  const visibleColumns = useMemo(() => {
    const start = visibleColumnRange?.start ?? 0;
    const count = visibleColumnRange?.count ?? allVisibleColumns.length;
    return allVisibleColumns.slice(start, start + count);
  }, [allVisibleColumns, visibleColumnRange]);

  const hasSelection = selection.count > 0;
  const rowCopyRef = useRef<{ text: string; pairs: { columnId: string; value: any }[] } | null>(null);
  const copyKindRef = useRef<"row" | "columns" | null>(null);
  const headerCopyDefsRef = useRef<any[]>([]);


  const targetColumns = useCallback(() => {
    if (selectedHeaderIds.length > 0) {
      return [...columns].sort((a, b) => a.order - b.order).filter((c) => selectedHeaderIds.includes(c.id));
    }
    return allVisibleColumns.filter((c) => !["formula", "mirror", "rollup", "lookup"].includes(c.type));
  }, [selectedHeaderIds, columns, allVisibleColumns]);

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

// -- Excel-style grid model (continuous 2D: all visible items in order) -----
const flatRecords = useMemo(
    () => groupedRecords.flatMap((e) => (collapsedGroups.has(e.groupId ?? "null") ? [] : e.records)),
    [groupedRecords, collapsedGroups],
  );
  const flatIndexById = useMemo(() => new Map(flatRecords.map((r, i) => [r.id, i])), [flatRecords]);

  const selectableRecordIds = useMemo(
    () => flatRecords.map((record) => record.id),
    [flatRecords],
  );
  const allRecordsSelected = selection.isAllSelected(selectableRecordIds);

  useEffect(() => {
    selection.clear();
  }, [board.id]);

  useEffect(() => {
    selection.clear();
  }, [activeFilters]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("powerweave:table-selection-change", {
      detail: {
        count: selection.count,
        allSelected: allRecordsSelected,
        visibleCount: selectableRecordIds.length,
      },
    }));
  }, [selection.count, allRecordsSelected, selectableRecordIds.length]);

  useEffect(() => {
    const handleToolbarSelectAll = () => {
      if (allRecordsSelected) selection.deselectAll();
      else selection.selectAll(selectableRecordIds);
    };
    window.addEventListener("powerweave:table-select-all", handleToolbarSelectAll);
    return () => window.removeEventListener("powerweave:table-select-all", handleToolbarSelectAll);
  }, [allRecordsSelected, selectableRecordIds, selection]);

  const getRowColumns = useCallback((record: BoardRecord) => {
    const group = groups?.find((candidate) => candidate.id === record.groupId);
    if (group?.columnMode === "custom") {
      return columns.filter((column) => column.groupId === group.id && !column.hidden);
    }
    return visibleColumns;
  }, [columns, groups, visibleColumns]);

  const gridColumnsFor = useCallback((record: BoardRecord) => {
    return getRowColumns(record).filter((c) => !collapsedColumns.has(c.id));
  }, [getRowColumns, collapsedColumns]);

  const isTitleCell = useCallback((record: BoardRecord, column: ColumnDefinition) => {
    const cols = getRowColumns(record);
    const isPrimary = column.id === getPrimaryColumn(columns, { groupId: record.groupId })?.id;
    const fallback = !isPrimary ? cols.find((c) => ["text","long_text","email","phone","url"].includes(c.type)) : undefined;
    return isPrimary || column.id === fallback?.id;
  }, [columns, getRowColumns]);

  const handleSelectAll = useCallback(() => {
    if (flatRecords.length) {
      const last = flatRecords.length - 1;
      const lc = Math.max(0, gridColumnsFor(flatRecords[last] || records[0]).length - 1);
      setGridAnchor({ row: 0, col: 0 });
      setGridEnd({ row: last, col: lc });
      setFocusedCell({ rowIdx: 0, colIdx: 0 });
      console.log("[grid-selection]", { r1: 0, c1: 0, r2: last, c2: lc });
    } else {
      selection.deselectAll();
    }
  }, [flatRecords, gridColumnsFor, records, selection]);

  const gridRange = useMemo(() => {
    if (!gridAnchor || !gridEnd) return null;
    return {
      r1: Math.min(gridAnchor.row, gridEnd.row),
      r2: Math.max(gridAnchor.row, gridEnd.row),
      c1: Math.min(gridAnchor.col, gridEnd.col),
      c2: Math.max(gridAnchor.col, gridEnd.col),
    };
  }, [gridAnchor, gridEnd]);
  const gridColsCount = useCallback((r = 0) => Math.max(1, gridColumnsFor(flatRecords[r] || records[0]).length), [flatRecords, gridColumnsFor, records]);
  const isInGridRange = useCallback((r: number, c: number) => !!gridRange && r >= gridRange.r1 && r <= gridRange.r2 && c >= gridRange.c1 && c <= gridRange.c2, [gridRange]);

  const scrollGridCellIntoView = useCallback((row: number, col: number) => {
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-grid-row="${row}"][data-grid-col="${col}"]`);
      (el as HTMLElement | null)?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  }, []);

  useEffect(() => {
    if (!gridAnchor && !gridEnd) return;
    const range = gridRange;
    const cols = (flatRecords[range?.r1 ?? 0] || records[0]) ? gridColumnsFor(flatRecords[range?.r1 ?? 0] || records[0]) : [];
    const ordered = cols.map((c, i) => ({ index: i, id: c.id, title: c.label, type: c.type }));
    console.log("[grid-selection]", range, { anchor: gridAnchor, focus: gridEnd, columns: ordered });
  }, [gridAnchor, gridEnd, gridRange, flatRecords, gridColumnsFor, records]);

  const getDisplayValue = useCallback((record: BoardRecord, column: ColumnDefinition): string => {
    const titleCell = isTitleCell(record, column);
    const title = typeof record.title === "string" ? record.title.trim() : "";
    if (titleCell && !isPlaceholderTitle(record.title)) {
      return title;
    }
    const v = cellValues.get(getCellKey(record.id, column.id)) ?? column.defaultValue;
    if (isBlankCellValue(v)) return "";
    if (titleCell) return cellTitleText(v);
    if (isOptionColumnType(column.type)) {
      const opts = getColumnOptions(column);
      const o = opts.find((x) => String(x.id).toLowerCase() === String(v).toLowerCase() || String((x as any).name ?? (x as any).label ?? "").toLowerCase() === String(v).toLowerCase());
      return String((o as any)?.name ?? (o as any)?.label ?? v);
    }
    if (column.type === "person") {
      const m = (members as Member[] | undefined)?.find((mm: any) => mm.user_id === v || mm.id === v);
      return String(m?.name || m?.email || v);
    }
    if (column.type === "date" || column.type === "timeline") return formatDateForCopy(String(v));
    if (column.type === "checkbox") return v ? "true" : "false";
    return String(v);
  }, [cellValues, isTitleCell, members]);

  // Max cell/title updates per bulk server write: keeps large pastes under
  // the server-action body size limit and Vercel function timeout while
  // still reporting progress per chunk. See PASTE_CHUNK_SIZE above.

  const applyPasteUpdates = useCallback(async (
    titleUpdates: Array<{ recordId: string; title: string }>,
    cellUpdates: Array<{ recordId: string; columnId: string; value: ColumnValue }>,
    prev: GridChange[],
  ) => {
    const next: GridChange[] = [
      ...titleUpdates.map((t) => ({ kind: "title" as const, recordId: t.recordId, value: t.title })),
      ...cellUpdates.map((c) => ({ kind: "cell" as const, recordId: c.recordId, columnId: c.columnId, value: c.value })),
    ];
    if (cellUpdates.length) {
      const batches = chunk(cellUpdates, PASTE_CHUNK_SIZE);
      if (onBulkCellChange) {
        for (const batch of batches) await onBulkCellChange(batch);
      } else {
        for (const u of cellUpdates) await onCellChange?.(u);
      }
    }
    if (titleUpdates.length) {
      const batches = chunk(titleUpdates, PASTE_CHUNK_SIZE);
      if (onBulkRecordTitleChange) {
        for (const batch of batches) await onBulkRecordTitleChange(batch);
      } else {
        for (const u of titleUpdates) await onRecordTitleChange?.(u.recordId, u.title);
      }
    }
    if (prev.length) { setGridUndo((s) => [...s, { prev, next }]); setGridRedo([]); }
  }, [onBulkCellChange, onBulkRecordTitleChange, onCellChange, onRecordTitleChange]);

  const undoGrid = useCallback(async () => {
    const entry = gridUndo[gridUndo.length - 1];
    if (!entry) return;
    const titles: Array<{recordId:string;title:string}> = [];
    const cells: Array<{recordId:string;columnId:string;value:ColumnValue}> = [];
    for (const p of entry.prev) {
      if (p.kind === "title") titles.push({ recordId: p.recordId, title: p.value });
      else cells.push({ recordId: p.recordId, columnId: p.columnId, value: p.value });
    }
    if (cells.length) { if (onBulkCellChange) await onBulkCellChange(cells); else for (const u of cells) await onCellChange?.(u); }
    if (titles.length) { if (onBulkRecordTitleChange) await onBulkRecordTitleChange(titles); else for (const u of titles) await onRecordTitleChange?.(u.recordId, u.title); }
    setGridUndo((s) => s.slice(0, -1));
    setGridRedo((s) => [...s, entry]);
    toast("Undo paste");
  }, [gridUndo, onBulkCellChange, onBulkRecordTitleChange, onCellChange, onRecordTitleChange]);

  const redoGrid = useCallback(async () => {
    const entry = gridRedo[gridRedo.length - 1];
    if (!entry) return;
    const titles: Array<{recordId:string;title:string}> = [];
    const cells: Array<{recordId:string;columnId:string;value:ColumnValue}> = [];
    for (const p of entry.next) {
      if (p.kind === "title") titles.push({ recordId: p.recordId, title: p.value });
      else cells.push({ recordId: p.recordId, columnId: p.columnId, value: p.value });
    }
    if (cells.length) { if (onBulkCellChange) await onBulkCellChange(cells); else for (const u of cells) await onCellChange?.(u); }
    if (titles.length) { if (onBulkRecordTitleChange) await onBulkRecordTitleChange(titles); else for (const u of titles) await onRecordTitleChange?.(u.recordId, u.title); }
    setGridRedo((s) => s.slice(0, -1));
    setGridUndo((s) => [...s, entry]);
    toast("Redo paste");
  }, [gridRedo, onBulkCellChange, onBulkRecordTitleChange, onCellChange, onRecordTitleChange]);

  const readGridMatrix = useCallback((range: {r1:number;r2:number;c1:number;c2:number}): CellMatrix => {
    const rows: CellMatrix = [];
    for (let r = range.r1; r <= range.r2; r++) {
      const rec = flatRecords[r];
      if (!rec) {
        rows.push(new Array(Math.max(0, range.c2 - range.c1 + 1)).fill(""));
        continue;
      }
      const cols = gridColumnsFor(rec);
      const rowVals: string[] = [];
      for (let c = range.c1; c <= range.c2; c++) {
        const col = cols[c];
        rowVals.push(col ? getDisplayValue(rec, col) : "");
      }
      rows.push(rowVals);
    }
    return rows;
  }, [flatRecords, gridColumnsFor, getDisplayValue]);

  const getAllRowColumns = useCallback((record: BoardRecord): ColumnDefinition[] => {
    const group = groups?.find((g) => g.id === record.groupId);
    if (group?.columnMode === "custom") {
      return columns.filter((c) => c.groupId === group.id && !isComputedColumn(c));
    }
    return columns.filter((c) => !c.groupId && !isComputedColumn(c));
  }, [columns, groups]);

  const copyGridRange = useCallback(async (range: {r1:number;r2:number;c1:number;c2:number}, cut = false) => {
    const prev: GridUndo["prev"] = [];
    const titleUpdates: Array<{recordId:string;title:string}> = [];
    const cellUpdates: Array<{recordId:string;columnId:string;value:ColumnValue}> = [];
    const readOnly = restrictEditingColumns ?? new Set<string>();
    const rows = readGridMatrix(range);
    for (let r = range.r1; r <= range.r2; r++) {
      const rec = flatRecords[r];
      if (!rec || !cut) continue;
      const cols = gridColumnsFor(rec);
      for (let c = range.c1; c <= range.c2; c++) {
        const col = cols[c];
        if (!col || isComputedColumn(col) || readOnly.has(col.id)) continue;
        if (isTitleCell(rec, col)) { prev.push({kind:"title",recordId:rec.id,value:rec.title||""}); titleUpdates.push({recordId:rec.id,title:""}); }
        else { prev.push({kind:"cell",recordId:rec.id,columnId:col.id,value:cellValues.get(getCellKey(rec.id,col.id)) ?? col.defaultValue ?? null}); cellUpdates.push({recordId:rec.id,columnId:col.id,value:null}); }
      }
    }
    const matrix = padMatrix(rows);

    const anchorRec = flatRecords[range.r1] ?? records[0];
    const anchorCols = gridColumnsFor(anchorRec);
    const copiedColMetas: ColumnMeta[] = [];
    for (let c = range.c1; c <= range.c2; c++) {
      const col = anchorCols[c];
      if (col) {
        copiedColMetas.push({
          id: col.id,
          title: col.label,
          type: col.type,
          isPrimary: col.isPrimary ?? false,
        });
      } else {
        copiedColMetas.push({ id: "", title: "", type: "text", isPrimary: false });
      }
    }

    const payload: GridClipboardPayload = {
      version: 2,
      sourceBoardId: board.id,
      columns: copiedColMetas,
      rows: matrix,
    };

    const tsv = matrixToTSV(matrix);
    const html = gridMatrixToHtml(matrix);
    internalClipboardRef.current = { payload, raw: [] };
    try {
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        const clipPayload: Record<string, Blob> = {
          "text/plain": new Blob([tsv], { type: "text/plain" }),
          "text/html": new Blob([html], { type: "text/html" }),
        };
        try { clipPayload[GRID_MATRIX_MIME] = new Blob([serializeMatrix(payload)], { type: GRID_MATRIX_MIME }); } catch { /* optional */ }
        await navigator.clipboard.write([new ClipboardItem(clipPayload)]);
      } else {
        await navigator.clipboard.writeText(tsv);
      }
    } catch {
      try { await navigator.clipboard.writeText(tsv); } catch { /* in-app paste still works */ }
    }
    gridCutRef.current = cut ? { ...range } : null;
    if (cut) await applyPasteUpdates(titleUpdates, cellUpdates, prev);
    const { rows: copiedRows, cols: copiedCols } = matrixSize(matrix);
    console.log("[grid-copy]", { range, cut, rows: copiedRows, cols: copiedCols });
  }, [flatRecords, gridColumnsFor, readGridMatrix, isTitleCell, restrictEditingColumns, cellValues, applyPasteUpdates, board.id]);

  const clearGridRange = useCallback(async (range: {r1:number;r2:number;c1:number;c2:number}) => {
    const prev: GridUndo["prev"] = [];
    const titleUpdates: Array<{recordId:string;title:string}> = [];
    const cellUpdates: Array<{recordId:string;columnId:string;value:ColumnValue}> = [];
    const readOnly = restrictEditingColumns ?? new Set<string>();
    for (let r = range.r1; r <= range.r2; r++) {
      const rec = flatRecords[r]; if (!rec) continue;
      const cols = gridColumnsFor(rec);
      for (let c = range.c1; c <= range.c2; c++) {
        const col = cols[c]; if (!col || isComputedColumn(col) || readOnly.has(col.id)) continue;
        if (isTitleCell(rec, col)) { prev.push({kind:"title",recordId:rec.id,value:rec.title||""}); titleUpdates.push({recordId:rec.id,title:""}); }
        else { prev.push({kind:"cell",recordId:rec.id,columnId:col.id,value:cellValues.get(getCellKey(rec.id,col.id)) ?? col.defaultValue ?? null}); cellUpdates.push({recordId:rec.id,columnId:col.id,value:null}); }
      }
    }
    await applyPasteUpdates(titleUpdates, cellUpdates, prev);
    toast("Cleared selection");
  }, [flatRecords, gridColumnsFor, isTitleCell, restrictEditingColumns, cellValues, applyPasteUpdates]);

  const doGridPaste = useCallback(async (text: string, clipboard?: { getData: (format: string) => string } | null) => {
    const resolved = resolveClipboardMatrix(clipboard ?? null, text, internalClipboardRef.current?.payload ?? null);
    if (!resolved) return;
    const matrix = resolved.rows;
    const sourceColumns = resolved.columns;
    const anchor = gridAnchor ?? gridEnd ?? { row: 0, col: 0 };
    const sel = gridRange ?? { r1: anchor.row, r2: anchor.row, c1: anchor.col, c2: anchor.col };
    const top = Math.max(0, sel.r1);
    const left = Math.max(0, sel.c1);
    const single = matrix.length === 1 && (matrix[0]?.length || 0) === 1;
    const block: CellMatrix = single && (sel.r1 !== sel.r2 || sel.c1 !== sel.c2)
      ? Array.from({ length: sel.r2 - sel.r1 + 1 }, () => Array.from({ length: sel.c2 - sel.c1 + 1 }, () => matrix[0][0] ?? ""))
      : matrix;
    const R = block.length;
    const C = block.reduce((m, r) => Math.max(m, r.length), 0);
    if (!R || !C) return;

    const needed = top + R;

    const createdIds: string[] = [];
    const rowsToCreate = Math.max(0, needed - flatRecords.length);
    if (rowsToCreate > 0) {
      const gid = flatRecords[flatRecords.length - 1]?.groupId ?? (groups && groups.length > 0 ? groups[0].id : null);
      if (onBulkNewItem) {
        for (let offset = 0; offset < rowsToCreate; offset += PASTE_CHUNK_SIZE) {
          const count = Math.min(PASTE_CHUNK_SIZE, rowsToCreate - offset);
          const ids = await onBulkNewItem(count, gid);
          createdIds.push(...(ids || []).filter(Boolean));
        }
      } else if (onNewItem) {
        while (createdIds.length < rowsToCreate) {
          const id = await onNewItem(gid);
          if (id) createdIds.push(id);
          else break;
        }
      }
    }

    const anchorRec = flatRecords[top] ?? records[0];
    const anchorCols = gridColumnsFor(anchorRec);

    // Build source-to-target column mapping using shared utility
    const targetColsMinimal: ColumnDefinitionMinimal[] = anchorCols.map((c) => ({
      id: c.id,
      label: c.label,
      type: c.type,
      isPrimary: c.isPrimary ?? false,
      hidden: c.hidden,
      settings: c.settings,
    }));
    const colMapping = mapSourceColumnsToTarget(sourceColumns, targetColsMinimal, left, C);

    const readOnly = restrictEditingColumns ?? new Set<string>();
    const prev: GridUndo["prev"] = [];
    const titleUpdates: Array<{recordId:string;title:string}> = [];
    const cellUpdates: Array<{recordId:string;columnId:string;value:ColumnValue}> = [];
    const skipped: Array<{row:number;col:number;label:string;value:string;reason:string}> = [];
    const warned: Array<{row:number;col:number;label:string;value:string;warning:string}> = [];
    const synthetic = new Set<string>();
    const skippedColumns = new Set<string>();

    const liveFlat = groupedRecords.flatMap((e) => (collapsedGroups.has(e.groupId ?? "null") ? [] : e.records));
    const working = [...liveFlat];
    let ciCreated = 0;
    while (working.length < needed) {
      const realId = createdIds[ciCreated++];
      const template = working[working.length - 1] || liveFlat[0] || records[0];
      const id = realId ?? `__new_${working.length}`;
      if (!realId) synthetic.add(id);
      working.push({ ...(template || {}), id, title: "", groupId: template?.groupId ?? (groups?.[0]?.id ?? null) } as any);
    }

    for (let i = 0; i < R; i++) {
      const rec = working[top + i] || flatRecords[top + i];
      if (!rec) continue;
      if (synthetic.has(rec.id)) { skipped.push({ row: top + i + 1, col: 0, label: "row", value: "", reason: "row could not be created" }); continue; }
      const recCols = getAllRowColumns(rec);
      const recColIds = new Set(recCols.map((c) => c.id));
      const srcRow = block[i] || [];

      // First pass: find primary column value for this row
      let primaryValue = "";
      for (const mapping of colMapping) {
        const targetCol = mapping.targetIndex !== null ? anchorCols[mapping.targetIndex] : null;
        if (targetCol?.isPrimary && mapping.sourceIndex < srcRow.length) {
          primaryValue = String(srcRow[mapping.sourceIndex] ?? "").trim();
          break;
        }
      }

      for (const mapping of colMapping) {
        const j = mapping.sourceIndex;
        if (j >= srcRow.length) continue;
        const targetCol = mapping.targetIndex !== null ? anchorCols[mapping.targetIndex] : null;
        const raw = String(srcRow[j] ?? "");

        if (!targetCol) {
          if (raw.trim() !== "") {
            skipped.push({ row: top + i + 1, col: j + 1, label: sourceColumns[j]?.title || `col ${j}`, value: raw, reason: "no matching column in target" });
            skippedColumns.add(sourceColumns[j]?.title || `col ${j}`);
          }
          continue;
        }

        // Computed/read-only columns are skipped first (they exist in grid but can't be written)
        if (isComputedColumn(targetCol) || readOnly.has(targetCol.id)) {
          if (raw.trim() !== "") skipped.push({ row: top + i + 1, col: j + 1, label: targetCol.label, value: raw, reason: "read-only" });
          continue;
        }

        // Column must exist in this row's group (groups may have different columns)
        if (!recColIds.has(targetCol.id)) {
          skipped.push({ row: top + i + 1, col: j + 1, label: targetCol.label, value: raw, reason: "column not in this row's group" });
          continue;
        }

        const titleHere = isTitleCell(rec, targetCol);
        if (titleHere) {
          prev.push({ kind: "title", recordId: rec.id, value: rec.title || "" });
          const titleToWrite = primaryValue || raw.trim();
          titleUpdates.push({ recordId: rec.id, title: titleToWrite });
          continue;
        }

        const options = getColumnOptions(targetCol);
        const conv = convertPastedValue(raw, targetCol, options, (members as Member[]) || []);
        if (conv.warning) warned.push({ row: top + i + 1, col: j + 1, label: targetCol.label, value: raw, warning: conv.warning });
        if (conv.skip) {
          skipped.push({ row: top + i + 1, col: j + 1, label: targetCol.label, value: raw, reason: conv.reason || "skipped" });
          continue;
        }
        prev.push({ kind: "cell", recordId: rec.id, columnId: targetCol.id, value: cellValues.get(getCellKey(rec.id, targetCol.id)) ?? targetCol.defaultValue ?? null });
        cellUpdates.push({ recordId: rec.id, columnId: targetCol.id, value: conv.value });
      }
    }

    await applyPasteUpdates(titleUpdates, cellUpdates, prev);
    gridCutRef.current = null;

    const anchorColsEnd = gridColumnsFor(flatRecords[top] || records[0]);
    const endR = top + R - 1;
    const endC = Math.min(left + C - 1, Math.max(left, (anchorColsEnd.length || 1) - 1));
    setGridAnchor({ row: top, col: left });
    setGridEnd({ row: Math.max(top, endR), col: Math.max(left, endC) });
    setFocusedCell({ rowIdx: top, colIdx: left });
    scrollGridCellIntoView(top, left);

    const skipCount = skipped.length;
    const warnCount = warned.length;
    const skippedColsList = Array.from(skippedColumns).slice(0, 5);
    const skipDetail = skipped.map((s) => `row ${s.row}, col ${s.col} "${s.label}": value="${s.value}" — ${s.reason}`).join("; ");
    const warnDetail = warned.map((w) => `row ${w.row}, col ${w.col} "${w.label}": value="${w.value}" — ${w.warning}`).join("; ");
    const reportParts: string[] = [];
    if (skipDetail) reportParts.push(`${skipCount} skipped: ${skipDetail}`);
    if (warnDetail) reportParts.push(`${warnCount} warned: ${warnDetail}`);
    const skippedColsMsg = skippedColsList.length ? `, ${skippedColsList.length} columns skipped${skippedColumns.size > 5 ? "..." : ""}: ${skippedColsList.join(", ")}` : "";
    const reportMsg = reportParts.length ? ` — ${reportParts.join(" ")}` : "";
    console.log("[grid-paste]", { source: resolved.exact ? "matrix" : "text", selected: { r1: top, c1: left, r2: Math.max(top, endR), c2: Math.max(left, endC) }, matrix: { rows: R, cols: C }, skipped, warned });
    toast(`Pasted ${R} rows${skippedColsMsg}${skipCount ? `, ${skipCount} cells skipped` : ""}${warnCount ? `, ${warnCount} warned` : ""}${reportMsg}`);
  }, [gridAnchor, gridEnd, gridRange, flatRecords, groupedRecords, collapsedGroups, groups, onNewItem, onBulkNewItem, records, restrictEditingColumns, gridColumnsFor, getAllRowColumns, cellValues, members, isTitleCell, applyPasteUpdates, scrollGridCellIntoView, board.id]);

  const applyGridFill = useCallback(async (source: {r1:number;r2:number;c1:number;c2:number}, target: {r1:number;r2:number;c1:number;c2:number}) => {
    const down = target.r2 > source.r2;
    const right = target.c2 > source.c2 && target.r2 === source.r2;
    if (!down && !right) return;
    const block: CellMatrix = [];
    const srcH = Math.max(1, source.r2 - source.r1 + 1);
    const srcW = Math.max(1, source.c2 - source.c1 + 1);
    for (let r = target.r1; r <= target.r2; r++) {
      const row: string[] = [];
      for (let c = target.c1; c <= target.c2; c++) {
        const sr = source.r1 + ((r - source.r1) % srcH);
        const sc = source.c1 + ((c - source.c1) % srcW);
        const srec = flatRecords[sr]; const scols = srec ? gridColumnsFor(srec) : [];
        row.push(srec && scols[sc] ? getDisplayValue(srec, scols[sc]) : "");
      }
      block.push(row);
    }
    const pa = gridAnchor, pe = gridEnd;
    setGridAnchor({ row: target.r1, col: target.c1 }); setGridEnd({ row: target.r2, col: target.c2 });
    await doGridPaste(matrixToTSV(padMatrix(block)));
    setGridAnchor(pa ?? { row: target.r1, col: target.c1 }); setGridEnd(pe ?? { row: target.r2, col: target.c2 });
  }, [flatRecords, gridColumnsFor, getDisplayValue, doGridPaste, gridAnchor, gridEnd]);

  // The grid is made of divs, so after a cell click the DOM focus is still on
  // <body> and a native paste never reaches the table element. Listen on the
  // window so Ctrl+V lands on the grid, and defer to the header/column handler
  // when a header selection is active.
  useEffect(() => {
    const isEditable = (el: EventTarget | null) => {
      const node = el as HTMLElement | null;
      return !!node && (node.tagName === "INPUT" || node.tagName === "TEXTAREA" || node.isContentEditable);
    };
    const hasGridSelection = () => !!(gridAnchor || gridEnd);
    const onWindowPaste = (e: ClipboardEvent) => {
      if (isEditable(e.target)) return;
      if (selectedHeaderIds.length > 0) return;
      const text = e.clipboardData?.getData("text/plain");
      if (text == null) return;

      // If there's a grid selection, use it. Otherwise, if there's a row
      // selection, create a temporary grid selection covering all columns of
      // the selected rows so that paste works for "Copy row / Paste" workflow.
      let pasteAnchor = gridAnchor;
      let pasteEnd = gridEnd;
      let restoreGridSelection = false;
      if (!hasGridSelection() && selection.count > 0) {
        const selectedIndices = flatRecords
          .map((rec, idx) => (selection.selectedIds.has(rec.id) ? idx : -1))
          .filter((idx) => idx >= 0);
        if (selectedIndices.length > 0) {
          const firstCol = 0;
          const lastCol = Math.max(0, gridColumnsFor(flatRecords[0] || records[0]).length - 1);
          pasteAnchor = { row: selectedIndices[0], col: firstCol };
          pasteEnd = { row: selectedIndices[selectedIndices.length - 1], col: lastCol };
          restoreGridSelection = true;
        }
      }
      if (!pasteAnchor && !pasteEnd) return;

      e.preventDefault();
      const prevAnchor = gridAnchor;
      const prevEnd = gridEnd;
      if (restoreGridSelection) {
        setGridAnchor(pasteAnchor!);
        setGridEnd(pasteEnd!);
      }
      void doGridPaste(text, e.clipboardData).then(() => {
        if (restoreGridSelection) {
          setGridAnchor(prevAnchor);
          setGridEnd(prevEnd);
        }
      });
    };
    const onWindowCopy = (e: ClipboardEvent) => {
      if (isEditable(e.target)) return;
      if (selectedHeaderIds.length > 0) return;
      if (!gridRange) return;
      // Let the execCommand path (Ctrl+C keydown) own the clipboard; this
      // handler only covers the native copy event.
      if (gridCopyHandledRef.current) { gridCopyHandledRef.current = false; return; }
      const matrix = padMatrix(readGridMatrix(gridRange));
      e.preventDefault();
      const cd = e.clipboardData;
      if (cd) {
        cd.setData("text/plain", matrixToTSV(matrix));
        cd.setData("text/html", gridMatrixToHtml(matrix));
        // Build column metadata for the copied range
        const anchorRec = flatRecords[gridRange.r1] ?? records[0];
        const anchorCols = gridColumnsFor(anchorRec);
        const copiedColMetas: ColumnMeta[] = [];
        for (let c = gridRange.c1; c <= gridRange.c2; c++) {
          const col = anchorCols[c];
          if (col) {
            copiedColMetas.push({
              id: col.id,
              title: col.label,
              type: col.type,
              isPrimary: col.isPrimary ?? false,
            });
          } else {
            copiedColMetas.push({ id: "", title: "", type: "text", isPrimary: false });
          }
        }
        const payload: GridClipboardPayload = {
          version: 2,
          sourceBoardId: board.id,
          columns: copiedColMetas,
          rows: matrix,
        };
        try { cd.setData(GRID_MATRIX_MIME, serializeMatrix(payload)); } catch { /* optional */ }
      }
      internalClipboardRef.current = { payload: { version: 2, sourceBoardId: board.id, columns: [], rows: matrix }, raw: [] };
      gridCutRef.current = null;
    };
    const onWindowCut = (e: ClipboardEvent) => {
      if (isEditable(e.target)) return;
      if (selectedHeaderIds.length > 0) return;
      if (!gridRange) return;
      // copyGridRange writes the clipboard itself; just clear the source cells.
      gridCopyHandledRef.current = true;
      e.preventDefault();
      void copyGridRange(gridRange, true);
    };
    window.addEventListener("paste", onWindowPaste);
    window.addEventListener("copy", onWindowCopy);
    window.addEventListener("cut", onWindowCut);
    return () => {
      window.removeEventListener("paste", onWindowPaste);
      window.removeEventListener("copy", onWindowCopy);
      window.removeEventListener("cut", onWindowCut);
    };
  }, [gridAnchor, gridEnd, gridRange, selectedHeaderIds.length, selection.count, doGridPaste, copyGridRange, readGridMatrix]);

  // keep legacy names referenced by UI (replaced by grid actions)
  const copyRow = useCallback(async () => {
    const r = gridRange ?? (gridAnchor ? {r1:gridAnchor.row,r2:gridAnchor.row,c1:gridAnchor.col,c2:gridAnchor.col} : null);
    if (r) await copyGridRange(r);
  }, [gridRange, gridAnchor, copyGridRange]);
  const pasteRow = useCallback(async () => {
    try { const t = await navigator.clipboard.readText(); await doGridPaste(t); } catch {}
  }, [doGridPaste]);

  // -- Keyboard navigation / grid selection ----------------------------------
  const tableRef = useRef<HTMLDivElement>(null);
  const [focusedCell, setFocusedCell] = useState<{ rowIdx: number; colIdx: number } | null>(null);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const selectionTarget = e.target as HTMLElement | null;
    const isEditing = !!selectionTarget?.closest("input:not([type='checkbox']), textarea, [contenteditable='true']");
    if (e.key === "Escape") {
      e.preventDefault();
      selection.deselectAll();
      setGridAnchor(null);
      setGridEnd(null);
      setFocusedCell(null);
      return;
    }
    if (!isEditing && (e.ctrlKey || e.metaKey) && (e.key === "a" || e.key === "A")) {
      e.preventDefault();
      selection.toggleAll(selectableRecordIds);
      return;
    }
    const keyboardTarget = e.target as HTMLElement;
    if (keyboardTarget.tagName === "INPUT" || keyboardTarget.tagName === "TEXTAREA" || keyboardTarget.isContentEditable) return;
    const cur = gridEnd ?? gridAnchor ?? (focusedCell ? { row: focusedCell.rowIdx, col: focusedCell.colIdx } : null);
    if (!cur && !(e.ctrlKey || e.metaKey)) return;
    const maxRow = Math.max(0, flatRecords.length - 1);
    const colsLen = Math.max(1, gridColumnsFor(flatRecords[cur?.row ?? 0] || records[0]).length);
    const maxCol = Math.max(0, colsLen - 1);
    const setSel = (r:number,c:number,extend:boolean) => {
      r = Math.max(0, Math.min(maxRow, r)); c = Math.max(0, Math.min(maxCol, c));
      const next = { row: r, col: c };
      if (extend && gridAnchor) { setGridEnd(next); } else { setGridAnchor(next); setGridEnd(next); }
      setFocusedCell({ rowIdx: r, colIdx: c }); scrollGridCellIntoView(r,c);
    };
    const r = cur?.row ?? 0, c = cur?.col ?? 0;
    const edgeLeft = (_row:number) => 0;
    const edgeRight = (row:number) => Math.max(0, gridColumnsFor(flatRecords[row] || records[0]).length - 1);
    const isEmptyCell = (row:number, col:number) => {
      const rec = flatRecords[row]; const cols = rec ? gridColumnsFor(rec) : []; const cdef = cols[col];
      if (!rec || !cdef) return true;
      return getDisplayValue(rec, cdef).trim() === "";
    };
    const jumpData = (row:number, col:number, dr:number, dc:number, extend:boolean) => {
      let nr=row, nc=col; const stepR = dr===0?0:(dr>0?1:-1), stepC = dc===0?0:(dc>0?1:-1);
      const inB = (rr:number,cc:number)=>rr>=0&&rr<=maxRow&&cc>=0&&cc<=edgeRight(rr);
      const next = (rr:number,cc:number)=>({rr:rr+stepR,cc:cc+stepC});
      if (!inB(nr+stepR,nc+stepC)) return setSel(nr+stepR,nc+stepC,extend);
      let {rr,cc}=next(nr,nc);
      const curEmpty = isEmptyCell(nr,nc);
      if (curEmpty) { while(inB(rr,cc) && isEmptyCell(rr,cc)){ nr=rr; nc=cc; ({rr,cc}=next(rr,cc)); } if(inB(rr,cc)){ nr=rr; nc=cc; ({rr,cc}=next(rr,cc)); while(inB(rr,cc) && !isEmptyCell(rr,cc)){ nr=rr; nc=cc; ({rr,cc}=next(rr,cc)); } } }
      else { if(inB(rr,cc) && !isEmptyCell(rr,cc)){ while(inB(rr,cc) && !isEmptyCell(rr,cc)){ nr=rr; nc=cc; ({rr,cc}=next(rr,cc)); } } else { while(inB(rr,cc) && isEmptyCell(rr,cc)){ nr=rr; nc=cc; ({rr,cc}=next(rr,cc)); } if(inB(rr,cc)){ nr=rr; nc=cc; ({rr,cc}=next(rr,cc)); while(inB(rr,cc) && !isEmptyCell(rr,cc)){ nr=rr; nc=cc; ({rr,cc}=next(rr,cc)); } } } }
      setSel(nr,nc,extend);
    };
    switch (e.key) {
      case "ArrowUp": e.preventDefault(); if(e.ctrlKey||e.metaKey) jumpData(r,c,-1,0,e.shiftKey); else setSel(r-1,c,e.shiftKey); return;
      case "ArrowDown": e.preventDefault(); if(e.ctrlKey||e.metaKey) jumpData(r,c,1,0,e.shiftKey); else setSel(r+1,c,e.shiftKey); return;
      case "ArrowLeft": e.preventDefault(); if(e.ctrlKey||e.metaKey) jumpData(r,c,0,-1,e.shiftKey); else setSel(r,c-1,e.shiftKey); return;
      case "ArrowRight": e.preventDefault(); if(e.ctrlKey||e.metaKey) jumpData(r,c,0,1,e.shiftKey); else setSel(r,c+1,e.shiftKey); return;
      case "PageUp": e.preventDefault(); setSel(r - 20, c, e.shiftKey); return;
      case "PageDown": e.preventDefault(); setSel(r + 20, c, e.shiftKey); return;
      case "Tab": e.preventDefault(); setSel(r, c + (e.shiftKey ? -1 : 1), false); return;
      case "Enter": e.preventDefault(); setSel(r+1,c,false); return;
      case "Home": e.preventDefault(); if (e.ctrlKey||e.metaKey) setSel(0,0,e.shiftKey); else setSel(r,edgeLeft(r),e.shiftKey); return;
      case "End": e.preventDefault(); if (e.ctrlKey||e.metaKey) setSel(maxRow,edgeRight(maxRow),e.shiftKey); else setSel(r,edgeRight(r),e.shiftKey); return;
      case "a": case "A": if (e.ctrlKey||e.metaKey) { e.preventDefault(); selection.toggleAll(selectableRecordIds); } return;
      case "F2": {
        const el = document.querySelector(`[data-grid-row="${r}"][data-grid-col="${c}"]`) as HTMLElement | null;
        const input = el?.querySelector("input,textarea,[contenteditable='true']") as HTMLElement | null;
        if (input) { e.preventDefault(); input.focus(); }
        return;
      }
      case "c": case "C": if (e.ctrlKey||e.metaKey) { const range = gridRange ?? (gridAnchor?{r1:gridAnchor.row,r2:gridAnchor.row,c1:gridAnchor.col,c2:gridAnchor.col}:null); if (range){ e.preventDefault(); gridCopyHandledRef.current = true; void copyGridRange(range,false); } } return;
      case "x": case "X": if (e.ctrlKey||e.metaKey) { const range = gridRange ?? (gridAnchor?{r1:gridAnchor.row,r2:gridAnchor.row,c1:gridAnchor.col,c2:gridAnchor.col}:null); if (range){ e.preventDefault(); gridCopyHandledRef.current = true; void copyGridRange(range,true); } } return;
      case "d": case "D": if (e.ctrlKey||e.metaKey) { e.preventDefault(); if (gridRange) void applyGridFill({r1:gridRange.r1,r2:gridRange.r1,c1:gridRange.c1,c2:gridRange.c2}, gridRange); } return;
      case "r": case "R": if (e.ctrlKey||e.metaKey) { e.preventDefault(); /* fill right: copy first col across range */ if (gridRange){ const {r1,r2,c1,c2}=gridRange; const src=flatRecords[r1]; if(src){ const cols=gridColumnsFor(src); const text=Array.from({length:r2-r1+1},()=>Array.from({length:c2-c1+1},(_,j)=>getDisplayValue(src,cols[c1])).join("\t")).join("\n"); const pa=gridAnchor,pe=gridEnd; setGridAnchor({row:r1,col:c1}); setGridEnd({row:r2,col:c2}); void doGridPaste(text).then(()=>{setGridAnchor(pa??{row:r1,col:c1}); setGridEnd(pe??{row:r2,col:c2});}); } } } return;
      case "z": case "Z": if (e.ctrlKey||e.metaKey) { e.preventDefault(); if (e.shiftKey) void redoGrid(); else void undoGrid(); } return;
      case "y": case "Y": if (e.ctrlKey||e.metaKey) { e.preventDefault(); void redoGrid(); } return;
      case "Delete": case "Backspace": { const range = gridRange ?? (gridAnchor?{r1:gridAnchor.row,r2:gridAnchor.row,c1:gridAnchor.col,c2:gridAnchor.col}:null); if (range){ e.preventDefault(); void clearGridRange(range); } return; }
      case "Escape": gridCutRef.current=null; setGridCtx(null); setGridAnchor(null); setGridEnd(null); setFocusedCell(null); return;
      case " ": if (cur) { e.preventDefault(); const rec = flatRecords[r]; if (rec) selection.toggle(rec.id); } return;
    }
    // Type-to-edit: printable character enters edit on focused cell
    if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1 && cur) {
      const el = document.querySelector(`[data-grid-row="${r}"][data-grid-col="${c}"]`) as HTMLElement | null;
      const input = el?.querySelector("input:not([type='checkbox']),textarea,[contenteditable='true']") as HTMLInputElement | HTMLTextAreaElement | null;
      if (input) {
        e.preventDefault();
        input.focus();
        try { const native = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set || Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set; native?.call(input, e.key); input.dispatchEvent(new Event("input", { bubbles: true })); } catch { /* best effort */ }
      }
    }
  }, [gridAnchor, gridEnd, gridRange, focusedCell, flatRecords, selectableRecordIds, gridColumnsFor, records, scrollGridCellIntoView, applyGridFill, undoGrid, redoGrid, clearGridRange, copyGridRange, selection, getDisplayValue, doGridPaste]);

  const columnWidthsList = useMemo(() => {
    const widths = [`${ROW_CHECKBOX_WIDTH}px`];
    for (const col of visibleColumns) {
      if (collapsedColumns.has(col.id)) {
        widths.push("10px");
      } else {
        widths.push(`${getColumnWidth(col, columnWidths)}px`);
      }
    }
    if (showLastEdited) widths.push("190px");
    return widths.join(" ");
  }, [visibleColumns, columnWidths, collapsedColumns, showLastEdited]);

  const getRowWidths = useCallback((rowColumns: ColumnDefinition[]) => {
    return [
      `${ROW_CHECKBOX_WIDTH}px`,
      ...rowColumns.map((column) =>
        collapsedColumns.has(column.id) ? "10px" : `${getColumnWidth(column, columnWidths)}px`,
      ),
      ...(showLastEdited ? ["190px"] : []),
    ].join(" ");
  }, [collapsedColumns, columnWidths, showLastEdited]);

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

  useEffect(() => {
    const up = () => {
      if (gridFillRef.current.active && gridFillRef.current.source) {
        const s = gridFillRef.current.source;
        const end = gridEnd ?? gridAnchor;
        if (end) void applyGridFill(s, { r1: s.r1, c1: s.c1, r2: Math.max(s.r2, end.row), c2: Math.max(s.c2, end.col) });
        gridFillRef.current = { active: false, source: null };
      }
      gridSelectingRef.current = false; setGridDragSelecting(false);
    };
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, [gridAnchor, gridEnd, applyGridFill]);
  useEffect(() => {
    if (!gridCtx) return;
    const close = () => setGridCtx(null); // close grid ctx
    window.addEventListener('mousedown', close);
    window.addEventListener('scroll', close, true);
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('scroll', close, true); };
  }, [gridCtx]);

  // (legacy keyboard listener removed; grid keyboard handled via container onKeyDown)
  useEffect(() => { setGridAnchor(null); setGridEnd(null); }, [activeFilters.size, activeSortColumnId, activeSortDirection, collapsedGroups.size]);

  // Flat list of every visual row (group headers + records + add-row),
  // honouring collapsed groups. Only the slice inside the viewport is rendered.
  const allRows = useMemo(() => {
    return groupedRecords.flatMap((entry) => {
      const isCollapsed = collapsedGroups.has(entry.groupId ?? "null");
      if (isCollapsed) return [];
      // Group header + records + add-row button
      const headerHeight = entry.group
        ? entry.group.columnMode === "custom"
          ? GROUP_HEADER_HEIGHT + 36
          : GROUP_HEADER_HEIGHT
        : 0;
      const addRowHeight = ROW_HEIGHT;
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

  // Keep grid selection/focus visible in virtualized list
  useEffect(() => {
    const r = gridEnd?.row ?? gridAnchor?.row;
    if (r == null) return;
    const rec = flatRecords[r];
    if (!rec) return;
    const vIdx = allRows.findIndex((it) => it.type === "row" && it.record?.id === rec.id);
    if (vIdx >= 0) rowVirtualizer.scrollToIndex(vIdx, { align: "auto" });
  }, [gridAnchor?.row, gridEnd?.row, flatRecords, allRows, rowVirtualizer]);

  // ── Scroll a newly created group into view ─────────────
  const [pendingScrollGroupId, setPendingScrollGroupId] = useState<string | null>(null);

  useEffect(() => {
    if (!pendingScrollGroupId) return;
    const index = allRows.findIndex(
      (r) => r.type === "header" && r.groupId === pendingScrollGroupId,
    );
    if (index >= 0) {
      rowVirtualizer.scrollToIndex(index, { align: "end" });
      setPendingScrollGroupId(null);
    }
  }, [pendingScrollGroupId, allRows, rowVirtualizer]);

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
          {!allRecordsSelected && (
            <button
              type="button"
              className="text-xs font-medium text-primary hover:underline"
              onClick={() => selection.selectAll(selectableRecordIds)}
            >
              Select all {selectableRecordIds.length} items
            </button>
          )}
          {recordTotal != null && recordTotal > selectableRecordIds.length && (
            <button
              type="button"
              className="text-xs text-muted-foreground"
              onClick={() => selection.selectAll(selectableRecordIds)}
            >
              Select all {recordTotal} items in this board
            </button>
          )}
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
            <Button
              variant="ghost"
              size="sm"
              disabled={selection.count !== 1}
              onClick={copyRow}
            >
              Copy row
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={selection.count !== 1}
              onClick={pasteRow}
            >
              Paste
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

      {/* Empty state panel — shown only when there is no data at all.
          The full table shell (toolbar + headers + group controls) is always
          rendered by the parent BoardLayout, so a zero-row board is never
          blank. */}
      {hasAnyData && hasColumnLayout ? (
        <div
          ref={tableRef}
          className={cn("board-table min-h-0 flex-1 overflow-auto", gridDragSelecting && "select-none")}
          tabIndex={0}
          role="grid"
          onKeyDown={handleKeyDown}
          aria-label={`${board.name} table`}
          onScroll={handleScroll}
          onMouseDown={(e)=>{ if (gridCtx && e.button===0) setGridCtx(null); }}
          onContextMenu={(e)=>{
            const t = e.target as HTMLElement;
            if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable) return;
            const cell = t.closest("[data-grid-row][data-grid-col]") as HTMLElement | null;
            if (!cell) return;
            e.preventDefault();
            const r = Number(cell.dataset.gridRow), c = Number(cell.dataset.gridCol);
            if (Number.isFinite(r) && Number.isFinite(c)) {
              if (!gridRange || r < gridRange.r1 || r > gridRange.r2 || c < gridRange.c1 || c > gridRange.c2) {
                setGridAnchor({row:r,col:c}); setGridEnd({row:r,col:c}); setFocusedCell({rowIdx:r,colIdx:c});
              }
              setGridCtx({ x: e.clientX, y: e.clientY, r, c });
            }
          }}
          onMouseMove={(e) => {
            const el = document.elementFromPoint(e.clientX, e.clientY)?.closest?.("[data-grid-row][data-grid-col]") as HTMLElement | null;
            if (!el) return;
            const r = Number(el.dataset.gridRow); const c = Number(el.dataset.gridCol);
            if (!Number.isFinite(r) || !Number.isFinite(c)) return;
            if (gridFillRef.current.active && gridFillRef.current.source) {
              const s = gridFillRef.current.source;
              if (r >= s.r2 || (r >= s.r1 && c >= s.c2)) setGridEnd({ row: Math.max(r, s.r1), col: Math.max(c, s.c1) });
              const sc = tableRef.current; if (sc) { const rect = sc.getBoundingClientRect(); const edge = 40; const step = 30; if (e.clientY < rect.top + edge) sc.scrollTop -= step; else if (e.clientY > rect.bottom - edge) sc.scrollTop += step; if (e.clientX < rect.left + edge) sc.scrollLeft -= step; else if (e.clientX > rect.right - edge) sc.scrollLeft += step; }
              return;
            }
            if (!gridSelectingRef.current) return;
            setGridEnd({ row: r, col: c });
            const sc = tableRef.current; if (!sc) return;
            const rect = sc.getBoundingClientRect(); const edge = 40; const step = 30;
            if (e.clientY < rect.top + edge) sc.scrollTop -= step; else if (e.clientY > rect.bottom - edge) sc.scrollTop += step;
            if (e.clientX < rect.left + edge) sc.scrollLeft -= step; else if (e.clientX > rect.right - edge) sc.scrollLeft += step;
          }}
          onMouseUp={() => {
            if (gridFillRef.current.active && gridFillRef.current.source && gridRange) {
              const s = gridFillRef.current.source;
              const t = { r1: s.r1, c1: s.c1, r2: Math.max(s.r2, gridRange.r2), c2: Math.max(s.c2, gridRange.c2) };
              void applyGridFill(s, t);
              gridFillRef.current = { active: false, source: null };
            }
            gridSelectingRef.current = false; setGridDragSelecting(false);
          }}
          onMouseLeave={() => { /* keep drag; container mouseup ends */ }}
        >
          <div className="min-w-max">
          {/* ── Sticky Header Row ───────────────────────────── */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <div
              className="board-table-header sticky top-0 z-30 grid rounded-none"
              style={{
                gridTemplateColumns: columnWidthsList,
              }}
            >
              {/* Selection checkbox header */}
              <div className="board-table-sticky sticky left-0 z-10 flex items-center justify-center border-r border-[var(--border)] px-2 py-3">
                <input
                  type="checkbox"
                  className="board-table-checkbox"
                  checked={allRecordsSelected}
                  ref={(element) => {
                    if (element) element.indeterminate = selection.isPartiallySelected(selectableRecordIds);
                  }}
                  onChange={() => selection.toggleAll(selectableRecordIds)}
                  aria-label="Select all"
                  title="Select all"
                />
              </div>

                {/* Per-group title column rename dialog */}
                <Dialog
                  open={groupTitleRename !== null}
                  onOpenChange={(open) => {
                    if (!open) setGroupTitleRename(null);
                  }}
                >
                  <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                      <DialogTitle>Rename title column</DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                      <Input
                        value={groupTitleRename?.label ?? ""}
                        onChange={(e) =>
                          setGroupTitleRename((prev) =>
                            prev ? { ...prev, label: e.target.value } : prev,
                          )
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && groupTitleRename) {
                            const trimmed = (e.target as HTMLInputElement).value.trim();
                            if (trimmed) {
                              onUpdateGroupTitleColumnLabel?.(
                                groupTitleRename.groupId,
                                trimmed,
                              );
                            }
                            setGroupTitleRename(null);
                          }
                        }}
                        placeholder="Column label"
                        className="h-7 text-xs"
                      />
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setGroupTitleRename(null)}>
                        Cancel
                      </Button>
                      <Button
                        onClick={() => {
                          if (!groupTitleRename) return;
                          const trimmed = groupTitleRename.label.trim();
                          if (trimmed) {
                            onUpdateGroupTitleColumnLabel?.(
                              groupTitleRename.groupId,
                              trimmed,
                            );
                          }
                          setGroupTitleRename(null);
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
                {visibleColumns.map((column, vColIdx) => {
                  const gridColIdx = visibleColumns.slice(0, vColIdx).filter((c)=>!collapsedColumns.has(c.id)).length;
                  if (collapsedColumns.has(column.id)) {
                    return (
                      <button
                        key={column.id}
                        onClick={() => handleToggleCollapse(column.id)}
                        className="board-table-sticky flex cursor-pointer items-center justify-center border-r border-[var(--border)] hover:bg-[var(--row-hover)]"
                        style={{ width: 10, minWidth: 10 }}
                        aria-label={`Expand ${column.label}`}
                      >
                        <span className="text-[9px] font-bold text-muted-foreground">â‡„</span>
                      </button>
                    );
                  }
                  const headerColumn =
                    column.pinned === true && titleColumnLabel
                      ? { ...column, label: titleColumnLabel }
                      : column;
                  const colSelected = !!gridRange && gridColIdx >= gridRange.c1 && gridColIdx <= gridRange.c2;
                  return (
                    <div key={column.id} className={cn(colSelected && "bg-primary/10")} onClick={(e)=>{ if((e.target as HTMLElement).closest('button,[role="menuitem"],input')) return; if(flatRecords.length){ setGridAnchor({row:0,col:gridColIdx}); setGridEnd({row:flatRecords.length-1,col:gridColIdx}); setFocusedCell({rowIdx:0,colIdx:gridColIdx}); console.log("[grid-selection]", {r1:0,c1:gridColIdx,r2:flatRecords.length-1,c2:gridColIdx}); } }}>
                    <SortableColumnHeaderWrapper
                      column={headerColumn}
                      columns={columns}
                      frozen={column.pinned === true}
                      hidden={column.hidden}
                      width={getColumnWidth(column, columnWidths)}
                      onResize={onColumnResize}
                      onRename={(columnId, label) =>
                        column.pinned === true
                          ? onTitleColumnRename?.(label)
                          : onColumnRename?.(columnId, label)
                      }
                      onDuplicate={onColumnDuplicate}
                      onDuplicateWithValues={onColumnDuplicateWithValues}
                      onToggleHidden={onColumnToggleHidden}
                      onToggleFrozen={onColumnToggleFrozen}
                      onSetPrimary={onColumnSetPrimary}
                      onChangeType={onColumnChangeType}
                      onDelete={handleSingleColumnDelete}
                      selectedColumnIds={selectedHeaderIds}
                      onDeleteColumns={requestDeleteSelectedColumns}
                      canEdit={canEditColumns}
                      onAddColumn={onColumnAdd}
                      sortColumnId={activeSortColumnId}
                      sortDirection={activeSortDirection}
                      onSort={handleSort}
                      onAddDescription={handleAddDescription}
                      onToggleRestrictEditing={handleToggleRestrictEditing}
                      onToggleRestrictView={handleToggleRestrictView}
                      onManageAccess={onColumnManageAccess}
                      members={members}
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
                      deleteLoading={deletingColumnId === column.id}
                      selected={selectedHeaderIds.includes(column.id)}
                      onSelect={handleHeaderSelect}
                      onSelectStart={handleHeaderSelectStart}
                    />
                    </div>
                  );
                })}
                {showLastEdited && (
                  <button
                    type="button"
                    className="board-table-last-edited-header flex items-center border-r border-[var(--border)] px-3 text-xs font-medium text-muted-foreground hover:text-foreground"
                    onClick={() => handleSort("__last_edited__")}
                    title="Sort by last edited"
                  >
                    <span>Last edited</span>
                    <span
                      className="ml-auto px-1 text-muted-foreground hover:text-foreground"
                      onClick={(event) => { event.stopPropagation(); toggleLastEdited(); }}
                      aria-label="Hide Last edited column"
                    >×</span>
                  </button>
                )}
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
                    className="board-table-group flex items-center gap-2 border-l-2 px-4 py-2 text-sm font-semibold"
                    style={{ borderLeftColor: group?.color ?? "#94a3b8", paddingLeft: ROW_CHECKBOX_WIDTH + 16 }}
                  >
                    <input
                      type="checkbox"
                      className="board-table-checkbox"
                      checked={groupRecords.length > 0 && groupRecords.every((record) => selection.isSelected(record.id))}
                      ref={(element) => {
                        if (!element) return;
                        const selectedCount = groupRecords.filter((record) => selection.isSelected(record.id)).length;
                        element.indeterminate = selectedCount > 0 && selectedCount < groupRecords.length;
                      }}
                      onChange={() => {
                        const ids = groupRecords.map((record) => record.id);
                        selection.toggleAll(ids);
                      }}
                      onClick={(event) => event.stopPropagation()}
                      aria-label={`Select all rows in ${group?.name ?? "group"}`}
                      title="Select all"
                    />
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
                    {group!.columnMode === "custom" && (
                      <span className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground" title="This group has its own columns">
                        Custom columns
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
                      onDuplicateGroup={onDuplicateGroup}
                      onUpdateGroupColor={onUpdateGroupColor}
                      onUpdateGroupStatusOptions={onUpdateGroupStatusOptions}
                      onRenameTitleColumn={(groupId) => {
                        const target = groups?.find((g) => g.id === groupId);
                        setGroupTitleRename({
                          groupId,
                          label:
                            target?.titleColumnLabel ??
                            titleColumnLabel ??
                            DEFAULT_TITLE_COLUMN_LABEL,
                        });
                      }}
                      onUpdateGroupColumnMode={onUpdateGroupColumnMode}
                    />
                  </div>
                  {group!.columnMode === "custom" && (
                    <div className="flex items-center gap-0 border-b border-border bg-muted/10 pl-12 text-xs text-muted-foreground">
                      <span className="w-[220px] shrink-0 border-r border-border px-3 py-2 font-medium">
                        {group!.titleColumnLabel ?? titleColumnLabel ?? DEFAULT_TITLE_COLUMN_LABEL}
                      </span>
                      {columns.filter((column) => column.groupId === group!.id && !column.hidden).map((column) => (
                        <span key={column.id} className="min-w-[180px] border-r border-border px-3 py-2">
                          {column.label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            }
            if (item.type === "row" && item.record) {
              const record = item.record;
              const rowColumns = getRowColumns(record);
              const isSelected = selection.isSelected(record.id);
              return (
                <div
                  key={record.id}
                  className={cn(
                    "board-table-row grid transition-colors",
                    !gridRange && focusedCell && flatRecords[focusedCell.rowIdx]?.id === record.id && "ring-1 ring-inset ring-primary/20",
                  )}
                  data-selected={isSelected}
                  style={{ gridTemplateColumns: getRowWidths(rowColumns), ...style }}
                  role="row"
                  aria-selected={isSelected}
                >
                  <div
                    className={cn("board-table-sticky sticky left-0 z-10 flex items-center justify-center border-r border-[var(--border)] px-2 py-3 cursor-pointer", gridRange && (flatIndexById.get(record.id)??-1) >= gridRange.r1 && (flatIndexById.get(record.id)??-1) <= gridRange.r2 && "bg-primary/10")}
                    onClick={(e) => {
                      const gr = flatIndexById.get(record.id);
                      if (gr == null) return;
                      const lc = Math.max(0, gridColumnsFor(record).length - 1);
                      setGridAnchor({ row: gr, col: 0 }); setGridEnd({ row: gr, col: lc });
                      setFocusedCell({ rowIdx: gr, colIdx: 0 });
                      selection.deselectAll();
                    }}
                  >
                    <input
                      type="checkbox"
                      className="board-table-checkbox"
                      checked={isSelected}
                      onChange={() => {}}
                      onClick={(e) => {
                        e.stopPropagation();
                        selection.selectRange(record.id, selectableRecordIds, e.shiftKey);
                      }}
                      aria-label={`Select ${record.title || "Untitled"}`}
                    />
                  </div>
                  {(() => { let gridCol = -1; return rowColumns.map((column, colIdx) => { if (!collapsedColumns.has(column.id)) gridCol++; const gCol = gridCol;
                    if (collapsedColumns.has(column.id)) {
                      return (
                        <div
                        key={`collapsed-${column.id}`}
                          className="board-table-cell flex items-center justify-center"
                          style={{ width: 10, minWidth: 10 }}
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
                    // Every column — including the first — renders and saves
                    // through the exact same cell_values path. No title/primary
                    // special-casing here.
                    const value =
                      cellValues.get(getCellKey(record.id, column.id)) ?? column.defaultValue;
                    const metadata = cellMetadata?.get(getCellKey(record.id, column.id));
                    const hasValue = value !== null && value !== undefined && value !== "";
                    const isComputed = ["formula", "mirror", "rollup", "lookup"].includes(column.type);
                    const changeLabel = isComputed
                      ? "Calculated"
                      : metadata?.source === "import"
                        ? "Import"
                        : metadata?.source === "automation"
                          ? "Automation"
                          : metadata?.changedAt
                            ? `${metadata.approximate ? "Added" : "Edited"} ${formatDateTimeIST(metadata.changedAt)} · ${getUserLabel(metadata.changedBy, members as any) || (membersLoading ? '' : 'Former member')}`
                            : undefined;
                    const gr = flatIndexById.get(record.id) ?? -1;
                    const inRange = gCol >= 0 && isInGridRange(gr, gCol);
                    const isAnchor = !!gridAnchor && gridAnchor.row === gr && gridAnchor.col === gCol;
                    const isFocus = !!gridEnd && gridEnd.row === gr && gridEnd.col === gCol;
                    const isBottomRight = !!gridRange && gr === gridRange.r2 && gCol === gridRange.c2;
                    const cutHere = !!gridCutRef.current && gr >= gridCutRef.current.r1 && gr <= gridCutRef.current.r2 && gCol >= gridCutRef.current.c1 && gCol <= gridCutRef.current.c2;
                    const edgeT = inRange && !!gridRange && gr === gridRange.r1;
                    const edgeB = inRange && !!gridRange && gr === gridRange.r2;
                    const edgeL = inRange && !!gridRange && gCol === gridRange.c1;
                    const edgeR = inRange && !!gridRange && gCol === gridRange.c2;
                    return (
                      <div
                        key={column.id}
                        className={cn(
                          "board-table-cell align-top relative",
                          column.pinned === true && "sticky left-12 z-10 board-table-sticky",
                          wrappedColumns.has(column.id)
                            ? "whitespace-normal break-words"
                            : "whitespace-nowrap",
                          inRange && "bg-primary/10",
                          inRange && edgeT && "shadow-[inset_0_2px_0_0_hsl(var(--primary))]",
                          inRange && edgeB && "shadow-[inset_0_-2px_0_0_hsl(var(--primary))]",
                          inRange && edgeL && "before:absolute before:inset-y-0 before:left-0 before:w-[2px] before:bg-primary before:content-['']",
                          inRange && edgeR && "after:absolute after:inset-y-0 after:right-0 after:w-[2px] after:bg-primary after:content-['']",
                          cutHere && "outline outline-2 outline-dashed outline-primary/70 -outline-offset-1",
                          isAnchor && "ring-2 ring-inset ring-primary",
                        )}
                        data-cell-row={actualIdx}
                        data-cell-col={colIdx}
                        {...(gCol >= 0 ? { "data-grid-row": gr, "data-grid-col": gCol, "data-row": gr, "data-col": gCol } : {})}
                        onMouseDown={(e) => {
                          if (gCol < 0) return;
                          if (gr < 0) return;
                          if ((e as unknown as MouseEvent).shiftKey && gridAnchor) {
                            setGridEnd({ row: gr, col: gCol });
                          } else {
                            setGridAnchor({ row: gr, col: gCol }); setGridEnd({ row: gr, col: gCol });
                          }
                          setFocusedCell({ rowIdx: gr, colIdx: gCol });
                          // Cell selection and header selection are separate
                          // clipboard modes; picking a cell leaves header mode.
                          if (selectedHeaderIds.length) { setSelectedHeaderIds([]); setHeaderAnchorId(null); }
                          selection.deselectAll();
                          gridSelectingRef.current = true; setGridDragSelecting(true);
                        }}
                        onClick={() => { if (gCol >= 0) setFocusedCell({ rowIdx: gr, colIdx: gCol }); }}
                        onDoubleClick={() => {
                          if (gCol < 0) return;
                          const el = document.querySelector(`[data-grid-row="${gr}"][data-grid-col="${gCol}"]`);
                          const input = el?.querySelector("input:not([type='checkbox']),textarea,[contenteditable='true'],button[role='combobox']") as HTMLElement | null;
                          if (input) (input as HTMLElement).focus();
                          else (el as HTMLElement | null)?.querySelector("button, [tabindex]")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
                        }}
                      >
                        <div className="board-table-cell-content">
                        <CellRenderer
                          board={board}
                          column={column}
                          record={record}
                          value={value}
                          readOnly={restrictEditingColumns.has(column.id)}
                          onUpdateColumnLabels={onUpdateColumnLabels}
                          onConfigureMirror={onConfigureMirror}
                          onChange={(nextValue) => {
                            onCellChange?.({ recordId: record.id, columnId: column.id, value: nextValue });
                            return void 0;
                          }}
                        />
                        {hasValue && changeLabel && (
                          <span className="board-cell-change-info" title={metadata?.changedAt ? formatDateTimeIST(metadata.changedAt) : undefined}>
                            {changeLabel}
                          </span>
                        )}
                        </div>
                        {isBottomRight && (
                          <div className="absolute bottom-0 right-0 z-20 size-2 translate-x-1/2 translate-y-1/2 cursor-crosshair border border-background bg-primary" data-fill-handle onMouseDown={(e)=>{ e.preventDefault(); e.stopPropagation(); if(gridRange){ gridFillRef.current={active:true, source:{...gridRange}}; setGridDragSelecting(true);} }} />
                        )}
                      </div>
                    );
                  }); })()}
                  {showLastEdited && (
                    <div className="board-table-cell board-table-last-edited" title={record.lastEditedAt ? formatDateTimeIST(record.lastEditedAt) : undefined}>
                      {record.lastEditedAt ? (
                        <>
                          <span>{formatRelativeIST(record.lastEditedAt)}</span>
                          {(() => {
                            const label = getUserLabel(record.lastEditedBy, members as any);
                            if (!label) {
                              if (membersLoading) return <small>by </small>;
                              return <small>by Former member</small>;
                            }
                            return <small>by {label}</small>;
                          })()}
                        </>
                      ) : <span>Before tracking started</span>}
                    </div>
                  )}
                </div>
              );
            }
            if (item.type === "addRow") {
              return (
                <div
                  key={`add-row-${item.groupId ?? "ungrouped"}`}
                  style={{ ...style, height: ROW_HEIGHT }}
                  className="flex items-center border-b border-border"
                >
                  <button
                    type="button"
                    className="flex h-full items-center gap-2 px-4 text-sm text-muted-foreground hover:text-foreground"
                    style={{ paddingLeft: ROW_CHECKBOX_WIDTH + 16 }}
                    onClick={() => void onNewItem?.(item.groupId)}
                  >
                    <Plus className="size-4" />
                    Add item
                  </button>
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
            <>
              <div
                className="flex items-center gap-2 border-b border-border px-4 py-2 text-xs text-muted-foreground hover:bg-accent/50 cursor-pointer"
                style={{ paddingLeft: ROW_CHECKBOX_WIDTH + 16 }}
                onClick={() => setShowAddGroupPopover(true)}
              >
                <Plus className="size-3.5" />
                <span>Add new group</span>
              </div>
              {showAddGroupPopover && (
                <AddGroupPopover
                  groups={(groups ?? []).map((g) => ({
                    id: g.id,
                    name: g.name ?? (g as { title?: string }).title ?? "Group",
                    color: g.color,
                    columnCount: 0,
                  }))}
                  onConfirm={async (payload) => {
                    const result = await onAddGroup(payload);
                    if (typeof result === "string") {
                      setEditingGroupId(result);
                      setEditingGroupName(payload.title);
                      // Bring the freshly created group into view.
                      setPendingScrollGroupId(result);
                    }
                  }}
                  onClose={() => setShowAddGroupPopover(false)}
                />
              )}
            </>
          )}

          {/* ── Footer with sums for number columns ────────── */}
          {Object.keys(numberColumnSums).length > 0 && (
            <div
              className="grid border-t border-[var(--border)] bg-[var(--surface)]"
              style={{ gridTemplateColumns: columnWidthsList }}
              role="row"
            >
              <div className="flex items-center justify-center border-r border-border px-2 py-2 text-xs font-medium text-muted-foreground">
                Sum
              </div>
              {visibleColumns.map((column) => {
                if (collapsedColumns.has(column.id)) {
                  return <div key={`collapsed-footer-${column.id}`} style={{ width: 10, minWidth: 10 }} />;
                }
                const sum = numberColumnSums[column.id];
                if (sum === undefined) return <div key={`empty-footer-${column.id}`} className="px-4 py-2" />;
                return (
                  <div
                    key={`footer-${column.id}`}
                    className={cn(
                      "px-4 py-2 align-top text-sm font-medium tabular-nums",
                      column.pinned === true && "sticky left-0 z-10 bg-card shadow-sm",
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
      ) : (
        <div className="flex min-h-[400px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card p-6">
              {!hasColumnLayout ? (
                <>
                  <p className="text-sm text-muted-foreground">No columns yet</p>
                  {onColumnAdd && (
                    <Button size="sm" onClick={() => setAddColumnAfterId("end")}>
                      <Plus className="mr-1 size-4" />
                      Add column
                    </Button>
                  )}
                </>
              ) : (
                emptyStateNode
              )}
        </div>
      )}

      {/* Floating bottom selection toolbar */}
      {hasSelection && (
        <div className="flex shrink-0 items-center gap-2 border-t border-border bg-accent/30 px-4 py-2 text-sm">
          <span className="font-medium text-foreground">
             {selection.count} items selected
          </span>
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                Array.from(selection.selectedIds).forEach((id) => {
                  onRowDuplicate?.(id);
                });
                selection.deselectAll();
              }}
            >
              <Copy className="mr-1 size-3.5" />
              Duplicate
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const selectedRecords = flatRecords.filter((record) => selection.selectedIds.has(record.id));
                const exportColumns = allVisibleColumns;
                const escapeCsv = (value: string) => `"${value.replace(/"/g, '""')}"`;
                const header = exportColumns.map((column) => escapeCsv(column.label)).join(",");
                const rows = selectedRecords.map((record) =>
                  exportColumns.map((column) => escapeCsv(getDisplayValue(record, column))).join(","),
                );
                const blob = new Blob(["\uFEFF" + [header, ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = url;
                link.download = `${board.name || "board"}-selected.csv`;
                link.click();
                URL.revokeObjectURL(url);
                selection.deselectAll();
              }}
            >
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
                    onSelect={() => {
                      onMoveToStatus?.(Array.from(selection.selectedIds), status.name);
                      selection.deselectAll();
                    }}
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
                        onSelect={() => {
                          onMoveToGroup?.(Array.from(selection.selectedIds), group.id);
                          selection.deselectAll();
                        }}
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
        loading={bulkArchiveLoading}
      />

      {/* Bulk Delete Confirmation */}
      <ConfirmDialog
        open={bulkAction === "delete"}
        onOpenChange={(open) => !open && setBulkAction(null)}
        title={`Delete ${selection.count} items?`}
        description="This can't be undone"
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => {
          onBulkDelete?.(Array.from(selection.selectedIds));
          selection.clear();
          setBulkAction(null);
        }}
        loading={bulkDeleteLoading}
      />

      <ConfirmDialog
        open={pendingColumnDeleteIds.length > 0}
        onOpenChange={(open) => !open && setPendingColumnDeleteIds([])}
        title="Delete columns"
        description={(() => {
          const pending = pendingColumnDeleteIds
            .map((id) => columns.find((column) => column.id === id))
            .filter(Boolean) as ColumnDefinition[];
          const names = pendingColumnDeleteIds.length <= 3 ? ` (${pending.map((column) => column.label).join(", ")})` : "";
          const includesPrimary = pending.some((column) => column.isPrimary);
          return `Delete ${pendingColumnDeleteIds.length} column${pendingColumnDeleteIds.length === 1 ? "" : "s"}? Their data in this board will be removed.${names}${includesPrimary ? " This removes the item title column." : ""}`;
        })()}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={confirmDeleteSelectedColumns}
      />

      {/* Add Column Picker */}
      <ColumnTypePicker
        open={addColumnAfterId !== null}
        onOpenChange={(open) => !open && setAddColumnAfterId(null)}
        onSelect={(type) => handleAddColumn(type, addColumnAfterId === "end" ? undefined : addColumnAfterId ?? undefined)}
      />

      {gridCtx && (
        <div className="fixed z-50 min-w-[180px] rounded-md border bg-popover p-1 text-sm shadow-md" style={{ left: gridCtx.x, top: gridCtx.y }} onMouseDown={(e)=>e.stopPropagation()} onContextMenu={(e)=>e.preventDefault()}>
          <button className="flex w-full items-center rounded px-2 py-1.5 hover:bg-accent" onClick={async ()=>{ const range=gridRange??{r1:gridCtx.r,r2:gridCtx.r,c1:gridCtx.c,c2:gridCtx.c}; await copyGridRange(range,false); setGridCtx(null); }}>Copy</button>
          <button className="flex w-full items-center rounded px-2 py-1.5 hover:bg-accent" onClick={async ()=>{ const range=gridRange??{r1:gridCtx.r,r2:gridCtx.r,c1:gridCtx.c,c2:gridCtx.c}; await copyGridRange(range,true); setGridCtx(null); }}>Cut</button>
          <button className="flex w-full items-center rounded px-2 py-1.5 hover:bg-accent" onClick={async ()=>{ try{ const t=await navigator.clipboard.readText(); await doGridPaste(t);}catch{} setGridCtx(null); }}>Paste</button>
          <button className="flex w-full items-center rounded px-2 py-1.5 hover:bg-accent" onClick={async ()=>{ const range=gridRange??{r1:gridCtx.r,r2:gridCtx.r,c1:gridCtx.c,c2:gridCtx.c}; await clearGridRange(range); setGridCtx(null); }}>Clear</button>
          <div className="my-1 h-px bg-border" />
          <button className="flex w-full items-center rounded px-2 py-1.5 hover:bg-accent" onClick={async ()=>{ const rec=flatRecords[gridCtx.r]; if(rec&&onNewItem){ await onNewItem(rec.groupId ?? null); toast("Inserted row"); } setGridCtx(null); }}>Insert row above/below</button>
          <button className="flex w-full items-center rounded px-2 py-1.5 text-destructive hover:bg-accent" onClick={()=>{ const ids = gridRange ? Array.from(new Set(flatRecords.slice(gridRange.r1, gridRange.r2+1).map(r=>r.id))) : (flatRecords[gridCtx.r]?[flatRecords[gridCtx.r].id]:[]); if(ids.length){ if(onBulkDelete) onBulkDelete(ids); else ids.forEach(id=>onRowDelete?.(id)); } setGridCtx(null); }}>Delete rows</button>
        </div>
      )}
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
