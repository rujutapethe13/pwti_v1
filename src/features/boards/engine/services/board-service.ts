/**
 * Board Service
 *
 * Business logic for Board CRUD operations.
 * Metadata-driven, with lifecycle hooks via the Event Bus.
 * Wraps the BoardRepository with validation, event publishing,
 * and cross-entity coordination (duplicate = board + columns + groups + views + records + cells).
 */

import "server-only";

import { BoardRepository } from "../repository/board-repository";
import { GroupRepository } from "../repository/group-repository";
import { ColumnRepository } from "../repository/column-repository";
import { RecordRepository } from "../repository/record-repository";
import { CellRepository } from "../repository/cell-repository";
import { ViewRepository } from "../repository/view-repository";

import { eventBus } from "../events/event-bus";
import type { DomainEventPayload } from "../events/event-types";
import type { ApiResponse } from "@/types";
import type {
  BoardDefinition,
  ColumnDefinition,
  Group,
  BoardRecord,
  BoardView,
} from "../types";
import type {
  CreateBoardInput,
  RenameBoardInput,
  DuplicateBoardInput,
  DeleteBoardInput,
  FavoriteBoardInput,
} from "../schemas/board-schemas";

import { createServiceClient } from "@/lib/supabase/server";
import { createBoardWithDefaults } from "../actions/create";

const boardRepo = new BoardRepository();
const groupRepo = new GroupRepository();
const columnRepo = new ColumnRepository();
const recordRepo = new RecordRepository();
const cellRepo = new CellRepository();
const viewRepo = new ViewRepository();

