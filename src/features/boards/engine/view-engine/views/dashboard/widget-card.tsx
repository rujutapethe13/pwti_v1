"use client";

/**
 * Dashboard — Widget Card (shared chrome for every widget type)
 *
 * Renders a solid, opaque, rounded-rectangle card with:
 *   - title (left, inline-editable)
 *   - filter icon (highlighted blue when a filter is applied)
 *   - ⋮⋮ drag handle (top-left, shown on hover / in edit mode)
 *   - ⋯ three-dot menu (Full size / Rename / Duplicate / Delete / Settings)
 *   - 8 resize handles (4 edges + 4 corners)
 *
 * Drag uses dnd-kit's useSortable. Position + size are expressed in grid
 * units (12 columns) and persisted via onUpdate.
 *
 * Resize uses native HTML5 Pointer Events attached to the document.
 * During drag, the widget grows/shrinks in real-time via local state
 * (floating-point grid units) for smooth visual feedback. On release,
 * values are snapped to grid units and persisted via onUpdate.
 */

import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  Copy,
  Download,
  Filter,
  GripVertical,
  Maximize2,
  MoreVertical,
  Pencil,
  Settings,
  Trash2,
} from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type {
  DashboardWidgetInstance,
  DashboardWidgetType,
} from "./dashboard-types";
import { GRID_COLUMNS } from "./dashboard-types";
import {
  type ResizeDirection,
  type ResizeState,
  type ResizeResult,
  RESIZE_HANDLES,
  ResizeHandle,
  createResizeState,
  computeResize,
  snapResize,
} from "./resize-handles";

export interface WidgetCardProps {
  widget: DashboardWidgetInstance;
  colWidth: number;
  rowHeight: number;
  /** Gap (px) between grid cells — kept on every drag/resize/ reflow. */
  gutter?: number;
  /** Maximum grid columns a widget may occupy (default: 12). */
  maxW?: number;
  /** Maximum grid rows a widget may occupy (default: Infinity). */
  maxH?: number;
  /** True while being dragged so content can suspend expensive updates. */
  isDragging?: boolean;
  /** Shown/behaviour toggles. */
  editable?: boolean;
  filterActive?: boolean;
  selected?: boolean;
  onSelect: (id: string) => void;
  onFullSize: (widget: DashboardWidgetInstance) => void;
  onRename: (id: string, title: string) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
  onOpenSettings: (id: string) => void;
  onFilter: (id: string) => void;
  onExportPng?: (id: string) => void;
  onExportCsv?: (id: string) => void;
  onExportXlsx?: (id: string) => void;
  onUpdate: (id: string, patch: Partial<DashboardWidgetInstance>) => void;
  onResizeEnd?: (id: string) => void;
  children: React.ReactNode;
}

