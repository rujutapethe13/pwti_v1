"use server";

/**
 * Board Server Actions
 *
 * Zod-validated Server Actions for all Board CRUD operations.
 * Returns typed ApiResponse for consistent client handling.
 */

import { createBoardSchema, renameBoardSchema, duplicateBoardSchema, archiveBoardSchema, deleteBoardSchema, favoriteBoardSchema } from "../schemas/board-schemas";
import { BoardService } from "../services/board-service";
import type { ApiResponse } from "@/types";
import type { BoardDefinition, MigrationPreview, MigrationResult } from "../types";

export async function createBoard(formData: FormData): Promise<ApiResponse<BoardDefinition>> {
  const parsed = createBoardSchema.safeParse({
    organizationId: formData.get("organizationId"),
    workspaceId: formData.get("workspaceId"),
    name: formData.get("name"),
    description: formData.get("description"),
    templateId: formData.get("templateId") || undefined,
    visibility: formData.get("visibility") || "workspace",
  });

  if (!parsed.success) {
    return { data: null, error: parsed.error.flatten().fieldErrors as unknown as string, status: 400 };
  }

  return BoardService.create(parsed.data, "system");
}

export async function renameBoard(formData: FormData): Promise<ApiResponse<BoardDefinition>> {
  const parsed = renameBoardSchema.safeParse({
    boardId: formData.get("boardId"),
    name: formData.get("name"),
    updateSlug: formData.get("updateSlug") !== "false",
  });

  if (!parsed.success) {
    return { data: null, error: parsed.error.flatten().fieldErrors as unknown as string, status: 400 };
  }

  return BoardService.rename(parsed.data, "system");
}

export async function updateBoardPrimaryLabel(
  boardId: string,
  primaryColumnLabel: string,
): Promise<ApiResponse<BoardDefinition>> {
  if (!boardId || !primaryColumnLabel.trim()) {
    return { data: null, error: "Board ID and label are required", status: 400 };
  }

  return BoardService.updatePrimaryColumnLabel(
    { boardId, primaryColumnLabel: primaryColumnLabel.trim() },
    "system",
  );
}

export async function duplicateBoard(formData: FormData): Promise<ApiResponse<BoardDefinition>> {
  const parsed = duplicateBoardSchema.safeParse({
    boardId: formData.get("boardId"),
    newName: formData.get("newName") || undefined,
    includeRecords: formData.get("includeRecords") !== "false",
  });

  if (!parsed.success) {
    return { data: null, error: parsed.error.flatten().fieldErrors as unknown as string, status: 400 };
  }

  return BoardService.duplicate(parsed.data, "system");
}

export async function archiveBoard(boardId: string): Promise<ApiResponse<BoardDefinition>> {
  const parsed = archiveBoardSchema.safeParse({ boardId });
  if (!parsed.success) {
    return { data: null, error: "Invalid board ID", status: 400 };
  }
  return BoardService.archive(parsed.data, "system");
}

export async function deleteBoard(boardId: string, permanent = false): Promise<ApiResponse<null>> {
  const parsed = deleteBoardSchema.safeParse({ boardId, permanent });
  if (!parsed.success) {
    return { data: null, error: "Invalid input", status: 400 };
  }
  return BoardService.delete(parsed.data, "system");
}

export async function favoriteBoard(boardId: string, favorite: boolean): Promise<ApiResponse<BoardDefinition>> {
  const parsed = favoriteBoardSchema.safeParse({ boardId, favorite });
  if (!parsed.success) {
    return { data: null, error: "Invalid input", status: 400 };
  }
  return BoardService.favorite(parsed.data, "system");
}

