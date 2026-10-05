/**
 * Dashboard Layout Engine
 *
 * Handles react-grid-layout operations:
 * - Adding/removing widgets from layout
 * - Auto-positioning new widgets
 * - Collision detection and resolution
 * - Breakpoint management (lg, md, sm)
 *
 * All operations are pure functions over DashboardLayout.
 * No side effects, no I/O — the result is persisted by DashboardService.
 */

import type { DashboardLayout, GridItem } from "./types";

// ── Default Layout Dimensions ──────────────────────────────

const DEFAULT_WIDGET_WIDTH = 4;
const DEFAULT_WIDGET_HEIGHT = 3;
const GRID_COLUMNS = { lg: 12, md: 10, sm: 6 };
const ROW_HEIGHT = 100; // px

// ── Helper: Add widget to a single breakpoint ──────────────

function addToBreakpoint(
  items: GridItem[],
  widgetId: string,
  width: number,
  height: number,
  columns: number,
): GridItem[] {
  const slot = findFirstAvailableSlot(items, width, columns);
  return [
    ...items,
    {
      i: widgetId,
      x: slot.x,
      y: slot.y,
      w: width,
      h: height,
      minW: 2,
      minH: 2,
    },
  ];
}

// ── Helper: Find first empty slot ──────────────────────────

function findFirstAvailableSlot(
  items: GridItem[],
  width: number,
  columns: number = GRID_COLUMNS.lg,
): { x: number; y: number } {
  const occupied = new Map<string, boolean>();
  for (const item of items) {
    for (let dx = 0; dx < item.w; dx++) {
      for (let dy = 0; dy < item.h; dy++) {
        occupied.set(`${item.x + dx},${item.y + dy}`, true);
      }
    }
  }

  for (let y = 0; y < 100; y++) {
    for (let x = 0; x <= columns - width; x++) {
      let free = true;
      for (let dx = 0; dx < width; dx++) {
        if (occupied.has(`${x + dx},${y}`)) {
          free = false;
          break;
        }
      }
      if (free) return { x, y };
    }
  }

  const maxY = items.reduce((max, item) => Math.max(max, item.y + item.h), 0);
  return { x: 0, y: maxY };
}

// ── Layout Engine ──────────────────────────────────────────

export const LayoutEngine = {
  /**
   * Add a widget to the layout.
   * Auto-positions it at the first available spot (top-left fill).
   */
  addWidget(
    layout: DashboardLayout,
    widgetId: string,
    width = DEFAULT_WIDGET_WIDTH,
    height = DEFAULT_WIDGET_HEIGHT,
  ): DashboardLayout {
    return {
      lg: addToBreakpoint(layout.lg, widgetId, width, height, GRID_COLUMNS.lg),
      md: addToBreakpoint(layout.md, widgetId, width, height, GRID_COLUMNS.md),
      sm: addToBreakpoint(layout.sm, widgetId, width, height, GRID_COLUMNS.sm),
    };
  },

  /**
   * Remove a widget from the layout by its ID.
   */
  removeWidget(layout: DashboardLayout, widgetId: string): DashboardLayout {
    return {
      lg: layout.lg.filter((item) => item.i !== widgetId),
      md: layout.md.filter((item) => item.i !== widgetId),
      sm: layout.sm.filter((item) => item.i !== widgetId),
    };
  },

  /**
   * Update an existing widget's position/size.
   */
  updateWidgetPosition(
    layout: DashboardLayout,
    widgetId: string,
    updates: Partial<GridItem>,
  ): DashboardLayout {
    const update = (items: GridItem[]) =>
      items.map((item) =>
        item.i === widgetId ? { ...item, ...updates } : item,
      );

    return {
      lg: update(layout.lg),
      md: update(layout.md),
      sm: update(layout.sm),
    };
  },

  /**
   * Compact the layout (remove empty rows).
   */
  compact(items: GridItem[], columns: number = GRID_COLUMNS.lg): GridItem[] {
    const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
    const compacted: GridItem[] = [];
    const occupied = new Set<string>();

    for (const item of sorted) {
      let newY = 0;
      let found = false;

      while (!found && newY <= item.y) {
        let canPlace = true;
        for (let dx = 0; dx < item.w; dx++) {
          if (occupied.has(`${item.x + dx},${newY}`)) {
            canPlace = false;
            break;
          }
        }
        if (canPlace) {
          found = true;
        } else {
          newY++;
        }
      }

      const updatedItem = { ...item, y: newY };
      for (let dx = 0; dx < updatedItem.w; dx++) {
        for (let dy = 0; dy < updatedItem.h; dy++) {
          occupied.add(`${updatedItem.x + dx},${updatedItem.y + dy}`);
        }
      }
      compacted.push(updatedItem);
    }

    return compacted;
  },

  /**
   * Validate a layout — check for overlapping items.
   */
  validate(items: GridItem[]): Array<{ item1: string; item2: string }> {
    const overlaps: Array<{ item1: string; item2: string }> = [];

    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i];
        const b = items[j];

        const horizontalOverlap = a.x < b.x + b.w && a.x + a.w > b.x;
        const verticalOverlap = a.y < b.y + b.h && a.y + a.h > b.y;

        if (horizontalOverlap && verticalOverlap) {
          overlaps.push({ item1: a.i, item2: b.i });
        }
      }
    }

    return overlaps;
  },

  /**
   * Get the number of columns for a breakpoint.
   */
  getColumns(breakpoint: keyof typeof GRID_COLUMNS): number {
    return GRID_COLUMNS[breakpoint];
  },

  /**
   * Get the row height in pixels.
   */
  getRowHeight(): number {
    return ROW_HEIGHT;
  },
};
