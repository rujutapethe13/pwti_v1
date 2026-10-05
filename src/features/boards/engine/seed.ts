import "server-only";

import { demoBoardPageData } from "./demo-data";
import { upsertBoard, upsertBoardCellValues, upsertBoardColumns, upsertBoardRecords } from "./repository";
import type { BoardDefinition, BoardRecord, ColumnDefinition, ColumnValue } from "./types";

function cloneCellValues(entries: Array<[string, ColumnValue]>): Array<[string, ColumnValue]> {
  return entries.map(([k, v]) => [k, v]);
}

export interface SeedResult {
  seededBoards: string[];
}

export async function seedDemoBoard(boardId: string): Promise<SeedResult> {
  const data = demoBoardPageData[boardId];

  if (!data) {
    throw new Error(`Unknown demo board: ${boardId}`);
  }

  await seedBoardData(data.board, data.columns, data.records, cloneCellValues(data.cellValues));

  return { seededBoards: [boardId] };
}

export async function seedAllDemoBoards(): Promise<SeedResult> {
  const seededBoards: string[] = [];

  for (const [boardId, data] of Object.entries(demoBoardPageData)) {
    await seedBoardData(data.board, data.columns, data.records, cloneCellValues(data.cellValues));
    seededBoards.push(boardId);
  }

  return { seededBoards };
}

async function seedBoardData(
  board: BoardDefinition,
  columns: ColumnDefinition[],
  records: BoardRecord[],
  cellValues: Array<[string, ColumnValue]>,
): Promise<void> {
  await upsertBoard(board);
  await upsertBoardColumns(board.id, board.organizationId, board.workspaceId, columns);
  await upsertBoardRecords(board.id, board.organizationId, board.workspaceId, records);
  await upsertBoardCellValues(board.id, board.organizationId, board.workspaceId, cellValues);
}