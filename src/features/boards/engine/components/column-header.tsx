"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  GripVertical,
  ArrowUp,
  ArrowDown,
  Lock,
  EyeOff,
  Info,
  Filter,
  ArrowLeftRight,
  Link2,
} from "lucide-react";

import { ColumnContextMenu } from "@/components/shared/column-context-menu";
import { columnTypeRegistry } from "../column-registry";
import type { ColumnDefinition, ColumnTypeKey, ColumnValue } from "../types";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";

// ── Constants ──────────────────────────────────────────────

const MIN_COLUMN_WIDTH = 80;
const MAX_COLUMN_WIDTH = 800;

// ── Props ─────────────────────────────────────────────────

export interface ColumnHeaderProps {
  column: ColumnDefinition;
  frozen: boolean;
  hidden: boolean;
  width: number;
  onResize?: (columnId: string, newWidth: number) => void;
  onDragStart?: () => void;
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
  /** Props for @dnd-kit sortable integration */
  sortableListeners?: Record<string, unknown>;
  sortableAttributes?: Record<string, unknown>;
}

// ── InlineRenameInput ─────────────────────────────────────

function InlineRenameInput({
  initialValue,
  onConfirm,
  onCancel,
}: {
  initialValue: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        e.preventDefault();
        const trimmed = value.trim();
        if (trimmed && trimmed !== initialValue) {
          onConfirm(trimmed);
        } else {
          onCancel();
        }
      } else if (e.key === "Escape") {
        onCancel();
      }
    },
    [value, initialValue, onConfirm, onCancel],
  );

  return (
    <div className="flex items-center gap-1">
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          const trimmed = value.trim();
          if (trimmed && trimmed !== initialValue) {
            onConfirm(trimmed);
          } else {
            onCancel();
          }
        }}
        className="h-7 min-w-0 flex-1 px-1.5 text-xs font-medium"
      />
    </div>
  );
}

// ── ColumnResizer ─────────────────────────────────────────

function ColumnResizer({
  onResizeStart,
}: {
  onResizeStart: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      className="group/resizer absolute right-0 top-0 z-20 h-full w-1.5 cursor-col-resize"
      onMouseDown={onResizeStart}
    >
      <div className="mx-auto h-full w-0.5 rounded-full bg-border opacity-60 transition-opacity group-hover/resizer:opacity-100 group-active/resizer:bg-accent" />
    </div>
  );
}

// ── useColumnResize ───────────────────────────────────────

function useColumnResize(
  columnId: string,
  initialWidth: number,
  onResize?: (columnId: string, newWidth: number) => void,
): {
  width: number;
  resizing: boolean;
  handleResizeStart: (e: React.MouseEvent) => void;
} {
  const [width, setWidth] = useState(initialWidth);
  const [resizing, setResizing] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  // Sync with external width changes
  useEffect(() => {
    setWidth(initialWidth);
  }, [initialWidth]);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      const delta = e.clientX - startXRef.current;
      const newWidth = Math.max(
        MIN_COLUMN_WIDTH,
        Math.min(MAX_COLUMN_WIDTH, startWidthRef.current + delta),
      );
      setWidth(newWidth);
    },
    [],
  );

  const handleMouseUp = useCallback(
    (e: MouseEvent) => {
      const delta = e.clientX - startXRef.current;
      const finalWidth = Math.max(
        MIN_COLUMN_WIDTH,
        Math.min(MAX_COLUMN_WIDTH, startWidthRef.current + delta),
      );
      setResizing(false);
      onResize?.(columnId, finalWidth);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    },
    [columnId, handleMouseMove, onResize],
  );

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      startXRef.current = e.clientX;
      startWidthRef.current = width;
      setResizing(true);
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [width, handleMouseMove, handleMouseUp],
  );

  return { width, resizing, handleResizeStart };
}

// ── ColumnHeader ──────────────────────────────────────────

