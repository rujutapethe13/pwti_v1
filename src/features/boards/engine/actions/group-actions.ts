"use server";

import { createGroupSchema, renameGroupSchema, reorderGroupsSchema, moveGroupSchema, duplicateGroupSchema, collapseGroupSchema, deleteGroupSchema, updateGroupColorSchema, updateGroupStatusOptionsSchema } from "../schemas/group-schemas";
import { GroupService } from "../services/group-service";
import type { ApiResponse } from "@/types";
import type { Group } from "../types";

export async function createGroup(formData: FormData): Promise<ApiResponse<Group>> {
  const parsed = createGroupSchema.safeParse({
    organizationId: formData.get("organizationId"),
    workspaceId: formData.get("workspaceId"),
    boardId: formData.get("boardId"),
    name: formData.get("name"),
    color: formData.get("color") || undefined,
    statusOptions: formData.get("statusOptions") ? JSON.parse(formData.get("statusOptions") as string) : undefined,
  });

  if (!parsed.success) {
    return { data: null, error: parsed.error.flatten().fieldErrors as unknown as string, status: 400 };
  }

  return GroupService.create(parsed.data, "system");
}

export async function renameGroup(groupId: string, name: string): Promise<ApiResponse<Group>> {
  const parsed = renameGroupSchema.safeParse({ groupId, name });
  if (!parsed.success) {
    return { data: null, error: "Invalid input", status: 400 };
  }
  return GroupService.rename(parsed.data, "system");
}

export async function reorderGroups(boardId: string, groups: Array<{ id: string; order: number }>): Promise<ApiResponse<null>> {
  const parsed = reorderGroupsSchema.safeParse({ boardId, groups });
  if (!parsed.success) {
    return { data: null, error: "Invalid input", status: 400 };
  }
  return GroupService.reorder(parsed.data, "system");
}

export async function moveGroup(groupId: string, targetBoardId: string): Promise<ApiResponse<Group>> {
  const parsed = moveGroupSchema.safeParse({ groupId, targetBoardId });
  if (!parsed.success) {
    return { data: null, error: "Invalid input", status: 400 };
  }
  return GroupService.move(parsed.data, "system");
}

export async function duplicateGroup(groupId: string): Promise<ApiResponse<Group>> {
  const parsed = duplicateGroupSchema.safeParse({ groupId, includeRecords: true });
  if (!parsed.success) {
    return { data: null, error: "Invalid input", status: 400 };
  }
  return GroupService.duplicate(parsed.data, "system");
}

export async function collapseGroup(groupId: string, collapsed: boolean): Promise<ApiResponse<Group>> {
  const parsed = collapseGroupSchema.safeParse({ groupId, collapsed });
  if (!parsed.success) {
    return { data: null, error: "Invalid input", status: 400 };
  }
  return GroupService.collapse(parsed.data, "system");
}

export async function deleteGroup(groupId: string, cascade = false): Promise<ApiResponse<null>> {
  const parsed = deleteGroupSchema.safeParse({ groupId, cascade, permanent: false });
  if (!parsed.success) {
    return { data: null, error: "Invalid input", status: 400 };
  }
  return GroupService.delete(parsed.data, "system");
}

export async function updateGroupColor(groupId: string, color: string | null): Promise<ApiResponse<Group>> {
  const parsed = updateGroupColorSchema.safeParse({ groupId, color: color ?? undefined });
  if (!parsed.success) {
    return { data: null, error: "Invalid input", status: 400 };
  }
  return GroupService.updateColor(parsed.data, "system");
}

export async function updateGroupStatusOptions(groupId: string, statusOptions: Array<{ id: string; label: string; color?: string }>): Promise<ApiResponse<Group>> {
  const parsed = updateGroupStatusOptionsSchema.safeParse({ groupId, statusOptions });
  if (!parsed.success) {
    return { data: null, error: "Invalid input", status: 400 };
  }
  return GroupService.updateStatusOptions(parsed.data, "system");
}