export const WidgetCard = memo(function WidgetCard({
  widget,
  colWidth,
  rowHeight,
  gutter = 0,
  maxW: propMaxW,
  maxH: propMaxH,
  isDragging,
  editable = true,
  filterActive = false,
  selected = false,
  onSelect,
  onFullSize,
  onRename,
  onDuplicate,
  onRemove,
  onOpenSettings,
  onFilter,
  onExportPng,
  onExportCsv,
  onExportXlsx,
  onUpdate,
  onResizeEnd,
  children,
}: WidgetCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isDraggingCtx,
    isSorting,
  } = useSortable({ id: widget.id });

  const dragging = isDragging ?? isDraggingCtx ?? isSorting;

  const half = gutter / 2;
  const stepX = colWidth + gutter;
  const stepY = rowHeight + gutter;

  // ── Local state for smooth real-time resize preview ──────
  // During an interactive resize, the widget dimensions are tracked
  // as floating-point grid units for smooth visual feedback. On
  // release, values are snapped to integer grid units and persisted.
  const [resizeOverride, setResizeOverride] = useState<ResizeResult | null>(null);

  const effective = resizeOverride ?? { w: widget.w, h: widget.h, x: widget.x, y: widget.y };

  const leftPx = effective.x * stepX + half;
  const topPx = effective.y * stepY + half;
  const widthPx = Math.max(colWidth, effective.w * colWidth + (effective.w - 1) * gutter);
  const heightPx = Math.max(rowHeight, effective.h * rowHeight + (effective.h - 1) * gutter);

  const style: React.CSSProperties = {
    left: leftPx,
    top: topPx,
    width: widthPx,
    height: heightPx,
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const minW = widget.minW ?? 2;
  const minH = widget.minH ?? 2;
  const maxW = propMaxW ?? GRID_COLUMNS;
  const maxH = propMaxH ?? Number.POSITIVE_INFINITY;

  // ── Inline rename ────────────────────────────────────────
  const [editing, setEditing] = useState(false);
  const [titleInput, setTitleInput] = useState(widget.title);
  const titleRef = useRef<HTMLInputElement>(null);

  const startRename = () => {
    setTitleInput(widget.title);
    setEditing(true);
  };

  const confirmRename = () => {
    setEditing(false);
    const next = titleInput.trim() || widget.title;
    if (next !== widget.title) onRename(widget.id, next);
  };

  useEffect(() => {
    if (editing && titleRef.current) {
      titleRef.current.focus();
      titleRef.current.select();
    }
  }, [editing]);

  // ── Resize ───────────────────────────────────────────────
  const resizingRef = useRef<ResizeState | null>(null);
  const lastResultRef = useRef<ResizeResult | null>(null);

  const computeCurrent = useCallback(
    (clientX: number, clientY: number): ResizeResult => {
      if (!resizingRef.current || colWidth === 0 || rowHeight === 0) {
        return { w: widget.w, h: widget.h, x: widget.x, y: widget.y };
      }
      return computeResize(
        resizingRef.current,
        clientX,
        clientY,
        colWidth,
        rowHeight,
        minW,
        minH,
        maxW,
        maxH,
      );
    },
    [colWidth, rowHeight, minW, minH, maxW, maxH, widget],
  );

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const result = computeCurrent(e.clientX, e.clientY);
      lastResultRef.current = result;
      setResizeOverride(result);
    },
    [computeCurrent],
  );

  const onPointerUp = useCallback(() => {
    if (!resizingRef.current) return;
    resizingRef.current = null;
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", onPointerUp);

    const last = lastResultRef.current;
    lastResultRef.current = null;
    setResizeOverride(null);

    if (last) {
      const snapped = snapResize(last, minW, minH, maxW, maxH);
      onUpdate(widget.id, { w: snapped.w, h: snapped.h, x: snapped.x, y: snapped.y });
    }
    onResizeEnd?.(widget.id);
  }, [onPointerMove, onResizeEnd, widget.id, onUpdate, minW, minH, maxW, maxH]);

  const handleResizeStart = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>, direction: ResizeDirection) => {
      e.preventDefault();
      e.stopPropagation();
      const state = createResizeState(direction, widget, e.clientX, e.clientY);
      resizingRef.current = state;
      const initial = computeResize(
        state,
        e.clientX,
        e.clientY,
        colWidth,
        rowHeight,
        minW,
        minH,
        maxW,
        maxH,
      );
      lastResultRef.current = initial;
      setResizeOverride(initial);

      const doc = e.currentTarget.ownerDocument as Document;
      doc.addEventListener("pointermove", onPointerMove);
      doc.addEventListener("pointerup", onPointerUp);
    },
    [widget, colWidth, rowHeight, minW, minH, maxW, maxH, onPointerMove, onPointerUp],
  );

  // Cleanup listeners on unmount.
  useEffect(() => {
    return () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
    };
  }, [onPointerMove, onPointerUp]);

  const handlesVisible = editable && selected;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "absolute min-w-0 overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm",
        "focus-within:outline-none",
        dragging && "z-50 shadow-xl",
        "group",
      )}
      data-widget-id={widget.id}
      onClick={() => onSelect(widget.id)}
    >
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between gap-1 border-b border-border bg-card px-2 py-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-1">
          {/* Drag handle (shows on hover) */}
          {editable && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  {...attributes}
                  {...listeners}
                  className="size-5 shrink-0 cursor-grab rounded p-0.5 text-muted-foreground hover:text-muted-foreground hover:bg-muted rounded active:cursor-grabbing"
                  aria-label="Drag widget"
                >
                  <GripVertical className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">Drag to move</TooltipContent>
            </Tooltip>
          )}

          {editing ? (
            <Input
              ref={titleRef}
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              onBlur={confirmRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmRename();
                if (e.key === "Escape") {
                  setEditing(false);
                  setTitleInput(widget.title);
                }
              }}
              className="h-6 w-40 px-1.5 py-0.5 text-sm"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="min-w-0 truncate text-sm font-medium text-foreground" title={widget.title}>
              {widget.title}
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onFilter(widget.id);
                }}
                className={cn(
                  "size-5 shrink-0 rounded p-1 text-muted-foreground hover:bg-muted",
                  filterActive && "text-brand",
                )}
                aria-label={filterActive ? "Filter active" : "Filter"}
              >
                <Filter className="size-3" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">
              {filterActive ? "Filter active" : "No filter applied"}
            </TooltipContent>
          </Tooltip>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                className="size-5 shrink-0 rounded p-1 text-muted-foreground hover:bg-muted"
                aria-label="Widget options"
              >
                <MoreVertical className="size-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem
                className="text-sm"
                onSelect={() => onFullSize(widget)}
              >
                <Maximize2 className="mr-2 size-3.5" />
                Full size
              </DropdownMenuItem>
              <DropdownMenuItem className="text-sm" onSelect={startRename}>
                <Pencil className="mr-2 size-3.5" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-sm"
                onSelect={() => onDuplicate(widget.id)}
              >
                <Copy className="mr-2 size-3.5" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-sm" onSelect={() => onOpenSettings(widget.id)}>
                <Settings className="mr-2 size-3.5" />
                Settings
              </DropdownMenuItem>
              {(onExportPng || onExportCsv || onExportXlsx) && (
                <>
                  <DropdownMenuSeparator />
                  {onExportPng && (
                    <DropdownMenuItem
                      className="text-sm"
                      onSelect={() => onExportPng(widget.id)}
                    >
                      <Download className="mr-2 size-3.5" />
                      Export as PNG
                    </DropdownMenuItem>
                  )}
                  {onExportCsv && (
                    <DropdownMenuItem
                      className="text-sm"
                      onSelect={() => onExportCsv(widget.id)}
                    >
                      <Download className="mr-2 size-3.5" />
                      Export data as CSV
                    </DropdownMenuItem>
                  )}
                  {onExportXlsx && (
                    <DropdownMenuItem
                      className="text-sm"
                      onSelect={() => onExportXlsx(widget.id)}
                    >
                      <Download className="mr-2 size-3.5" />
                      Export data as XLSX
                    </DropdownMenuItem>
                  )}
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-sm text-destructive focus:text-destructive"
                onSelect={() => onRemove(widget.id)}
              >
                <Trash2 className="mr-2 size-3.5" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Content (below header) */}
      <div className="absolute top-8 left-0 right-0 bottom-0 min-w-0 overflow-hidden p-2">{children}</div>

      {/* Resize handles — 4 corners + 4 edges */}
      {editable &&
        RESIZE_HANDLES.map((handle) => (
          <ResizeHandle
            key={handle.direction}
            config={handle}
            onPointerDown={handleResizeStart}
            visible={handlesVisible}
          />
        ))}
    </div>
  );
});

export type { DashboardWidgetType };
