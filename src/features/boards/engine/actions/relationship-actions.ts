"use server";

import { RecordRepository } from "../repository/record-repository";
import { RelationshipEngine } from "../connected-data/relationship-engine";
import type { ApiResponse } from "@/types";
import type { BoardRecord } from "../types";

const recordRepo = new RecordRepository();

export async function searchTargetBoardRecords(
  boardId: string,
  query: string,
): Promise<ApiResponse<BoardRecord[]>> {
  const sanitized = query.trim();
  if (sanitized.length === 0) {
    return recordRepo.findByBoard(boardId);
  }
  return recordRepo.search(boardId, sanitized);
}

export async function linkRecords(
  organizationId: string,
  workspaceId: string,
  sourceBoardId: string,
  sourceRecordId: string,
  sourceColumnId: string,
  targetBoardId: string,
  targetRecordIds: string[],
  relationshipType: "one_to_one" | "one_to_many" | "many_to_one" | "many_to_many",
): Promise<ApiResponse<null>> {
  const results: Array<{ recordId: string; result: ApiResponse<unknown> }> = [];

  for (const targetRecordId of targetRecordIds) {
    const result = await RelationshipEngine.create({
      organizationId,
      workspaceId,
      sourceBoardId,
      sourceRecordId,
      sourceColumnId,
      targetBoardId,
      targetRecordId: targetRecordId,
      relationshipType,
      direction: "forward",
      actorUserId: "system",
    });
    results.push({ recordId: targetRecordId, result });
  }

  const failed = results.filter((r) => !r.result.data);
  if (failed.length > 0) {
    return {
      data: null,
      error: failed.map((f) => f.result.error).filter(Boolean).join("; "),
      status: 400,
    };
  }

  return { data: null, error: null, status: 200 };
}

export async function unlinkRecord(
  relationshipId: string,
): Promise<ApiResponse<null>> {
  return RelationshipEngine.delete(relationshipId, "system");
}
