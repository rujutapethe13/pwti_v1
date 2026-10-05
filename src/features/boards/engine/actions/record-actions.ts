"use server";

import {
  createRecordSchema,
  editRecordSchema,
  duplicateRecordSchema,
  deleteRecordSchema,
  archiveRecordSchema,
  restoreRecordSchema,
  moveRecordSchema,
  bulkUpdateSchema,
  bulkDeleteSchema,
  bulkCreateRecordsSchema,
} from "../schemas/record-schemas";
import { RecordService } from "../services/record-service";
import type { ApiResponse } from "@/types";
import type { BoardRecord } from "../types";

export async function createRecord(formData: FormData): Promise<ApiResponse<BoardRecord>> {
  const rawGroupId = formData.get("groupId");
  const parsed = createRecordSchema.safeParse({
    organizationId: formData.get("organizationId"),
    workspaceId: formData.get("workspaceId"),
    boardId: formData.get("boardId"),
    title: formData.get("title"),
    groupId: rawGroupId === "null" || !rawGroupId ? null : rawGroupId,
    cellValues: formData.get("cellValues") ? JSON.parse(formData.get("cellValues") as string) : {},
  });

  if (!parsed.success) {
    return { data: null, error: parsed.error.flatten().fieldErrors as unknown as string, status: 400 };
  }

  return RecordService.create(parsed.data, "system");
}

export async function editRecord(formData: FormData): Promise<ApiResponse<BoardRecord>> {
  const parsed = editRecordSchema.safeParse({
    recordId: formData.get("recordId"),
    title: formData.get("title") || undefined,
    groupId: formData.get("groupId") || undefined,
    cellValues: formData.get("cellValues") ? JSON.parse(formData.get("cellValues") as string) : undefined,
  });

  if (!parsed.success) {
    return { data: null, error: parsed.error.flatten().fieldErrors as unknown as string, status: 400 };
  }

  return RecordService.edit(parsed.data, "system");
}

export async function duplicateRecord(recordId: string): Promise<ApiResponse<BoardRecord>> {
  const parsed = duplicateRecordSchema.safeParse({ recordId });
  if (!parsed.success) {
    return { data: null, error: "Invalid input", status: 400 };
  }
  return RecordService.duplicate(parsed.data, "system");
}

export async function deleteRecord(recordId: string): Promise<ApiResponse<null>> {
  const parsed = deleteRecordSchema.safeParse({ recordId, permanent: false });
  if (!parsed.success) {
    return { data: null, error: "Invalid input", status: 400 };
  }
  return RecordService.delete(parsed.data, "system");
}

export async function archiveRecord(recordId: string): Promise<ApiResponse<BoardRecord>> {
  const parsed = archiveRecordSchema.safeParse({ recordId });
  if (!parsed.success) {
    return { data: null, error: "Invalid input", status: 400 };
  }
  return RecordService.archive(parsed.data, "system");
}

export async function restoreRecord(recordId: string): Promise<ApiResponse<BoardRecord>> {
  const parsed = restoreRecordSchema.safeParse({ recordId });
  if (!parsed.success) {
    return { data: null, error: "Invalid input", status: 400 };
  }
  return RecordService.restore(parsed.data, "system");
}

export async function moveRecord(recordId: string, targetGroupId: string): Promise<ApiResponse<BoardRecord>> {
  const parsed = moveRecordSchema.safeParse({ recordId, targetGroupId });
  if (!parsed.success) {
    return { data: null, error: "Invalid input", status: 400 };
  }
  return RecordService.move(parsed.data, "system");
}

export async function bulkUpdateRecords(recordIds: string[], cellValues: Record<string, unknown>): Promise<ApiResponse<null>> {
  const parsed = bulkUpdateSchema.safeParse({ recordIds, cellValues });
  if (!parsed.success) {
    return { data: null, error: "Invalid input", status: 400 };
  }
  return RecordService.bulkUpdate(parsed.data, "system");
}

export async function bulkDeleteRecords(recordIds: string[]): Promise<ApiResponse<null>> {
  const parsed = bulkDeleteSchema.safeParse({ recordIds, permanent: false });
  if (!parsed.success) {
    return { data: null, error: "Invalid input", status: 400 };
  }
  return RecordService.bulkDelete(parsed.data, "system");
}

export async function bulkCreateRecords(
  input: {
    organizationId: string;
    workspaceId: string;
    boardId: string;
    groupId?: string | null;
    records: Array<{ title: string; cellValues: Record<string, unknown> }>;
  },
): Promise<
  ApiResponse<{
    createdRecords: BoardRecord[];
    importErrors: Array<{ rowIndex: number; reason: string }>;
  }>
> {
  const parsed = bulkCreateRecordsSchema.safeParse(input);
  if (!parsed.success) {
    return { data: null, error: parsed.error.flatten().fieldErrors as unknown as string, status: 400 };
  }
  return RecordService.bulkCreate(parsed.data, "system");
}

export async function loadRecordsPaginated(
  boardId: string,
  limit: number = 100,
  offset: number = 0,
): Promise<
  ApiResponse<{
    records: BoardRecord[];
    total: number;
    hasMore: boolean;
  }>
> {
  const { RecordRepository } = await import("../repository/record-repository");
  const repo = new RecordRepository();
  const result = await repo.findByBoardPaginated(boardId, limit, offset);
  if (result.error || !result.data) {
    return { data: null, error: result.error, status: result.status };
  }
  return {
    data: {
      records: result.data.data,
      total: result.data.total,
      hasMore: result.data.hasMore,
    },
    error: null,
    status: 200,
  };
}

