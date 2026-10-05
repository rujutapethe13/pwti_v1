"use server";

import { addColumnSchemaWithConnectBoard, renameColumnSchema, duplicateColumnSchema, deleteColumnSchema, reorderColumnsSchema, hideColumnsSchema, freezeColumnSchema, changeColumnTypeSchema, updateColumnOptionsSchema } from "../schemas/column-schemas";
import { ColumnService } from "../services/column-service";
import type { ApiResponse } from "@/types";
import type { ColumnDefinition, MigrationPreview, MigrationResult, DropdownOption } from "../types";

export async function addColumn(formData: FormData): Promise<ApiResponse<ColumnDefinition>> {
  const parsed = addColumnSchemaWithConnectBoard.safeParse({
    organizationId: formData.get("organizationId"),
    workspaceId: formData.get("workspaceId"),
    boardId: formData.get("boardId"),
    key: formData.get("key"),
    label: formData.get("label"),
    description: formData.get("description") || undefined,
    type: formData.get("type"),
    required: formData.get("required") === "true",
    defaultValue: formData.get("defaultValue") ? JSON.parse(formData.get("defaultValue") as string) : undefined,
    settings: formData.get("settings") ? JSON.parse(formData.get("settings") as string) : {},
  });

  if (!parsed.success) {
    return { data: null, error: parsed.error.flatten().fieldErrors as unknown as string, status: 400 };
  }

  return ColumnService.add(parsed.data, "system");
}

export async function renameColumn(columnId: string, label: string): Promise<ApiResponse<ColumnDefinition>> {
  const parsed = renameColumnSchema.safeParse({ columnId, label });
  if (!parsed.success) {
    return { data: null, error: "Invalid input", status: 400 };
  }
  return ColumnService.rename(parsed.data, "system");
}

export async function duplicateColumn(columnId: string): Promise<ApiResponse<ColumnDefinition>> {
  const parsed = duplicateColumnSchema.safeParse({ columnId, includeValues: true });
  if (!parsed.success) {
    return { data: null, error: "Invalid input", status: 400 };
  }
  return ColumnService.duplicate(parsed.data, "system");
}

export async function deleteColumn(columnId: string): Promise<ApiResponse<null>> {
  const parsed = deleteColumnSchema.safeParse({ columnId, cascade: true, permanent: false });
  if (!parsed.success) {
    return { data: null, error: "Invalid input", status: 400 };
  }
  return ColumnService.delete(parsed.data, "system");
}

export async function reorderColumns(boardId: string, columns: Array<{ id: string; order: number }>): Promise<ApiResponse<null>> {
  const parsed = reorderColumnsSchema.safeParse({ boardId, columns });
  if (!parsed.success) {
    return { data: null, error: "Invalid input", status: 400 };
  }
  return ColumnService.reorder(parsed.data, "system");
}

export async function hideColumns(columnIds: string[], hidden: boolean): Promise<ApiResponse<null>> {
  const parsed = hideColumnsSchema.safeParse({ columnIds, hidden });
  if (!parsed.success) {
    return { data: null, error: "Invalid input", status: 400 };
  }
  return ColumnService.hide(parsed.data, "system");
}

export async function freezeColumn(columnId: string, frozen: boolean): Promise<ApiResponse<ColumnDefinition>> {
  const parsed = freezeColumnSchema.safeParse({ columnId, frozen });
  if (!parsed.success) {
    return { data: null, error: "Invalid input", status: 400 };
  }
  return ColumnService.freeze(parsed.data, "system");
}

export async function changeColumnType(columnId: string, newType: string, preview = false): Promise<ApiResponse<MigrationResult | MigrationPreview>> {
  const parsed = changeColumnTypeSchema.safeParse({ columnId, newType, preview });
  if (!parsed.success) {
    return { data: null, error: "Invalid input", status: 400 };
  }
  return ColumnService.changeType(parsed.data, "system");
}

export async function updateColumnOptions(columnId: string, options: DropdownOption[]): Promise<ApiResponse<ColumnDefinition>> {
  const parsed = updateColumnOptionsSchema.safeParse({ columnId, options });
  if (!parsed.success) {
    return { data: null, error: "Invalid input", status: 400 };
  }
  return ColumnService.updateOptions(parsed.data, "system");
}

