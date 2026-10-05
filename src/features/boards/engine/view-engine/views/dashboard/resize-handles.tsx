"use client";

/**
 * Dashboard — Resize Handles
 *
 * Provides the 8-direction (4 edges + 4 corners) resize system used by
 * every widget card. The pure helpers (`computeResize`, `snapResize`)
 * are framework-agnostic so they can be unit-tested in isolation.
 */

import { memo, type PointerEvent as ReactPointerEvent } from "react";
import { cn } from "@/lib/utils";
import type { DashboardWidgetInstance } from "./dashboard-types";
import { GRID_COLUMNS } from "./dashboard-types";

export type ResizeDirection = "se";

export interface ResizeState {
  direction: ResizeDirection;
  startW: number;
  startH: number;
  startPx: number;
  startPy: number;
  startClientX: number;
  startClientY: number;
}

export interface ResizeResult {
  w: number;
  h: number;
  x: number;
  y: number;
}

export interface ResizeHandleConfig {
  direction: ResizeDirection;
  position: string;
  cursor: string;
  ariaLabel: string;
}

const HANDLE_SIZE_PX = 16;

export const RESIZE_HANDLES: ResizeHandleConfig[] = [
  {
    direction: "se",
    position: "bottom-1 right-1 size-3 cursor-nwse-resize",
    cursor: "cursor-nwse-resize",
    ariaLabel: "Resize widget",
  },
];

export interface ResizeHandleProps {
  config: ResizeHandleConfig;
  onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>, direction: ResizeDirection) => void;
  visible: boolean;
}

export const ResizeHandle = memo(function ResizeHandle({ config, onPointerDown, visible }: ResizeHandleProps) {
  return (
    <button
      type="button"
      data-resize-handle={config.direction}
      onPointerDown={(e) => onPointerDown(e, config.direction)}
      className={cn(
        "absolute z-10 flex items-center justify-center rounded-sm p-1 text-muted-foreground/60 opacity-0 transition-opacity hover:text-muted-foreground focus:outline-none focus-visible:opacity-100",
        config.cursor,
        config.position,
        visible && "opacity-100",
      )}
      aria-label={config.ariaLabel}
    >
      <svg
        width="10"
        height="10"
        viewBox="0 0 10 10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        className="pointer-events-none"
      >
        <line x1="9" y1="3" x2="3" y2="9" />
        <line x1="9" y1="6" x2="6" y2="9" />
      </svg>
    </button>
  );
});
ResizeHandle.displayName = "ResizeHandle";

export function createResizeState(
  direction: ResizeDirection,
  widget: DashboardWidgetInstance,
  clientX: number,
  clientY: number,
): ResizeState {
  return {
    direction,
    startW: widget.w,
    startH: widget.h,
    startPx: widget.x,
    startPy: widget.y,
    startClientX: clientX,
    startClientY: clientY,
  };
}

export function computeResize(
  state: ResizeState,
  clientX: number,
  clientY: number,
  colWidth: number,
  rowHeight: number,
  minW: number,
  minH: number,
  maxW: number,
  maxH: number,
): ResizeResult {
  if (colWidth === 0 || rowHeight === 0) {
    return { w: state.startW, h: state.startH, x: state.startPx, y: state.startPy };
  }

  const deltaGridX = (clientX - state.startClientX) / colWidth;
  const deltaGridY = (clientY - state.startClientY) / rowHeight;

  const dir = state.direction;
  const hasLeft = dir.includes("w");
  const hasRight = dir.includes("e");
  const hasTop = dir.includes("n");
  const hasBottom = dir.includes("s");

  let w = state.startW;
  let h = state.startH;
  let x = state.startPx;
  let y = state.startPy;

  if (hasRight) {
    w = state.startW + deltaGridX;
  }
  if (hasLeft) {
    w = state.startW - deltaGridX;
    const rightEdgeFixed = state.startPx + state.startW;
    w = Math.min(w, rightEdgeFixed);
    x = rightEdgeFixed - w;
  }
  if (hasBottom) {
    h = state.startH + deltaGridY;
  }
  if (hasTop) {
    h = state.startH - deltaGridY;
    const bottomEdgeFixed = state.startPy + state.startH;
    h = Math.min(h, bottomEdgeFixed);
    y = bottomEdgeFixed - h;
  }

  w = Math.max(minW, Math.min(maxW, w));
  h = Math.max(minH, Math.min(maxH, h));

  if (hasLeft) {
    x = (state.startPx + state.startW) - w;
  }
  if (hasTop) {
    y = (state.startPy + state.startH) - h;
  }

  x = Math.max(0, Math.min(maxW - w, x));
  y = Math.max(0, y);

  return { w, h, x, y };
}

export function snapResize(
  result: ResizeResult,
  minW: number,
  minH: number,
  maxW: number,
  maxH: number,
): ResizeResult {
  const w = Math.max(minW, Math.min(maxW, Math.round(result.w)));
  const h = Math.max(minH, Math.min(maxH, Math.round(result.h)));
  return {
    w,
    h,
    x: Math.max(0, Math.min(maxW - w, Math.round(result.x))),
    y: Math.max(0, Math.round(result.y)),
  };
}

export { HANDLE_SIZE_PX, GRID_COLUMNS };
