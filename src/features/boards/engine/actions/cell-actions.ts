"use server";

import { updateCellSchema, bulkUpdateCellsSchema, clearCellSchema } from "../schemas/cell-schemas";
import { CellService } from "../services/cell-service";
import type { ApiResponse } from "@/types";
import type { ColumnValue } from "../types";

export async function updateCell(
  organizationId: string,
  workspaceId: string,
  boardId: string,
  recordId: string,
  columnId: string,
  value: ColumnValue,
): Promise<ApiResponse<{ id: string; value: ColumnValue }>> {
  const parsed = updateCellSchema.safeParse({
    organizationId,
    workspaceId,
    boardId,
    recordId,
    columnId,
    value,
  });

  if (!parsed.success) {
    return { data: null, error: "Invalid input", status: 400 };
  }

  return CellService.update(parsed.data, "system");
}

export async function bulkUpdateCells(
  organizationId: string,
  workspaceId: string,
  boardId: string,
  updates: Array<{ recordId: string; columnId: string; value: ColumnValue }>,
): Promise<ApiResponse<null>> {
  const parsed = bulkUpdateCellsSchema.safeParse({
    organizationId,
    workspaceId,
    boardId,
    updates,
  });

  if (!parsed.success) {
    return { data: null, error: "Invalid input", status: 400 };
  }

  return CellService.bulkUpdate(parsed.data, "system");
}

export async function clearCell(
  organizationId: string,
  workspaceId: string,
  boardId: string,
  recordId: string,
  columnId: string,
): Promise<ApiResponse<null>> {
  const parsed = clearCellSchema.safeParse({
    organizationId,
    workspaceId,
    boardId,
    recordId,
    columnId,
  });

  if (!parsed.success) {
    return { data: null, error: "Invalid input", status: 400 };
  }

  return CellService.clear(parsed.data, "system");
}
