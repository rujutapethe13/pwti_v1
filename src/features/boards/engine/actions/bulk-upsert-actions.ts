"use server";

import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/server";
import type { ApiResponse } from "@/types";
import type { BoardDefinition, BoardRecord, ColumnDefinition, ColumnValue } from "../types";

export async function upsertBoardColumns(
  boardId: string,
  organizationId: string,
  workspaceId: string,
  columns: ColumnDefinition[],
): Promise<ApiResponse<null>> {
  try {
    const supabase = await createServiceClient();

    const payload = columns.map((column) => ({
      id: column.id,
      organization_id: organizationId,
      workspace_id: workspaceId,
      board_id: boardId,
      // Only written when known, so an upsert never clears a column's group
      // membership implicitly.
      ...(column.groupId !== undefined ? { group_id: column.groupId } : {}),
      key: column.key,
      label: column.label,
      description: column.description ?? null,
      type: column.type,
      required: column.required,
      hidden: column.hidden,
      frozen: column.frozen,
      default_value: column.defaultValue,
      settings: column.settings,
      permissions: column.permissions,
      validation: column.validation,
      version: column.version,
      sort_order: column.order,
      created_at: column.createdAt,
      updated_at: column.updatedAt,
    }));

    const { error } = await supabase.from("columns").upsert(payload);

    if (error) {
      return { data: null, error: error.message, status: 500 };
    }

    return { data: null, error: null, status: 200 };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to upsert columns";
    return { data: null, error: message, status: 500 };
  }
}

export async function upsertBoardRecords(
  boardId: string,
  organizationId: string,
  workspaceId: string,
  records: BoardRecord[],
): Promise<ApiResponse<null>> {
  try {
    const supabase = await createServiceClient();

    const payload = records.map((record) => ({
      id: record.id,
      organization_id: organizationId,
      workspace_id: workspaceId,
      board_id: boardId,
      group_id: record.groupId ?? null,
      title: record.title,
      status: record.status,
      version: record.version,
      archived_at: record.archivedAt ?? null,
      created_at: record.createdAt,
      updated_at: record.updatedAt,
    }));

    const { error } = await supabase.from("records").upsert(payload);

    if (error) {
      return { data: null, error: error.message, status: 500 };
    }

    return { data: null, error: null, status: 200 };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to upsert records";
    return { data: null, error: message, status: 500 };
  }
}

export async function upsertBoardCellValues(
  boardId: string,
  organizationId: string,
  workspaceId: string,
  cellValues: Array<[string, ColumnValue]>,
): Promise<ApiResponse<null>> {
  try {
    const supabase = await createServiceClient();

    const payload = cellValues.map(([key, value]) => {
      const [recordId, columnId] = key.split(":");
      return {
        id: `${boardId}:${recordId}:${columnId}`,
        organization_id: organizationId,
        workspace_id: workspaceId,
        board_id: boardId,
        record_id: recordId,
        column_id: columnId,
        value,
        value_text: typeof value === "string" ? value : JSON.stringify(value),
        updated_at: new Date().toISOString(),
      };
    });

    const { error } = await supabase.from("cell_values").upsert(payload);

    if (error) {
      return { data: null, error: error.message, status: 500 };
    }

    return { data: null, error: null, status: 200 };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to upsert cell values";
    return { data: null, error: message, status: 500 };
  }
}

export async function upsertBoard(data: BoardDefinition): Promise<ApiResponse<BoardDefinition>> {
  try {
    const supabase = await createServiceClient();

    const { error } = await supabase.from("boards").upsert({
      id: data.id,
      organization_id: data.organizationId,
      workspace_id: data.workspaceId,
      slug: data.slug,
      name: data.name,
      description: data.description,
      template_id: data.templateId ?? null,
      icon: null,
      favorite: data.favorite,
      pinned: data.pinned,
      visibility: data.visibility,
      status: data.status,
      shared_with: data.sharedWith,
      primary_column_label: data.primaryColumnLabel ?? null,
      updated_at: data.updatedAt,
      created_at: data.createdAt,
    });

    if (error) {
      return { data: null, error: error.message, status: 500 };
    }

    return { data, error: null, status: 200 };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to upsert board";
    return { data: null, error: message, status: 500 };
  }
}