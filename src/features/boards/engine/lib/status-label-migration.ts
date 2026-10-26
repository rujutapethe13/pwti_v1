"use client";

/**
 * One-time Status label migration — client entry point.
 *
 * The repair itself runs on the server (`repairStatusLabels`). This module
 * only makes sure it happens **once per app load**: the promise is memoized,
 * so the root layout and the board page can both ask for it without the
 * repair running twice. A failed run clears the memo so the next call
 * retries.
 */

import { repairStatusLabels } from "@/features/boards/engine/actions/status-label-migration";
import type { ColumnDefinition } from "../types";

let pending: Promise<ColumnDefinition[] | null> | null = null;

export function runStatusLabelMigration(): Promise<ColumnDefinition[] | null> {
  if (!pending) {
    pending = repairStatusLabels()
      .then((response) => {
        if (response.error) {
          console.warn("[status-label-migration] repair failed:", response.error);
          return null;
        }
        if (response.data) {
          console.warn(
            `[status-label-migration] checked ${response.data.columnsChecked} status column(s), seeded ${response.data.columnsSeeded}, relinked ${response.data.cellsRelinked} cell(s).`,
          );
        }
        return response.data?.columns ?? null;
      })
      .catch((error) => {
        console.error("[status-label-migration] repair failed:", error);
        pending = null;
        return null;
      });
  }
  return pending;
}
