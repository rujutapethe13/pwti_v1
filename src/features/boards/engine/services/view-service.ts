/**
 * View Service
 *
 * Business logic for Board View CRUD operations.
 * Views define how board data is presented (table, kanban, calendar, etc.).
 */

import "server-only";

import { ViewRepository } from "../repository/view-repository";
import { eventBus } from "../events/event-bus";
import type { DomainEventPayload } from "../events/event-types";
import type { ApiResponse } from "@/types";
import type { BoardView } from "../types";
import type { CreateViewInput, UpdateViewInput, DuplicateViewInput, SetDefaultViewInput, DeleteViewInput } from "../schemas/view-schemas";

const viewRepo = new ViewRepository();

function buildScope(view: BoardView) {
  return { organizationId: view.organizationId || "", workspaceId: view.workspaceId || "", boardId: view.boardId };
}

export const ViewService = {
  async create(input: CreateViewInput, actorUserId: string, overrideId?: string, overrideOrder?: number): Promise<ApiResponse<BoardView>> {
    const existingResult = await viewRepo.findByBoard(input.boardId);
    const nextOrder = overrideOrder ?? (existingResult.data ? existingResult.data.length : 0);

    const view: BoardView = {
      id: overrideId ?? crypto.randomUUID(),
      boardId: input.boardId,
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      name: input.name,
      type: input.type,
      visibility: input.visibility,
      filters: input.filters as BoardView["filters"],
      sorting: input.sorting as BoardView["sorting"],
      grouping: input.grouping as BoardView["grouping"],
      visibleColumnIds: input.visibleColumnIds,
      columnWidths: input.columnWidths,
      rowHeight: input.rowHeight,
      settings: input.settings as BoardView["settings"],
      personalOwnerUserId: null,
      sharedWith: ["owner", "editor", "viewer"],
      isDefault: input.isDefault,
      order: nextOrder,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await eventBus.publish({
      eventId: crypto.randomUUID(),
      eventName: "view.create:before",
      timestamp: new Date().toISOString(),
      actorUserId,
      scope: buildScope(view),
      before: null,
      after: view as unknown as Record<string, unknown>,
      metadata: {},
    });

    const result = await viewRepo.create(view);

    if (result.data) {
      if (input.isDefault) {
        await viewRepo.setDefault(result.data.id, input.boardId);
      }
      await eventBus.publish({
        eventId: crypto.randomUUID(),
        eventName: "view.create:after",
        timestamp: new Date().toISOString(),
        actorUserId,
        scope: buildScope(result.data),
        before: null,
        after: result.data as unknown as Record<string, unknown>,
        metadata: {},
      });
    }

    return result;
  },

  async findById(viewId: string): Promise<ApiResponse<BoardView>> {
    return viewRepo.findById(viewId);
  },

  async update(input: UpdateViewInput, actorUserId: string): Promise<ApiResponse<BoardView>> {
    const existing = await viewRepo.findById(input.viewId);
    if (!existing.data) return existing as ApiResponse<BoardView>;

    const before = { ...existing.data };
    const updates: Partial<BoardView> = {};

    if (input.name !== undefined) updates.name = input.name;
    if (input.filters !== undefined) updates.filters = input.filters as BoardView["filters"];
    if (input.sorting !== undefined) updates.sorting = input.sorting as BoardView["sorting"];
    if (input.grouping !== undefined) updates.grouping = input.grouping as BoardView["grouping"];
    if (input.visibleColumnIds !== undefined) updates.visibleColumnIds = input.visibleColumnIds;
    if (input.columnWidths !== undefined) updates.columnWidths = input.columnWidths;
    if (input.rowHeight !== undefined) updates.rowHeight = input.rowHeight;
    if (input.settings !== undefined) updates.settings = input.settings as BoardView["settings"];

    await eventBus.publish({
      eventId: crypto.randomUUID(),
      eventName: "view.update:before",
      timestamp: new Date().toISOString(),
      actorUserId,
      scope: buildScope(existing.data),
      before: before as unknown as Record<string, unknown>,
      after: updates as unknown as Record<string, unknown>,
      metadata: {},
    });

    const result = await viewRepo.update(input.viewId, updates);

    if (result.data) {
      await eventBus.publish({
        eventId: crypto.randomUUID(),
        eventName: "view.update:after",
        timestamp: new Date().toISOString(),
        actorUserId,
        scope: buildScope(result.data),
        before: before as unknown as Record<string, unknown>,
        after: result.data as unknown as Record<string, unknown>,
        metadata: {},
      });
    }

    return result;
  },

  async duplicate(input: DuplicateViewInput, actorUserId: string): Promise<ApiResponse<BoardView>> {
    const source = await viewRepo.findById(input.viewId);
    if (!source.data) return source as ApiResponse<BoardView>;

    const existingResult = await viewRepo.findByBoard(source.data.boardId);
    const nextOrder = existingResult.data ? existingResult.data.length : 0;

    const typeLabel = source.data.type.charAt(0).toUpperCase() + source.data.type.slice(1);
    const newView: BoardView = {
      ...source.data,
      id: crypto.randomUUID(),
      name: input.newName ?? `${typeLabel} copy`,
      isDefault: false,
      order: nextOrder,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await eventBus.publish({
      eventId: crypto.randomUUID(),
      eventName: "view.duplicate:before",
      timestamp: new Date().toISOString(),
      actorUserId,
      scope: buildScope(source.data),
      before: source.data as unknown as Record<string, unknown>,
      after: null,
      metadata: {},
    });

    const result = await viewRepo.create(newView);

    if (result.data) {
      await eventBus.publish({
        eventId: crypto.randomUUID(),
        eventName: "view.duplicate:after",
        timestamp: new Date().toISOString(),
        actorUserId,
        scope: buildScope(result.data),
        before: source.data as unknown as Record<string, unknown>,
        after: result.data as unknown as Record<string, unknown>,
        metadata: {},
      });
    }

    return result;
  },

  async setDefault(input: SetDefaultViewInput, actorUserId: string): Promise<ApiResponse<null>> {
    await eventBus.publish({
      eventId: crypto.randomUUID(),
      eventName: "view.update:before",
      timestamp: new Date().toISOString(),
      actorUserId,
      scope: { organizationId: "", workspaceId: "", boardId: input.boardId },
      before: null,
      after: null,
      metadata: { viewId: input.viewId },
    });

    const result = await viewRepo.setDefault(input.viewId, input.boardId);

    await eventBus.publish({
      eventId: crypto.randomUUID(),
      eventName: "view.update:after",
      timestamp: new Date().toISOString(),
      actorUserId,
      scope: { organizationId: "", workspaceId: "", boardId: input.boardId },
      before: null,
      after: null,
      metadata: { viewId: input.viewId },
    });

    return result;
  },

  async delete(input: DeleteViewInput, actorUserId: string): Promise<ApiResponse<null>> {
    const existing = await viewRepo.findById(input.viewId);
    if (!existing.data) {
      return { data: null, error: null, status: 200 };
    }

    const boardViews = await viewRepo.findByBoard(existing.data.boardId);
    if (boardViews.data && boardViews.data.length <= 1) {
      return { data: null, error: "Cannot delete the last view on a board. A board must have at least one view.", status: 400 };
    }

    await eventBus.publish({
      eventId: crypto.randomUUID(),
      eventName: "view.delete:before",
      timestamp: new Date().toISOString(),
      actorUserId,
      scope: buildScope(existing.data),
      before: existing.data as unknown as Record<string, unknown>,
      after: null,
      metadata: {},
    });

    await viewRepo.hardDelete(input.viewId);

    await eventBus.publish({
      eventId: crypto.randomUUID(),
      eventName: "view.delete:after",
      timestamp: new Date().toISOString(),
      actorUserId,
      scope: buildScope(existing.data),
      before: existing.data as unknown as Record<string, unknown>,
      after: null,
      metadata: {},
    });

    return { data: null, error: null, status: 200 };
  },
};

