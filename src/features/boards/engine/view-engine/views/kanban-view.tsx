"use client";

/**
 * Kanban View Renderer
 *
 * A full-featured Kanban board that groups cards by a configurable column
 * (Status, Priority, Department, Assignee, or structural BoardGroup).
 * Uses dnd-kit for drag-and-drop between columns and within columns.
 *
 * ── Data Flow ──────────────────────────────────────────────
 * All writes (drag card, edit inline, create/delete card) go through
 * `onCellChange` → existing CRUD services → Repository → Event Bus.
 * No view mutates records directly.
 * No view queries Supabase directly.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import {
  DndContext,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  Plus,
  Settings,
  Share2,
  Battery,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EmptyState } from "@/components/shared/empty-state";
import { CellRenderer } from "../../components/cell-renderer";
import { groupRecordsByViewGroupBy, type GroupedResult } from "../view-utils";
import { getContrastColor, DEFAULT_COLORS } from "../../components/cell-options-popup";
import { KanbanSettingsPanel } from "./kanban-settings-panel";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import type { ViewRendererProps } from "../view-engine-types";
import type { BoardRecord, ColumnDefinition, ColumnValue, DropdownOption, KanbanViewSettings } from "../../types";

// ── Default status columns ─────────────────────────────────

const DEFAULT_STATUS_COLUMNS = [
  { id: "done", label: "Done", color: "#68C37D" },
  { id: "working-on-it", label: "Working on it", color: "#EBAD54" },
  { id: "stuck", label: "Stuck", color: "#C5434E" },
  { id: "not-started", label: "Not Started", color: "#C4C4C4" },
];

// ── Sortable Card ──────────────────────────────────────────

function KanbanCard({
  record,
  columns,
  cellValues,
  board,
  cardFields,
  showColumnName,
  isDragging,
}: {
  record: BoardRecord;
  columns: ColumnDefinition[];
  cellValues: Map<string, ColumnValue>;
  board: ViewRendererProps["board"];
  cardFields: string[];
  showColumnName: boolean;
  isDragging?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card p-3 shadow-sm transition-all",
        isDragging && "shadow-lg ring-2 ring-primary/20",
      )}
    >
      {/* Card title */}
      <div className="mb-2 text-sm font-medium text-foreground leading-snug">
        {record.title}
      </div>

      {/* Card fields */}
      {cardFields.length > 0 && (
        <div className="space-y-1">
          {cardFields.map((fieldId) => {
            const column = columns.find((c) => c.id === fieldId);
            if (!column) return null;
            const value = cellValues.get(`${record.id}:${column.id}`);
            if (value === null || value === undefined || value === "") return null;
            return (
              <div key={column.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                {showColumnName && (
                  <span className="shrink-0 font-medium">{column.label}:</span>
                )}
                <CellRenderer
                  board={board}
                  column={column}
                  record={record}
                  value={value}
                  readOnly
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Sortable Card Wrapper ──────────────────────────────────

function SortableKanbanCard({
  id,
  record,
  columns,
  cellValues,
  board,
  cardFields,
  showColumnName,
  onCellChange: _onCellChange,
}: {
  id: string;
  record: BoardRecord;
  columns: ColumnDefinition[];
  cellValues: Map<string, ColumnValue>;
  board: ViewRendererProps["board"];
  cardFields: string[];
  showColumnName: boolean;
  onCellChange?: (args: { recordId: string; columnId: string; value: ColumnValue }) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <KanbanCard
        record={record}
        columns={columns}
        cellValues={cellValues}
        board={board}
        cardFields={cardFields}
        showColumnName={showColumnName}
        isDragging={isDragging}
      />
    </div>
  );
}

// ── Kanban Column ──────────────────────────────────────────

function KanbanColumn({
  group,
  columns,
  cellValues,
  board,
  onCellChange,
  onAddCard,
  cardFields,
  showColumnName,
  isCollapsed,
  onToggleCollapse,
}: {
  group: { id: string; label: string; color?: string; count: number; records: BoardRecord[] };
  columns: ColumnDefinition[];
  cellValues: Map<string, ColumnValue>;
  board: ViewRendererProps["board"];
  onCellChange?: (args: { recordId: string; columnId: string; value: ColumnValue }) => void;
  onAddCard?: () => void;
  cardFields: string[];
  showColumnName: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const cardIds = useMemo(() => group.records.map((r) => r.id), [group.records]);

  if (isCollapsed) {
    return (
      <div
        className="flex w-[60px] shrink-0 flex-col rounded-xl border border-border"
        style={{ backgroundColor: group.color || DEFAULT_COLORS[group.label] || undefined }}
      >
        <button
          onClick={onToggleCollapse}
          className="flex flex-col items-center gap-2 p-3 text-xs font-medium hover:text-foreground w-full"
          style={{ color: (group.color || DEFAULT_COLORS[group.label]) ? getContrastColor(group.color || DEFAULT_COLORS[group.label] || "#000000") : undefined }}
        >
          <ChevronRight className="size-3.5" />
          <span className="[writing-mode:vertical-rl] rotate-180">{group.label}</span>
          <span className="text-[9px]">{group.count}</span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex w-[280px] shrink-0 flex-col rounded-xl border border-border bg-muted/30">
      {/* Column header */}
      <div
        className="flex items-center gap-2 border-b border-border px-3 py-2"
        style={{
          backgroundColor: group.color || DEFAULT_COLORS[group.label] || undefined,
          color: (group.color || DEFAULT_COLORS[group.label]) ? getContrastColor(group.color || DEFAULT_COLORS[group.label] || "#000000") : undefined,
        }}
      >
        <button
          onClick={onToggleCollapse}
          className="rounded p-0.5 opacity-80 hover:opacity-100"
        >
          <ChevronDown className="size-3.5" />
        </button>
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="truncate text-xs font-medium">
            {group.label}
          </span>
        </div>
        <Badge
          variant="secondary"
          className="ml-auto text-[8px] px-1.5"
          style={{
            backgroundColor: (group.color || DEFAULT_COLORS[group.label]) ? getContrastColor(group.color || DEFAULT_COLORS[group.label] || "#000000") : undefined,
            color: (group.color || DEFAULT_COLORS[group.label]) ? (group.color || DEFAULT_COLORS[group.label]) : undefined,
          }}
        >
          {group.count}
        </Badge>
      </div>

      {/* Cards */}
      <div className="flex-1 space-y-2 overflow-y-auto p-2">
        <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
          {group.records.map((record) => (
            <SortableKanbanCard
              key={record.id}
              id={record.id}
              record={record}
              columns={columns}
              cellValues={cellValues}
              board={board}
              cardFields={cardFields}
              showColumnName={showColumnName}
              onCellChange={onCellChange}
            />
          ))}
        </SortableContext>
      </div>

      {/* Add card button */}
      {onAddCard && (
        <div className="border-t border-border p-2">
          <button
            onClick={onAddCard}
            className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <Plus className="size-3" />
            Add card
          </button>
        </div>
      )}
    </div>
  );
}

// ── Group Section (for Divide by → Group) ──────────────────

function GroupSection({
  group,
  statusColumns,
  columns,
  statusColumnId,
  cellValues,
  board,
  onCellChange,
  cardFields,
  showColumnName,
  showBattery,
  showEmptyGroups,
  isCollapsed,
  onToggleCollapse,
}: {
  group: { id: string; label: string; color?: string; count: number; records: BoardRecord[] };
  statusColumns: { id: string; label: string; color?: string }[];
  columns: ColumnDefinition[];
  statusColumnId: string;
  cellValues: Map<string, ColumnValue>;
  board: ViewRendererProps["board"];
  onCellChange?: (args: { recordId: string; columnId: string; value: ColumnValue }) => void;
  cardFields: string[];
  showColumnName: boolean;
  showBattery: boolean;
  showEmptyGroups?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const [collapsedStatusCols, setCollapsedStatusCols] = useState<Set<string>>(new Set());

  const toggleStatusCollapse = useCallback((colId: string) => {
    setCollapsedStatusCols((prev) => {
      const next = new Set(prev);
      if (next.has(colId)) {
        next.delete(colId);
      } else {
        next.add(colId);
      }
      return next;
    });
  }, []);

  // Calculate progress for battery display
  const doneCount = group.records.filter((r) => {
    const val = cellValues.get(`${r.id}:${statusColumnId}`);
    return String(val).toLowerCase() === "done";
  }).length;
  const progress = group.count > 0 ? Math.round((doneCount / group.count) * 100) : 0;

  if (isCollapsed) {
    return (
      <div
        className="shrink-0 rounded-xl border border-border"
        style={{ backgroundColor: group.color || DEFAULT_COLORS[group.label] || undefined }}
      >
        <button
          onClick={onToggleCollapse}
          className="flex items-center gap-2 p-3 text-xs font-medium hover:text-foreground w-full"
          style={{ color: (group.color || DEFAULT_COLORS[group.label]) ? getContrastColor(group.color || DEFAULT_COLORS[group.label] || "#000000") : undefined }}
        >
          <ChevronRight className="size-3.5" />
          <span>{group.label}</span>
          <Badge
            variant="secondary"
            className="ml-auto text-[9px] px-1.5"
            style={{
              backgroundColor: (group.color || DEFAULT_COLORS[group.label]) ? getContrastColor(group.color || DEFAULT_COLORS[group.label] || "#000000") : undefined,
              color: (group.color || DEFAULT_COLORS[group.label]) ? (group.color || DEFAULT_COLORS[group.label]) : undefined,
            }}
          >
            {group.count}
          </Badge>
        </button>
      </div>
    );
  }

  return (
    <div className="shrink-0 flex flex-col rounded-xl border border-border bg-card gap-4">
      {/* Group header */}
      <div
        className="flex items-center gap-2 border-b border-border px-3 py-2"
        style={{
          backgroundColor: group.color || DEFAULT_COLORS[group.label] || undefined,
          color: (group.color || DEFAULT_COLORS[group.label]) ? getContrastColor(group.color || DEFAULT_COLORS[group.label] || "#000000") : undefined,
        }}
      >
        <button
          onClick={onToggleCollapse}
          className="rounded p-0.5 opacity-80 hover:opacity-100"
        >
          <ChevronDown className="size-3.5" />
        </button>
        <span className="text-xs font-medium">{group.label}</span>
        <Badge
          variant="secondary"
          className="ml-1 text-[8px] px-1.5"
          style={{
            backgroundColor: (group.color || DEFAULT_COLORS[group.label]) ? getContrastColor(group.color || DEFAULT_COLORS[group.label] || "#000000") : undefined,
            color: (group.color || DEFAULT_COLORS[group.label]) ? (group.color || DEFAULT_COLORS[group.label]) : undefined,
          }}
        >
          {group.count}
        </Badge>
        {showBattery && (
          <div className="ml-auto flex items-center gap-1.5">
            <Battery className="size-3 text-muted-foreground" />
            <div className="h-1.5 w-12 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-[8px] text-muted-foreground">{progress}%</span>
          </div>
        )}
      </div>

      {/* Status columns under group */}
      <div className="flex gap-3 overflow-x-auto px-3 pb-3">
        {statusColumns.map((statusCol, index) => {
          const statusRecords = group.records.filter((r) => {
            const val = cellValues.get(`${r.id}:${statusColumnId}`);
            return String(val) === statusCol.id;
          });
          if (statusRecords.length === 0 && !showEmptyGroups) return null;
          const isColCollapsed = collapsedStatusCols.has(statusCol.id);
          const cardIds = statusRecords.map((r) => r.id);

          return (
            <div
              key={String(statusCol.id ?? statusCol.label ?? `status-${index}`)}
              className={cn(
                "flex flex-col rounded-lg border border-border bg-muted/20",
                isColCollapsed ? "w-[40px]" : "w-[220px]",
              )}
            >
              {/* Status column header */}
              <div
                className="flex items-center gap-1.5 border-b border-border px-2 py-1.5"
                style={{
                  backgroundColor: statusCol.color || DEFAULT_COLORS[statusCol.label] || undefined,
                  color: (statusCol.color || DEFAULT_COLORS[statusCol.label]) ? getContrastColor(statusCol.color || DEFAULT_COLORS[statusCol.label] || "#000000") : undefined,
                }}
              >
                <button
                  onClick={() => toggleStatusCollapse(statusCol.id)}
                  className="rounded p-0.5 opacity-80 hover:opacity-100"
                >
                  {isColCollapsed ? (
                    <ChevronRight className="size-3" />
                  ) : (
                    <ChevronDown className="size-3" />
                  )}
                </button>
                {!isColCollapsed && (
                  <span className="truncate text-[10px] font-medium">
                    {statusCol.label}
                  </span>
                )}
                <Badge
                  variant="secondary"
                  className="ml-auto text-[8px] px-1"
                  style={{
                    backgroundColor: (statusCol.color || DEFAULT_COLORS[statusCol.label]) ? getContrastColor(statusCol.color || DEFAULT_COLORS[statusCol.label] || "#000000") : undefined,
                    color: (statusCol.color || DEFAULT_COLORS[statusCol.label]) ? (statusCol.color || DEFAULT_COLORS[statusCol.label]) : undefined,
                  }}
                >
                  {statusRecords.length}
                </Badge>
              </div>

              {/* Cards */}
              {!isColCollapsed && (
                <div className="flex-1 space-y-2 overflow-y-auto p-2">
                  <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
                    {statusRecords.map((record) => (
                      <SortableKanbanCard
                        key={record.id}
                        id={record.id}
                        record={record}
                        columns={columns}
                        cellValues={cellValues}
                        board={board}
                        cardFields={cardFields}
                        showColumnName={showColumnName}
                        onCellChange={onCellChange}
                      />
                    ))}
                  </SortableContext>
                  {statusRecords.length === 0 && (
                    <div className="flex items-center justify-center py-5 text-[9px] text-muted-foreground">
                      No cards
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Status Section (for Divide by → Status with secondary Group) ──

function StatusSection({
  status,
  statusColumnId,
  boardGroups,
  records,
  cellValues,
  columns,
  board,
  onCellChange,
  cardFields,
  showColumnName,
  showBattery,
  isCollapsed,
  onToggleCollapse,
}: {
  status: { id: string; label: string; color?: string };
  statusColumnId: string;
  boardGroups: Array<{ id: string; label: string; color?: string }>;
  records: BoardRecord[];
  cellValues: Map<string, ColumnValue>;
  columns: ColumnDefinition[];
  board: ViewRendererProps["board"];
  onCellChange?: (args: { recordId: string; columnId: string; value: ColumnValue }) => void;
  cardFields: string[];
  showColumnName: boolean;
  showBattery: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const [collapsedGroupCols, setCollapsedGroupCols] = useState<Set<string>>(new Set());

  const toggleGroupCollapse = useCallback((groupId: string) => {
    setCollapsedGroupCols((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, []);

  const statusRecords = records.filter((r) => {
    const val = cellValues.get(`${r.id}:${statusColumnId}`);
    return String(val) === status.id;
  });

  const doneCount = statusRecords.filter((r) => {
    const val = cellValues.get(`${r.id}:${statusColumnId}`);
    return String(val).toLowerCase() === "done";
  }).length;
  const progress = statusRecords.length > 0 ? Math.round((doneCount / statusRecords.length) * 100) : 0;

  if (isCollapsed) {
    return (
      <div
        className="shrink-0 rounded-xl border border-border"
        style={{ backgroundColor: status.color || DEFAULT_COLORS[status.label] || undefined }}
      >
        <button
          onClick={onToggleCollapse}
          className="flex items-center gap-2 p-3 text-xs font-medium hover:text-foreground w-full"
          style={{ color: (status.color || DEFAULT_COLORS[status.label]) ? getContrastColor(status.color || DEFAULT_COLORS[status.label] || "#000000") : undefined }}
        >
          <ChevronRight className="size-3.5" />
          <span>{status.label}</span>
          <Badge
            variant="secondary"
            className="ml-auto text-[9px] px-1.5"
            style={{
              backgroundColor: (status.color || DEFAULT_COLORS[status.label]) ? getContrastColor(status.color || DEFAULT_COLORS[status.label] || "#000000") : undefined,
              color: (status.color || DEFAULT_COLORS[status.label]) ? (status.color || DEFAULT_COLORS[status.label]) : undefined,
            }}
          >
            {statusRecords.length}
          </Badge>
        </button>
      </div>
    );
  }

  return (
    <div className="shrink-0 flex flex-col rounded-xl border border-border bg-card gap-4">
      {/* Status header */}
      <div
        className="flex items-center gap-2 border-b border-border px-3 py-2"
        style={{
          backgroundColor: status.color || DEFAULT_COLORS[status.label] || undefined,
          color: (status.color || DEFAULT_COLORS[status.label]) ? getContrastColor(status.color || DEFAULT_COLORS[status.label] || "#000000") : undefined,
        }}
      >
        <button
          onClick={onToggleCollapse}
          className="rounded p-0.5 opacity-80 hover:opacity-100"
        >
          <ChevronDown className="size-3.5" />
        </button>
        <span className="text-xs font-medium">{status.label}</span>
        <Badge
          variant="secondary"
          className="ml-1 text-[8px] px-1.5"
          style={{
            backgroundColor: (status.color || DEFAULT_COLORS[status.label]) ? getContrastColor(status.color || DEFAULT_COLORS[status.label] || "#000000") : undefined,
            color: (status.color || DEFAULT_COLORS[status.label]) ? (status.color || DEFAULT_COLORS[status.label]) : undefined,
          }}
        >
          {statusRecords.length}
        </Badge>
        {showBattery && (
          <div className="ml-auto flex items-center gap-1.5">
            <Battery className="size-3 text-muted-foreground" />
            <div className="h-1.5 w-12 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-[8px] text-muted-foreground">{progress}%</span>
          </div>
        )}
      </div>

      {/* Group columns under status */}
      <div className="flex gap-3 overflow-x-auto px-3 pb-3">
        {boardGroups.map((group, index) => {
          const groupRecords = statusRecords.filter((r) => r.groupId === group.id);
          const isColCollapsed = collapsedGroupCols.has(group.id);
          const cardIds = groupRecords.map((r) => r.id);

          return (
            <div
              key={String(group.id ?? group.label ?? `group-${index}`)}
              className={cn(
                "flex flex-col rounded-lg border border-border bg-muted/20",
                isColCollapsed ? "w-[40px]" : "w-[220px]",
              )}
            >
              {/* Group column header */}
              <div
                className="flex items-center gap-1.5 border-b border-border px-2 py-1.5"
                style={{
                  backgroundColor: group.color || DEFAULT_COLORS[group.label] || undefined,
                  color: (group.color || DEFAULT_COLORS[group.label]) ? getContrastColor(group.color || DEFAULT_COLORS[group.label] || "#000000") : undefined,
                }}
              >
                <button
                  onClick={() => toggleGroupCollapse(group.id)}
                  className="rounded p-0.5 opacity-80 hover:opacity-100"
                >
                  {isColCollapsed ? (
                    <ChevronRight className="size-3" />
                  ) : (
                    <ChevronDown className="size-3" />
                  )}
                </button>
                {!isColCollapsed && (
                  <span className="truncate text-[10px] font-medium">
                    {group.label}
                  </span>
                )}
                <Badge
                  variant="secondary"
                  className="ml-auto text-[8px] px-1"
                  style={{
                    backgroundColor: (group.color || DEFAULT_COLORS[group.label]) ? getContrastColor(group.color || DEFAULT_COLORS[group.label] || "#000000") : undefined,
                    color: (group.color || DEFAULT_COLORS[group.label]) ? (group.color || DEFAULT_COLORS[group.label]) : undefined,
                  }}
                >
                  {groupRecords.length}
                </Badge>
              </div>

              {/* Cards */}
              {!isColCollapsed && (
                <div className="flex-1 space-y-2 overflow-y-auto p-2">
                  <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
                    {groupRecords.map((record) => (
                      <SortableKanbanCard
                        key={record.id}
                        id={record.id}
                        record={record}
                        columns={columns}
                        cellValues={cellValues}
                        board={board}
                        cardFields={cardFields}
                        showColumnName={showColumnName}
                        onCellChange={onCellChange}
                      />
                    ))}
                  </SortableContext>
                  {groupRecords.length === 0 && (
                    <div className="flex items-center justify-center py-5 text-[9px] text-muted-foreground">
                      No cards
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Kanban View ────────────────────────────────────────────

export function KanbanView({
  board,
  view: _view,
  columns,
  records,
  cellValues,
  groups,
  settings,
  onCellChange,
  onSettingsChange,
  isActive: _isActive,
}: ViewRendererProps) {
  const kanbanSettings = settings as KanbanViewSettings;
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set(kanbanSettings.collapsedColumns ?? []),
  );
  const [_activeId, setActiveId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [collapsedDivideGroups, setCollapsedDivideGroups] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor),
  );

  // Normalize divideBy settings (backward compatible with old type/columnId shape)
  const rawDivideBy = (kanbanSettings.divideBy || {}) as Record<string, unknown>;
  const isDivideByEnabled = (rawDivideBy.enabled as boolean) || false;
  const divideByPrimaryType = ((rawDivideBy.primaryType || rawDivideBy.type || "group") as "status" | "group");
  const divideByPrimaryColumnId = ((rawDivideBy.primaryColumnId || rawDivideBy.columnId || "") as string);
  const divideBySecondaryType = (rawDivideBy.secondaryType ?? null) as "status" | "group" | null;
  const divideBySecondaryColumnId = ((rawDivideBy.secondaryColumnId || "") as string);

  // Resolve status columns for display — use the configured group-by column's options
  const groupByColumn = columns.find((c) => c.id === kanbanSettings.groupBy?.columnId);
  const statusColumnOptions = (groupByColumn?.settings?.options as Array<{ id: string; label: string; color: string }>) || [];
  const columnStatusColumns = statusColumnOptions.length > 0
    ? statusColumnOptions
    : DEFAULT_STATUS_COLUMNS;

  // Primary status column and its options
  const primaryStatusColumn = divideByPrimaryType === "status"
    ? columns.find((c) => c.id === divideByPrimaryColumnId)
    : null;
  const primaryStatusOptions = primaryStatusColumn
    ? ((primaryStatusColumn.settings?.options) as Array<{ id: string; label: string; color?: string }>) || []
    : [];
  const primaryStatusColumns = primaryStatusOptions.length > 0
    ? primaryStatusOptions
    : columnStatusColumns;

  // Secondary status column and its options
  const secondaryStatusColumn = divideBySecondaryType === "status"
    ? columns.find((c) => c.id === divideBySecondaryColumnId)
    : null;
  const secondaryStatusOptions = secondaryStatusColumn
    ? ((secondaryStatusColumn.settings?.options) as Array<{ id: string; label: string; color?: string }>) || []
    : [];
  const secondaryStatusColumns = secondaryStatusOptions.length > 0
    ? secondaryStatusOptions
    : columnStatusColumns;

  // Status column used for reading card status values
  const statusColumnForDivide = columns.find((c) => c.type === "status");
  const divideByStatusColumnId = divideByPrimaryType === "status"
    ? (divideByPrimaryColumnId || statusColumnForDivide?.id || "")
    : (statusColumnForDivide?.id || "");

  // Auto-resolve secondary status column when secondary is "status" but no column selected
  const resolvedSecondaryColumnId = divideBySecondaryType === "status"
    ? (divideBySecondaryColumnId || divideByStatusColumnId || statusColumnForDivide?.id || "")
    : divideBySecondaryColumnId;

  // Group records using ViewGroupBy
  const groupedResult = useMemo<GroupedResult>(() => {
    return groupRecordsByViewGroupBy(
      records,
      kanbanSettings.groupBy,
      columns,
      groups.map((g) => ({ id: g.id, name: g.name, color: g.color, order: g.order })),
      cellValues,
      {
        showEmptyGroups: kanbanSettings.showEmptyGroups,
      },
    );
  }, [records, kanbanSettings.groupBy, columns, groups, cellValues, kanbanSettings.showEmptyGroups]);

  // Find which column a record belongs to
  const findGroupForRecord = useCallback(
    (recordId: string): string | null => {
      for (const group of groupedResult.groups) {
        if (group.records.some((r) => r.id === recordId)) {
          return group.id;
        }
      }
      if (groupedResult.ungrouped.some((r) => r.id === recordId)) {
        return "__ungrouped__";
      }
      return null;
    },
    [groupedResult],
  );

  // Handle drag end — update the group-by column value
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over) return;

      const activeRecordId = String(active.id);
      const overRecordId = String(over.id);

      // Find the source and target groups
      const sourceGroupId = findGroupForRecord(activeRecordId);
      const overRecord = records.find((r) => r.id === overRecordId);
      const targetGroupId = overRecord
        ? findGroupForRecord(overRecordId) ?? sourceGroupId
        : sourceGroupId;

      // If dragging to a different group, update the cell value
      if (sourceGroupId !== targetGroupId && kanbanSettings.groupBy?.columnId) {
        const targetLabel = groupedResult.groups.find((g) => g.id === targetGroupId)?.label ?? "";
        onCellChange?.({
          recordId: activeRecordId,
          columnId: kanbanSettings.groupBy.columnId,
          value: targetLabel,
        });
      }

      setActiveId(null);
    },
    [records, groupedResult, kanbanSettings.groupBy, onCellChange, findGroupForRecord],
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);

  const handleDragOver = useCallback((_event: DragOverEvent) => {
    // Handle multi-column drag — reorder between columns
  }, []);

  const toggleCollapse = useCallback(
    (groupId: string) => {
      setCollapsedGroups((prev) => {
        const next = new Set(prev);
        if (next.has(groupId)) {
          next.delete(groupId);
        } else {
          next.add(groupId);
        }
        onSettingsChange?.({ collapsedColumns: Array.from(next) });
        return next;
      });
    },
    [onSettingsChange],
  );

  const toggleDivideGroupCollapse = useCallback((groupId: string) => {
    setCollapsedDivideGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, []);

  // Get board groups for "Divide by → Group" mode
  const boardGroupsForDivide = useMemo(() => {
    const raw = groups.length > 0
      ? groups.map((g) => ({
          id: g.id,
          label: g.name,
          color: g.color,
          count: records.filter((r) => r.groupId === g.id).length,
          records: records.filter((r) => r.groupId === g.id),
          statusOptions: g.statusOptions,
        }))
      : [];
    return kanbanSettings.showEmptyGroups ? raw : raw.filter((g) => g.count > 0);
  }, [groups, records, kanbanSettings.showEmptyGroups]);

  // ── Empty state ──────────────────────────────────────────
  if (records.length === 0) {
    return (
      <div className="flex min-h-[400px] items-center justify-center rounded-xl border border-dashed border-border bg-card p-12">
        <EmptyState
          title="No records yet"
          description="Create a record to start using the Kanban view."
          compact
        />
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────
  const allGroups = [
    ...groupedResult.groups,
    ...(groupedResult.ungrouped.length > 0
      ? [{ id: "__ungrouped__", label: "No value", count: groupedResult.ungrouped.length, records: groupedResult.ungrouped, color: undefined }]
      : []),
  ];

  return (
    <div className={cn(
      "flex overflow-hidden rounded-xl border border-border bg-card shadow-sm",
      showSettings && "divide-x divide-border",
    )}>
      {/* Main Kanban area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* ── Kanban Toolbar ───────────────────────────────── */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-2">
          <div className="flex-1" />

          {/* Share */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8" aria-label="Share">
                <Share2 className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Share</TooltipContent>
          </Tooltip>

          {/* Overflow menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8" aria-label="More options">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem>Export</DropdownMenuItem>
              <DropdownMenuItem>Board settings</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Settings gear */}
          <Button
            variant="ghost"
            size="icon"
            className={cn("size-8", showSettings && "bg-muted text-foreground")}
            aria-label="Settings"
            onClick={() => setShowSettings(!showSettings)}
          >
            <Settings className="size-4" />
          </Button>
        </div>

        {/* ── Kanban Content ───────────────────────────────── */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragOver={handleDragOver}
        >
          <div
            ref={scrollRef}
            className="flex-1 overflow-x-auto p-4"
            style={{ minHeight: 400 }}
          >
            {isDivideByEnabled ? (
              /* ── Divide by layout ─────────────────── */
              divideByPrimaryType === "group" ? (
                <div className="flex flex-col gap-6">
                    {boardGroupsForDivide.map((group, index) => {
                      const statusColumns = divideBySecondaryType === "status"
                        ? secondaryStatusColumns
                        : (groups.find((g) => g.statusOptions && g.statusOptions.length > 0)?.statusOptions ?? columnStatusColumns);
                      const statusColumnId = divideBySecondaryType === "status"
                        ? resolvedSecondaryColumnId
                        : divideByStatusColumnId;

                     return (
                       <GroupSection
                         key={String(group.id ?? group.label ?? `group-${index}`)}
                         group={group}
                         statusColumns={statusColumns}
                         columns={columns}
                         statusColumnId={statusColumnId}
                         cellValues={cellValues}
                         board={board}
                         onCellChange={onCellChange}
                         cardFields={kanbanSettings.cardFields || []}
                         showColumnName={kanbanSettings.showColumnName}
                         showBattery={kanbanSettings.showBattery}
                         showEmptyGroups={kanbanSettings.showEmptyGroups}
                         isCollapsed={collapsedDivideGroups.has(group.id)}
                         onToggleCollapse={() => toggleDivideGroupCollapse(group.id)}
                       />
                     );
                   })}
                </div>
              ) : (
                /* ── Divide by → Status layout ──────── */
                divideBySecondaryType === "group" ? (
                  <div className="flex flex-col gap-6">
                    {primaryStatusColumns.map((statusOpt, index) => {
                      const statusRecords = records.filter((r) => {
                        const val = cellValues.get(`${r.id}:${divideByStatusColumnId}`);
                        return String(val) === statusOpt.id;
                      });
                      if (statusRecords.length === 0 && !kanbanSettings.showEmptyGroups) return null;

                      return (
                        <StatusSection
                          key={String(statusOpt.id ?? statusOpt.label ?? `status-${index}`)}
                          status={statusOpt}
                          statusColumnId={divideByStatusColumnId}
                          boardGroups={boardGroupsForDivide}
                          records={records}
                          cellValues={cellValues}
                          columns={columns}
                          board={board}
                          onCellChange={onCellChange}
                          cardFields={kanbanSettings.cardFields || []}
                          showColumnName={kanbanSettings.showColumnName}
                          showBattery={kanbanSettings.showBattery}
                          isCollapsed={collapsedDivideGroups.has(statusOpt.id)}
                          onToggleCollapse={() => toggleDivideGroupCollapse(statusOpt.id)}
                        />
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex gap-3">
                    {primaryStatusColumns.map((statusOpt, index) => {
                      const statusRecords = records.filter((r) => {
                        const val = cellValues.get(`${r.id}:${divideByStatusColumnId}`);
                        return String(val) === statusOpt.id;
                      });
                      if (statusRecords.length === 0 && !kanbanSettings.showEmptyGroups) return null;

                      return (
                        <div
                          key={String(statusOpt.id ?? statusOpt.label ?? `status-${index}`)}
                          className="flex w-[280px] shrink-0 flex-col rounded-xl border border-border bg-muted/30"
                        >
                          <div
                            className="flex items-center gap-2 border-b border-border px-3 py-2"
                            style={{
                              backgroundColor: statusOpt.color || DEFAULT_COLORS[statusOpt.label] || undefined,
                              color: (statusOpt.color || DEFAULT_COLORS[statusOpt.label]) ? getContrastColor(statusOpt.color || DEFAULT_COLORS[statusOpt.label] || "#000000") : undefined,
                            }}
                          >
                            <span className="truncate text-xs font-medium">
                              {statusOpt.label}
                            </span>
                            <Badge
                              variant="secondary"
                              className="ml-auto text-[8px] px-1.5"
                              style={{
                                backgroundColor: (statusOpt.color || DEFAULT_COLORS[statusOpt.label]) ? getContrastColor(statusOpt.color || DEFAULT_COLORS[statusOpt.label] || "#000000") : undefined,
                                color: (statusOpt.color || DEFAULT_COLORS[statusOpt.label]) ? (statusOpt.color || DEFAULT_COLORS[statusOpt.label]) : undefined,
                              }}
                            >
                              {statusRecords.length}
                            </Badge>
                          </div>
                          <div className="flex-1 space-y-2 overflow-y-auto p-2">
                            {statusRecords.map((record) => (
                              <KanbanCard
                                key={record.id}
                                record={record}
                                columns={columns}
                                cellValues={cellValues}
                                board={board}
                                cardFields={kanbanSettings.cardFields || []}
                                showColumnName={kanbanSettings.showColumnName}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              )
            ) : (
              /* ── Standard Kanban layout ───────────────────── */
              <div className="flex gap-3">
                {allGroups.map((group) => (
                  <KanbanColumn
                    key={group.id}
                    group={group}
                    columns={columns}
                    cellValues={cellValues}
                    board={board}
                    onCellChange={onCellChange}
                    cardFields={kanbanSettings.cardFields || []}
                    showColumnName={kanbanSettings.showColumnName}
                    isCollapsed={collapsedGroups.has(group.id)}
                    onToggleCollapse={() => toggleCollapse(group.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </DndContext>

        {/* Bottom info bar */}
        <div className="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-muted-foreground">
          <span>
            {records.length} record{records.length !== 1 ? "s" : ""}
          </span>
          {kanbanSettings.showCardCount && (
            <span>
              {allGroups.reduce((sum, g) => sum + g.count, 0)} total cards
            </span>
          )}
        </div>
      </div>

      {/* ── Settings Panel ─────────────────────────────────── */}
      {showSettings && (
        <KanbanSettingsPanel
          settings={kanbanSettings}
          columns={columns}
          groups={groups}
          onSettingsChange={onSettingsChange ?? (() => {})}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
