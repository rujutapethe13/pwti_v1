"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

import { addColumnSchemaWithConnectBoard, renameColumnSchema, duplicateColumnSchema, deleteColumnSchema, reorderColumnsSchema, hideColumnsSchema, freezeColumnSchema, changeColumnTypeSchema, updateColumnOptionsSchema, deleteBoardColumnsSchema } from "../schemas/column-schemas";
import { ColumnService } from "../services/column-service";
import type { ApiResponse } from "@/types";
import type { ColumnDefinition, MigrationPreview, MigrationResult, DropdownOption } from "../types";
import type { DeleteBoardColumnsInput } from "../schemas/column-schemas";

async function currentActorUserId(): Promise<string> {
  try {
    const client = await createClient(await cookies());
    const { data: { user } } = await client.auth.getUser();
    if (user?.id) return user.id;
  } catch (err) {
    console.error("[column-actions] auth getUser failed:", err);
  }
  return "system";
}

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

export async function deleteColumn(columnId: string, permanent = true): Promise<ApiResponse<null>> {
  const parsed = deleteColumnSchema.safeParse({ columnId, cascade: true, permanent });
  if (!parsed.success) {
    return { data: null, error: "Invalid column ID", status: 400 };
  }
  return ColumnService.delete(parsed.data, await currentActorUserId());
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

export async function deleteBoardColumns(boardId: string, columnIds: string[]): Promise<ApiResponse<null>> {
  const parsed = deleteBoardColumnsSchema.safeParse({ boardId, columnIds });
  if (!parsed.success) {
    return { data: null, error: "Invalid input", status: 400 };
  }
  return ColumnService.deleteBoardColumns(parsed.data, "system");
}

/**
 * Server action wrapper around repository.loadColumnsByBoard.
 *
 * Returns the live columns for a board (soft-deleted excluded) so the import
 * cleanup can compute the delete set from the source of truth instead of
 * stale client-side ids. Safe to call from client components.
 */
export async function loadBoardColumns(boardId: string): Promise<ApiResponse<ColumnDefinition[]>> {
  try {
    const { loadColumnsByBoard } = await import("@/features/boards/engine/repository");
    const columns = await loadColumnsByBoard(boardId);
    return { data: columns, error: null, status: 200 };
  } catch (err) {
    console.error("[column-actions] loadBoardColumns failed:", err);
    return { data: null, error: err instanceof Error ? err.message : "Failed to load columns", status: 500 };
  }
}

