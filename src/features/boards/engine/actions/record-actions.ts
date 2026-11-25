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
import { invalidateDataCache } from "@/lib/board-data-cache";
import { revalidatePath } from "next/cache";

/**
 * Drop the cached render of a board (by slug) plus the cross-board dashboards
 * so a renamed Client / Company item is re-read fresh on the next navigation or
 * refresh instead of being served from Next's RSC cache.
 */
function revalidateAfterNameSave(boardId: string): void {
  try {
    if (boardId) revalidatePath(`/${boardId}`);
    revalidatePath("/boards-hub");
    revalidatePath("/client-360");
    revalidatePath("/");
  } catch (err) {
    console.error("[revalidateAfterNameSave] revalidation failed:", err);
  }
}

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

  const result = await RecordService.create(parsed.data, "system");

  // Keep the board fresh after a create so the new row (and its real id) is
  // re-read instead of served from Next's RSC cache, and clear the shared
  // Overview / Client 360 data cache for the org.
  if (!result.error && result.data) {
    try {
      revalidatePath(`/${result.data.boardId}`);
      invalidateDataCache(result.data.organizationId);
    } catch (err) {
      console.error("[createRecord] cache invalidation failed:", err);
    }
  }

  return result;
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

  const result = await RecordService.edit(parsed.data, "system");

  // Keep the Overview / Client 360 materialized scope fresh after a rename.
  if (!result.error && result.data) {
    try {
      invalidateDataCache(result.data.organizationId);
    } catch (err) {
      console.error("[editRecord] cache invalidation failed:", err);
    }
  }

  return result;
}

/**
 * saveItemName — dedicated, single-purpose rename used by the board Table view.
 *
 * Updates the item's name (`records.title`) and nothing else, then returns the
 * row read back from the database. The DB id is the real record id; a temporary
 * local id is rejected by the schema (min length) and by RecordService.rename.
 * Any error is returned verbatim to the caller — nothing is swallowed here.
 */
export async function saveItemName(input: {
  boardId: string;
  itemId: string;
  newName: string;
}): Promise<ApiResponse<BoardRecord>> {
  const itemId = (input.itemId ?? "").trim();
  const newName = input.newName ?? "";

  if (!itemId || itemId.startsWith("pending-")) {
    return {
      data: null,
      error: "Cannot save a name for an item that has not been persisted yet.",
      status: 400,
    };
  }

  // Never let an empty or placeholder ("Untitled") incoming value clobber a
  // name that is already stored in the database. Sync, refresh, mirror and
  // automation writers must not reset a persisted Client / Company name.
   const result = await RecordService.rename(itemId, newName, "system");

  // Keep every surface that reads the name fresh: the in-memory Overview /
  // Client 360 scope cache AND Next's rendered board/dashboard pages.
  if (!result.error && result.data) {
    try {
      invalidateDataCache(result.data.organizationId);
    } catch (err) {
      console.error("[saveItemName] cache invalidation failed:", err);
    }
    revalidateAfterNameSave(input.boardId);
  }

  return result;
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

export async function bulkUpdateRecords(recordIds: string[], cellValues: Record<string, unknown>, targetGroupId?: string): Promise<ApiResponse<null>> {
  const parsed = bulkUpdateSchema.safeParse({ recordIds, cellValues, targetGroupId });
  if (!parsed.success) {
    return { data: null, error: "Invalid input", status: 400 };
  }
  return RecordService.bulkUpdate(parsed.data, "system");
}

export async function bulkDeleteRecords(recordIds: string[]): Promise<ApiResponse<null>> {
  const parsed = bulkDeleteSchema.safeParse({ recordIds, permanent: true });
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

