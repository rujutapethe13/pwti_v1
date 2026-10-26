"use server";

/**
 * One-time Status label migration.
 *
 * Background: a Status column stores the labels it offers in
 * `column.settings.labels` and every cell stores the **id** of the label it
 * holds. Columns created before the labels array existed only carried the
 * legacy `settings.options` array, and cells created by older imports still
 * hold the label NAME instead of its id. Both make the board render
 * "Unknown option" or an empty cell.
 *
 * This pass (run once on app load) repairs every Status column:
 *
 *  1. A column whose `settings.labels` is missing or empty gets the four
 *     standard labels (Done / Working on it / Stuck / Not Started). Labels it
 *     already had keep their id — and therefore their cells — intact.
 *  2. A cell that holds a label NAME is relinked to the matching label id.
 *
 * The pass is idempotent: a column that already has a clean labels array and
 * cells that already hold ids are left untouched.
 */

import { ColumnRepository } from "../repository/column-repository";
import { CellRepository } from "../repository/cell-repository";
import { ColumnService } from "../services/column-service";
import {
  buildStatusLabels,
  getColumnOptions,
  normalizeOptions,
  sanitizeLabels,
} from "../lib/option-lookup";
import type { ApiResponse } from "@/types";
import type { ColumnDefinition } from "../types";

const columnRepo = new ColumnRepository();
const cellRepo = new CellRepository();

export interface StatusLabelRepairResult {
  /** Status columns that were inspected. */
  columnsChecked: number;
  /** Columns whose labels array was written (seeded or cleaned). */
  columnsSeeded: number;
  /** Cells that were relinked from a label name to a label id. */
  cellsRelinked: number;
  /** The columns as they now look — the client merges these into its store. */
  columns: ColumnDefinition[];
}

function sameLabels(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export async function repairStatusLabels(): Promise<ApiResponse<StatusLabelRepairResult>> {
  const columnsResult = await columnRepo.findMany({ type: "status" });
  if (columnsResult.error) {
    return { data: null, error: columnsResult.error, status: columnsResult.status };
  }

  const columns = (columnsResult.data ?? []).filter((column) => !column.deletedAt);
  const repaired: ColumnDefinition[] = [];
  let columnsSeeded = 0;
  let cellsRelinked = 0;

  for (const column of columns) {
    const current = getColumnOptions(column);
    const hasLabelsArray = normalizeOptions(column.settings?.labels).length > 0;

    // A column with no labels array at all is seeded with the standard
    // labels; a column that already has one keeps its labels (only cleaned
    // up: no empty names, unique ids).
    const target = hasLabelsArray ? sanitizeLabels(current) : buildStatusLabels(current);

    let live = column;
    // A column without a labels array must always be written, even when the
    // resulting list happens to equal the legacy options array.
    const needsWrite = !hasLabelsArray || !sameLabels(target, current);
    if (needsWrite) {
      const result = await ColumnService.updateLabels(
        { columnId: column.id, labels: target },
        "system",
      );
      if (result.error) {
        console.error(
          `[repairStatusLabels] failed to write labels for column ${column.id}:`,
          result.error,
        );
        continue;
      }
      if (result.data) live = result.data;
      columnsSeeded += 1;
    }

    repaired.push(live);

    // Relink cells that still hold a label name.
    const cellsResult = await cellRepo.findByColumn(column.boardId, column.id);
    if (cellsResult.error || !cellsResult.data) continue;

    const ids = new Set(target.map((option) => option.id));
    const byLabel = new Map(
      target.map((option) => [option.label.toLowerCase(), option] as const),
    );

    for (const cell of cellsResult.data) {
      const value = cell.value;
      if (typeof value !== "string") continue;
      const trimmed = value.trim();
      if (!trimmed) continue;
      if (ids.has(trimmed)) continue;

      const match = byLabel.get(trimmed.toLowerCase());
      if (!match) continue;

      const updateResult = await cellRepo.update(cell.id, {
        value: match.id,
        valueText: match.id,
      });
      if (updateResult.error) {
        console.error(
          `[repairStatusLabels] failed to relink cell ${cell.id}:`,
          updateResult.error,
        );
        continue;
      }
      cellsRelinked += 1;
    }
  }

  return {
    data: {
      columnsChecked: columns.length,
      columnsSeeded,
      cellsRelinked,
      columns: repaired,
    },
    error: null,
    status: 200,
  };
}