async function cleanupConnectedBoardReferences(boardId: string): Promise<void> {
  const client = await createServiceClient();
  const { data: allColumns, error } = await client
    .from("columns")
    .select("id, board_id, settings")
    .neq("board_id", boardId);

  if (error || !allColumns) return;

  const updates: Array<{ id: string; settings: Record<string, unknown> }> = [];
  for (const col of allColumns as Array<{ id: string; board_id: string; settings: Record<string, unknown> }>) {
    const settings = col.settings ?? {};
    const connectedIds = settings.connected_board_ids as Array<{ workspace_id: string; board_id: string }> | undefined;
    if (!Array.isArray(connectedIds)) continue;

    const filtered = connectedIds.filter((entry) => entry.board_id !== boardId);
    if (filtered.length !== connectedIds.length) {
      updates.push({ id: col.id, settings: { ...settings, connected_board_ids: filtered } });
    }
  }

  if (updates.length > 0) {
    await client.from("columns").upsert(updates.map((u) => ({ id: u.id, settings: u.settings, updated_at: new Date().toISOString() })));
  }
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function createEvent(
  eventName: DomainEventPayload["eventName"],
  actorUserId: string,
  board: BoardDefinition,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  metadata: Record<string, unknown> = {},
): DomainEventPayload {
  return {
    eventId: crypto.randomUUID(),
    eventName,
    timestamp: new Date().toISOString(),
    actorUserId,
    scope: {
      organizationId: board.organizationId,
      workspaceId: board.workspaceId,
      boardId: board.id,
    },
    before,
    after,
    metadata: { entityId: board.id, ...metadata },
  };
}

export const BoardService = {
  /**
   * Create a new board with default columns, groups, views, and a starter record.
   */
  async create(
    input: CreateBoardInput,
    actorUserId: string,
  ): Promise<ApiResponse<BoardDefinition>> {
    const result = await createBoardWithDefaults(
      input.name,
      input.workspaceId,
      input.organizationId,
    );

    if (result.board) {
      await eventBus.publish(
        createEvent("board.create:after", actorUserId, result.board, null, result.board as unknown as Record<string, unknown>),
      );
      return { data: result.board, error: null, status: 201 };
    }

    return { data: null, error: "Failed to create board with defaults", status: 500 };
  },

   /**
    * Rename a board and optionally update its slug.
    */
  async rename(
    input: RenameBoardInput,
    actorUserId: string,
  ): Promise<ApiResponse<BoardDefinition>> {
    const existing = await boardRepo.findById(input.boardId);
    if (!existing.data) {
      return existing as ApiResponse<BoardDefinition>;
    }

    const board = existing.data;
    const before = { ...board };
    const updates: Partial<BoardDefinition> = { name: input.name };
    if (input.updateSlug) {
      updates.slug = generateSlug(input.name);
    }

    await eventBus.publish(
      createEvent("board.rename:before", actorUserId, board, before as unknown as Record<string, unknown>, updates as unknown as Record<string, unknown>),
    );

    const result = await boardRepo.update(input.boardId, updates);

    if (result.data) {
      await eventBus.publish(
        createEvent("board.rename:after", actorUserId, result.data, before as unknown as Record<string, unknown>, result.data as unknown as Record<string, unknown>),
      );
    }

    return result;
  },

  /**
    * Update the primary column label (first column / record-title header).
    */
  async updatePrimaryColumnLabel(
    input: { boardId: string; primaryColumnLabel: string },
    actorUserId: string,
  ): Promise<ApiResponse<BoardDefinition>> {
    const existing = await boardRepo.findById(input.boardId);
    if (!existing.data) {
      return existing as ApiResponse<BoardDefinition>;
    }

    const board = existing.data;
    const before = { ...board };
    const updates: Partial<BoardDefinition> = {
      primaryColumnLabel: input.primaryColumnLabel,
    };

    await eventBus.publish(
      createEvent(
        "board.update_primary_column_label:before",
        actorUserId,
        board,
        before as unknown as Record<string, unknown>,
        updates as unknown as Record<string, unknown>,
      ),
    );

    const result = await boardRepo.update(input.boardId, updates);

    if (result.data) {
      await eventBus.publish(
        createEvent(
          "board.update_primary_column_label:after",
          actorUserId,
          result.data,
          before as unknown as Record<string, unknown>,
          result.data as unknown as Record<string, unknown>,
        ),
      );
    }

    return result;
  },

  /**
   * Duplicate a board with all its schema and optionally records.
   */
  async duplicate(
    input: DuplicateBoardInput,
    actorUserId: string,
  ): Promise<ApiResponse<BoardDefinition>> {
    const source = await boardRepo.findById(input.boardId);
    if (!source.data) {
      return source as ApiResponse<BoardDefinition>;
    }

    const sourceBoard = source.data;
    const newId = crypto.randomUUID();
    const newSlug = generateSlug(input.newName ?? `${sourceBoard.name} (copy)`);
    const newName = input.newName ?? `${sourceBoard.name} (copy)`;

    const client = await createServiceClient();

    // Create the duplicated board
    const result = await boardRepo.duplicate(sourceBoard.id, newId, newSlug, newName, { client });
    if (!result.data) {
      return result;
    }

    const newBoard = result.data;

    // Duplicate groups
    const groupsResult = await groupRepo.findByBoard(sourceBoard.id, { client });
    if (groupsResult.data) {
      const newGroups = groupsResult.data.map((g) => ({
        id: crypto.randomUUID(),
        organizationId: g.organizationId,
        workspaceId: g.workspaceId,
        boardId: newBoard.id,
        parentGroupId: null,
        name: g.name,
        color: g.color,
        collapsed: false,
        order: g.order,
        status: "active" as const,
      }));

      for (const group of newGroups) {
        await groupRepo.create(group, { client });
      }
    }

    // Duplicate columns
    const columnsResult = await columnRepo.findByBoard(sourceBoard.id, { client });
    const columnIdMap = new Map<string, string>();
    if (columnsResult.data) {
      for (const col of columnsResult.data) {
        const newColId = crypto.randomUUID();
        columnIdMap.set(col.id, newColId);
        await columnRepo.create({
          ...col,
          id: newColId,
          boardId: newBoard.id,
        }, { client });
      }
    }

    // Duplicate views
    const viewsResult = await viewRepo.findByBoard(sourceBoard.id, { client });
    if (viewsResult.data) {
      for (const v of viewsResult.data) {
        await viewRepo.create({
          ...v,
          id: crypto.randomUUID(),
          boardId: newBoard.id,
          organizationId: newBoard.organizationId,
          workspaceId: newBoard.workspaceId,
        } as BoardView, { client });
      }
    }

    // Optionally duplicate records and cell values
    if (input.includeRecords) {
      const recordsResult = await recordRepo.findByBoard(sourceBoard.id, { client });
      if (recordsResult.data) {
        for (const rec of recordsResult.data) {
          const newRecId = crypto.randomUUID();
          await recordRepo.create({
            ...rec,
            id: newRecId,
            boardId: newBoard.id,
            groupId: null,
            status: "active",
            version: 1,
            archivedAt: null,
          } as BoardRecord, { client });

          // Duplicate cell values for this record
          const cellsResult = await cellRepo.findByRecord(rec.id, { client });
          if (cellsResult.data) {
            for (const cell of cellsResult.data) {
              const newColumnId = columnIdMap.get(cell.columnId);
              if (newColumnId) {
                await cellRepo.create({
                  id: crypto.randomUUID(),
                  organizationId: newBoard.organizationId,
                  workspaceId: newBoard.workspaceId,
                  boardId: newBoard.id,
                  recordId: newRecId,
                  columnId: newColumnId,
                  value: cell.value,
                  valueText: cell.valueText,
                  version: 1,
                } as Parameters<typeof cellRepo.create>[0], { client });
              }
            }
          }
        }
      }
    }

    // Publish event
    await eventBus.publish(
      createEvent("board.duplicate:after", actorUserId, newBoard, sourceBoard as unknown as Record<string, unknown>, newBoard as unknown as Record<string, unknown>, {
        sourceBoardId: sourceBoard.id,
        includeRecords: input.includeRecords,
      }),
    );

    return { data: newBoard, error: null, status: 201 };
  },

  /**
   * Archive a board (soft delete).
   */
  async archive(input: { boardId: string }, actorUserId: string): Promise<ApiResponse<BoardDefinition>> {
    const existing = await boardRepo.findById(input.boardId);
    if (!existing.data) {
      return existing as ApiResponse<BoardDefinition>;
    }

    const before = { ...existing.data };

    await eventBus.publish(
      createEvent("board.archive:before", actorUserId, existing.data, before as unknown as Record<string, unknown>, null),
    );

    const result = await boardRepo.softDelete(input.boardId);

    await cleanupConnectedBoardReferences(input.boardId);

    if (result.data) {
      await eventBus.publish(
        createEvent("board.archive:after", actorUserId, result.data, before as unknown as Record<string, unknown>, result.data as unknown as Record<string, unknown>),
      );
    }

    return result;
  },

  /**
   * Permanently delete a board.
   */
  async delete(input: DeleteBoardInput, actorUserId: string): Promise<ApiResponse<null>> {
    const existing = await boardRepo.findById(input.boardId);
    if (!existing.data) {
      return { data: null, error: "Board not found", status: 404 };
    }

    await eventBus.publish(
      createEvent("board.delete:before", actorUserId, existing.data, existing.data as unknown as Record<string, unknown>, null),
    );

    if (input.permanent) {
      await cellRepo.clearRecord(input.boardId); // cascade cells
      await boardRepo.hardDelete(input.boardId);
    } else {
      await boardRepo.softDelete(input.boardId);
    }

    await cleanupConnectedBoardReferences(input.boardId);

    await eventBus.publish(
      createEvent("board.delete:after", actorUserId, existing.data, existing.data as unknown as Record<string, unknown>, null),
    );

    return { data: null, error: null, status: 200 };
  },

  /**
   * Toggle favorite status.
   */
  async favorite(input: FavoriteBoardInput, actorUserId: string): Promise<ApiResponse<BoardDefinition>> {
    const existing = await boardRepo.findById(input.boardId);
    if (!existing.data) {
      return existing as ApiResponse<BoardDefinition>;
    }

    const before = { ...existing.data } as Record<string, unknown>;

    await eventBus.publish(
      createEvent("board.favorite:before", actorUserId, existing.data, before, { favorite: input.favorite }),
    );

    const result = await boardRepo.updateFavorite(input.boardId, input.favorite);

    if (result.data) {
      await eventBus.publish(
        createEvent("board.favorite:after", actorUserId, result.data, before, result.data as unknown as Record<string, unknown>),
      );
    }

    return result;
  },
};

