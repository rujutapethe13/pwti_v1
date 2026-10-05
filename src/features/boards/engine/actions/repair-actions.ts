"use server";

import { ColumnRepository } from "../repository/column-repository";
import { CellRepository } from "../repository/cell-repository";
import { ColumnService } from "../services/column-service";
import {
  isOptionColumn,
  reconcileDropdownColumnOptions,
} from "../lib/import-export";
import type { ApiResponse } from "@/types";
import type { DropdownOption } from "../types";

const columnRepo = new ColumnRepository();
const cellRepo = new CellRepository();

export interface RepairResult {
  boardId: string;
  columnsChecked: number;
  optionsAdded: number;
  cellsRelinked: number;
}

/**
 * Retroactive fix pass (requirement #3).
 *
 * Scans every status / priority / dropdown column on the board and repairs
 * cells that still hold raw label strings (the pre-fix import bug) instead of
 * option-id foreign keys. For each such column it:
 *
 *  1. Collects every unique raw cell value currently stored.
 *  2. Creates a matching `{ id, label }` option for any value that has no
 *     corresponding option, committing it into the column's `settings.options`
 *     array (the single source of truth).
 *  3. Relinks the affected cells to the resolved option id.
 *
 * The pass is idempotent: cells that already reference a valid option id, and
 * values whose label already exists as an option, are left untouched.
 */
export async function repairDropdownColumnValues(
  boardId: string,
): Promise<ApiResponse<RepairResult>> {
  const columnsResult = await columnRepo.findByBoard(boardId);
  if (columnsResult.error) {
    return {
      data: null,
      error: columnsResult.error,
      status: columnsResult.status,
    };
  }

  const columns = (columnsResult.data ?? []).filter(isOptionColumn);
  let optionsAdded = 0;
  let cellsRelinked = 0;

  for (const column of columns) {
    const cellsResult = await cellRepo.findByColumn(boardId, column.id);
    if (cellsResult.error || !cellsResult.data) continue;

    const cellValues = cellsResult.data.map((c) => ({
      recordId: c.recordId,
      value: c.value,
    }));

    const repair = reconcileDropdownColumnOptions(column, cellValues);

    if (repair.relinks.length > 0) {
      const scope = cellsResult.data[0];
      const payload: Array<Record<string, unknown>> = repair.relinks.map(
        ({ recordId, value }) => ({
          id: `${boardId}:${recordId}:${column.id}`,
          organization_id: scope.organizationId,
          workspace_id: scope.workspaceId,
          board_id: boardId,
          record_id: recordId,
          column_id: column.id,
          value,
          value_text:
            typeof value === "string" ? value : JSON.stringify(value),
        }),
      );
      const upsertResult = await cellRepo.upsertMany(payload);
      if (upsertResult.error) {
        return {
          data: null,
          error: upsertResult.error,
          status: upsertResult.status,
        };
      }
      cellsRelinked += repair.relinks.length;
    }

    if (repair.createdOptionLabels.length > 0) {
      const options = (repair.updatedColumn.settings.options ??
        []) as unknown as DropdownOption[];
      const optsResult = await ColumnService.updateOptions(
        { columnId: column.id, options },
        "system",
      );
      if (optsResult.error) {
        return {
          data: null,
          error: optsResult.error,
          status: optsResult.status,
        };
      }
      optionsAdded += repair.createdOptionLabels.length;
    }
  }

  return {
    data: {
      boardId,
      columnsChecked: columns.length,
      optionsAdded,
      cellsRelinked,
    },
    error: null,
    status: 200,
  };
}