export function ColumnHeader({
  column,
  frozen,
  hidden,
  width,
  onResize,
  onDragStart,
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
  sortableListeners,
  sortableAttributes,
}: ColumnHeaderProps) {
  const definition = columnTypeRegistry[column.type];
  const { width: currentWidth, resizing, handleResizeStart } = useColumnResize(
    column.id,
    width,
    onResize,
  );

  const [isRenaming, setIsRenaming] = useState(false);

  const isSorted = sortColumnId === column.id;

  const handleSortClick = useCallback(
    (_columnId?: string, direction?: "asc" | "desc") => {
      if (!onSort) return;
      const nextDirection =
        direction ?? (isSorted && sortDirection === "asc" ? "desc" : "asc");
      onSort(column.id, nextDirection);
    },
    [column.id, isSorted, sortDirection, onSort],
  );

  const handleDoubleClick = useCallback(() => {
    setIsRenaming(true);
  }, []);

  const handleRenameConfirm = useCallback(
    (newLabel: string) => {
      setIsRenaming(false);
      onRename?.(column.id, newLabel);
    },
    [column.id, onRename],
  );

  const handleRenameCancel = useCallback(() => {
    setIsRenaming(false);
  }, []);

  return (
    <div
      className={cn(
        "group relative flex items-center gap-1 border-r border-border bg-white px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground overflow-hidden",
        frozen && "sticky left-0 z-10 shadow-sm",
        hidden && "opacity-40",
        resizing && "select-none",
      )}
      style={{ width: currentWidth, minWidth: currentWidth }}
      role="columnheader"
      data-column-id={column.id}
      data-column-type={column.type}
      onDoubleClick={handleDoubleClick}
    >
      <TooltipProvider delayDuration={300}>
      {/* Drag handle */}
      {onDragStart && (
        <button
          type="button"
          className="mr-1 shrink-0 cursor-grab touch-none text-muted-foreground/40 hover:text-muted-foreground"
          onMouseDown={onDragStart}
          {...(sortableListeners || {})}
          {...(sortableAttributes || {})}
        >
          <GripVertical className="size-3" />
        </button>
      )}

      {/* Column type icon */}
      <span
        className="inline-flex size-4 shrink-0 items-center justify-center rounded bg-muted/60 text-[8px] font-bold text-muted-foreground"
        title={definition?.label ?? column.type}
      >
        {column.type === "connected_board" ? (
          <Link2 className="size-3" />
        ) : (
          column.type.charAt(0).toUpperCase()
        )}
      </span>

      {/* Label area */}
      {isRenaming ? (
        <InlineRenameInput
          initialValue={column.label}
          onConfirm={handleRenameConfirm}
          onCancel={handleRenameCancel}
        />
      ) : (
        <button
          type="button"
          onClick={() => handleSortClick()}
          className="flex items-center gap-1 truncate text-left hover:text-foreground"
        >
          <span className="truncate">{column.label}</span>
          {isSorted && sortDirection === "asc" && <ArrowUp className="size-3 shrink-0" />}
          {isSorted && sortDirection === "desc" && <ArrowDown className="size-3 shrink-0" />}
        </button>
      )}

      {/* Description tooltip */}
      {columnDescription && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex size-3.5 shrink-0 cursor-help text-muted-foreground">
              <Info className="size-3.5" />
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p className="max-w-xs text-xs">{columnDescription}</p>
          </TooltipContent>
        </Tooltip>
      )}

      {/* Restrict editing icon */}
      {restrictEditing && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex size-3.5 shrink-0 text-amber-600">
              <Lock className="size-3.5" />
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">Column editing is restricted</p>
          </TooltipContent>
        </Tooltip>
      )}

      {/* Restrict view icon */}
      {restrictView && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex size-3.5 shrink-0 text-red-600">
              <EyeOff className="size-3.5" />
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">Column view is restricted</p>
          </TooltipContent>
        </Tooltip>
      )}

      {/* Filter indicator */}
      {isFiltered && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex size-3.5 shrink-0 text-primary">
              <Filter className="size-3.5" />
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">Filter active</p>
          </TooltipContent>
        </Tooltip>
      )}

      {/* Column menu */}
      <ColumnContextMenu
        column={column}
        onRename={onRename}
        onDuplicate={onDuplicate}
        onDuplicateWithValues={onDuplicateWithValues}
        onToggleHidden={onToggleHidden}
        onToggleFrozen={onToggleFrozen}
        onChangeType={onChangeType}
        onDelete={onDelete}
        onAddColumn={onAddColumn}
        onUpdateColumnSettings={onUpdateColumnSettings}
        onSort={handleSortClick}
        sortColumnId={sortColumnId}
        sortDirection={sortDirection}
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

      {/* Resize handle */}
      <ColumnResizer onResizeStart={handleResizeStart} />
      </TooltipProvider>
    </div>
  );
}

export { useColumnResize };
