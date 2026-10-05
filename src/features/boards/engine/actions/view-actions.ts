"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { updateViewSchema, duplicateViewSchema, deleteViewSchema } from "../schemas/view-schemas";
import { ViewService } from "../services/view-service";
import type { ApiResponse } from "@/types";
import type { BoardView } from "../types";

export async function renameView(viewId: string, name: string): Promise<ApiResponse<BoardView>> {
  const parsed = updateViewSchema.safeParse({ viewId, name });
  if (!parsed.success) {
    return { data: null, error: parsed.error.flatten().fieldErrors as unknown as string, status: 400 };
  }
  return ViewService.update(parsed.data, "system");
}

export async function updateViewSettings(
  viewId: string,
  settings: Record<string, unknown>,
): Promise<ApiResponse<BoardView>> {
  const parsed = updateViewSchema.safeParse({ viewId, settings });
  if (!parsed.success) {
    return { data: null, error: parsed.error.flatten().fieldErrors as unknown as string, status: 400 };
  }
  return ViewService.update(parsed.data, "system");
}

export async function duplicateView(viewId: string): Promise<ApiResponse<BoardView>> {
  const parsed = duplicateViewSchema.safeParse({ viewId });
  if (!parsed.success) {
    return { data: null, error: parsed.error.flatten().fieldErrors as unknown as string, status: 400 };
  }
  return ViewService.duplicate(parsed.data, "system");
}

export async function deleteView(viewId: string): Promise<ApiResponse<null>> {
  const parsed = deleteViewSchema.safeParse({ viewId });
  if (!parsed.success) {
    return { data: null, error: "Invalid view ID", status: 400 };
  }
  return ViewService.delete(parsed.data, "system");
}

export async function ensureBoardViews(views: BoardView[]): Promise<ApiResponse<BoardView[]>> {
  const results: BoardView[] = [];

  const boardId = views[0]?.boardId;
  let boardOrgId: string | undefined;
  let boardWorkspaceId: string | undefined;

  if (boardId) {
    const client = await createServiceClient();
    const { data: boardRow } = await client
      .from("boards")
      .select("organization_id, workspace_id")
      .eq("id", boardId)
      .maybeSingle();

    if (boardRow) {
      boardOrgId = boardRow.organization_id;
      boardWorkspaceId = boardRow.workspace_id;
    }
  }

  for (const view of views) {
    const existing = await ViewService.findById(view.id);
    if (existing.data) {
      results.push(existing.data);
    } else {
      const created = await ViewService.create(
        {
          boardId: view.boardId,
          organizationId: view.organizationId ?? boardOrgId,
          workspaceId: view.workspaceId ?? boardWorkspaceId,
          name: view.name,
          type: view.type,
          visibility: view.visibility,
          filters: view.filters,
          sorting: view.sorting,
          grouping: view.grouping,
          visibleColumnIds: view.visibleColumnIds,
          columnWidths: view.columnWidths,
          rowHeight: view.rowHeight,
          settings: view.settings as unknown as Record<string, unknown>,
          isDefault: view.isDefault,
        },
        "system",
        view.id,
        view.order,
      );
      if (created.error) {
        return { data: null, error: created.error, status: created.status };
      }
      if (created.data) {
        results.push(created.data);
      }
    }
  }
  return { data: results, error: null, status: 200 };
}
