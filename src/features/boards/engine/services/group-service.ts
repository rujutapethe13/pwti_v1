/**
 * Group Service
 *
 * Business logic for Group CRUD operations.
 * All mutations publish domain events via the Event Bus.
 */

import "server-only";

import { GroupRepository } from "../repository/group-repository";
import { RecordRepository } from "../repository/record-repository";
import { eventBus } from "../events/event-bus";
import type { DomainEventPayload } from "../events/event-types";
import type { ApiResponse } from "@/types";
import type { DropdownOption, Group } from "../types";
import type {
  CreateGroupInput,
  RenameGroupInput,
  ReorderGroupsInput,
  MoveGroupInput,
  DuplicateGroupInput,
  CollapseGroupInput,
  DeleteGroupInput,
} from "../schemas/group-schemas";

const DEFAULT_STATUS_OPTIONS: DropdownOption[] = [
  { id: "opt-not-started", label: "Not Started", color: "#94a3b8" },
  { id: "opt-working-on-it", label: "Working on it", color: "#EBAD54" },
  { id: "opt-stuck", label: "Stuck", color: "#C5434E" },
  { id: "opt-done", label: "Done", color: "#68C37D" },
];

const groupRepo = new GroupRepository();
const recordRepo = new RecordRepository();

function createEvent(
  eventName: DomainEventPayload["eventName"],
  actorUserId: string,
  scope: { organizationId: string; workspaceId: string; boardId: string },
  group: Group,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  metadata: Record<string, unknown> = {},
): DomainEventPayload {
  return {
    eventId: crypto.randomUUID(),
    eventName,
    timestamp: new Date().toISOString(),
    actorUserId,
    scope,
    before,
    after,
    metadata: { entityId: group.id, ...metadata },
  };
}

export const GroupService = {
  async create(input: CreateGroupInput, actorUserId: string): Promise<ApiResponse<Group>> {
    // Determine the next order value
    const existingResult = await groupRepo.findByBoard(input.boardId);
    const nextOrder = existingResult.data ? existingResult.data.length : 0;

    const group: Group = {
      id: crypto.randomUUID(),
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      boardId: input.boardId,
      parentGroupId: input.parentGroupId ?? null,
      name: input.name,
      color: input.color,
      collapsed: false,
      order: nextOrder,
      status: "active",
      statusOptions: input.statusOptions && input.statusOptions.length > 0
        ? input.statusOptions
        : undefined,
    };

    const scope = { organizationId: input.organizationId, workspaceId: input.workspaceId, boardId: input.boardId };

    await eventBus.publish(createEvent("group.create:before", actorUserId, scope, group, null, group as unknown as Record<string, unknown>));
    const result = await groupRepo.create(group);
    if (result.data) {
      await eventBus.publish(createEvent("group.create:after", actorUserId, scope, result.data, null, result.data as unknown as Record<string, unknown>));
    }
    return result;
  },

  async rename(input: RenameGroupInput, actorUserId: string): Promise<ApiResponse<Group>> {
    const existing = await groupRepo.findById(input.groupId);
    if (!existing.data) return existing as ApiResponse<Group>;

    const scope = { organizationId: "", workspaceId: "", boardId: existing.data.boardId };
    const before = { ...existing.data };

    await eventBus.publish(createEvent("group.rename:before", actorUserId, scope, existing.data, before as unknown as Record<string, unknown>, { name: input.name }));
    const result = await groupRepo.update(input.groupId, { name: input.name });
    if (result.data) {
      await eventBus.publish(createEvent("group.rename:after", actorUserId, scope, result.data, before as unknown as Record<string, unknown>, result.data as unknown as Record<string, unknown>));
    }
    return result;
  },

  async updateColor(input: { groupId: string; color?: string | null }, actorUserId: string): Promise<ApiResponse<Group>> {
    const existing = await groupRepo.findById(input.groupId);
    if (!existing.data) return { data: null, error: "Group not found", status: 404 };

    const scope = { organizationId: "", workspaceId: "", boardId: existing.data.boardId };
    const before = { ...existing.data };

    await eventBus.publish(createEvent("group.update:color:before", actorUserId, scope, existing.data, before as unknown as Record<string, unknown>, { color: input.color }));
    const result = await groupRepo.update(input.groupId, { color: input.color ?? undefined });
    if (result.data) {
      await eventBus.publish(createEvent("group.update:color:after", actorUserId, scope, result.data, before as unknown as Record<string, unknown>, result.data as unknown as Record<string, unknown>));
    }
    return result;
  },

  async updateStatusOptions(input: { groupId: string; statusOptions: DropdownOption[] }, actorUserId: string): Promise<ApiResponse<Group>> {
    const existing = await groupRepo.findById(input.groupId);
    if (!existing.data) return { data: null, error: "Group not found", status: 404 };

    const scope = { organizationId: "", workspaceId: "", boardId: existing.data.boardId };
    const before = { ...existing.data };

    await eventBus.publish(createEvent("group.update:statusOptions:before", actorUserId, scope, existing.data, before as unknown as Record<string, unknown>, { statusOptions: input.statusOptions }));
    const result = await groupRepo.update(input.groupId, { statusOptions: input.statusOptions });
    if (result.data) {
      await eventBus.publish(createEvent("group.update:statusOptions:after", actorUserId, scope, result.data, before as unknown as Record<string, unknown>, result.data as unknown as Record<string, unknown>));
    }
    return result;
  },

  async reorder(input: ReorderGroupsInput, actorUserId: string): Promise<ApiResponse<null>> {
    const scope = { organizationId: "", workspaceId: "", boardId: input.boardId };

    await eventBus.publish({
      eventId: crypto.randomUUID(),
      eventName: "group.reorder:before",
      timestamp: new Date().toISOString(),
      actorUserId,
      scope,
      before: { groups: input.groups } as unknown as Record<string, unknown>,
      after: { groups: input.groups } as unknown as Record<string, unknown>,
      metadata: {},
    });

    const result = await groupRepo.reorder(input.boardId, input.groups);

    await eventBus.publish({
      eventId: crypto.randomUUID(),
      eventName: "group.reorder:after",
      timestamp: new Date().toISOString(),
      actorUserId,
      scope,
      before: null,
      after: { groups: input.groups } as unknown as Record<string, unknown>,
      metadata: { boardId: input.boardId },
    });

    return result;
  },

  async move(input: MoveGroupInput, actorUserId: string): Promise<ApiResponse<Group>> {
    const existing = await groupRepo.findById(input.groupId);
    if (!existing.data) return existing as ApiResponse<Group>;

    const scope = { organizationId: "", workspaceId: "", boardId: existing.data.boardId };
    const before = { ...existing.data };

    await eventBus.publish(createEvent("group.move:before", actorUserId, scope, existing.data, before as unknown as Record<string, unknown>, { targetBoardId: input.targetBoardId }));
    const result = await groupRepo.update(input.groupId, { boardId: input.targetBoardId, order: input.newOrder ?? 0 } as Partial<Group>);
    if (result.data) {
      await eventBus.publish(createEvent("group.move:after", actorUserId, scope, result.data, before as unknown as Record<string, unknown>, result.data as unknown as Record<string, unknown>));
    }
    return result;
  },

  async duplicate(input: DuplicateGroupInput, actorUserId: string): Promise<ApiResponse<Group>> {
    const source = await groupRepo.findById(input.groupId);
    if (!source.data) return source as ApiResponse<Group>;

    const existingResult = await groupRepo.findByBoard(source.data.boardId);
    const nextOrder = existingResult.data ? existingResult.data.length : 0;

    const newGroup: Group = {
      id: crypto.randomUUID(),
      organizationId: source.data.organizationId,
      workspaceId: source.data.workspaceId,
      boardId: source.data.boardId,
      parentGroupId: null,
      name: `${source.data.name} (copy)`,
      color: source.data.color,
      collapsed: false,
      order: nextOrder,
      status: "active",
    };

    const scope = { organizationId: "", workspaceId: "", boardId: source.data.boardId };
    await eventBus.publish(createEvent("group.duplicate:before", actorUserId, scope, source.data, source.data as unknown as Record<string, unknown>, null));
    const result = await groupRepo.create(newGroup);

    if (result.data && input.includeRecords) {
      const recordsResult = await recordRepo.findByGroup(input.groupId);
      if (recordsResult.data) {
        for (const rec of recordsResult.data) {
          await recordRepo.create({
            ...rec,
            id: crypto.randomUUID(),
            groupId: result.data.id,
          } as Parameters<typeof recordRepo.create>[0]);
        }
      }
    }

    if (result.data) {
      await eventBus.publish(createEvent("group.duplicate:after", actorUserId, scope, result.data, source.data as unknown as Record<string, unknown>, result.data as unknown as Record<string, unknown>));
    }
    return result;
  },

  async collapse(input: CollapseGroupInput, actorUserId: string): Promise<ApiResponse<Group>> {
    const existing = await groupRepo.findById(input.groupId);
    if (!existing.data) return existing as ApiResponse<Group>;

    const scope = { organizationId: "", workspaceId: "", boardId: existing.data.boardId };
    const before = { ...existing.data };

    await eventBus.publish(createEvent("group.collapse:before", actorUserId, scope, existing.data, before as unknown as Record<string, unknown>, { collapsed: input.collapsed }));
    const result = await groupRepo.update(input.groupId, { collapsed: input.collapsed });
    if (result.data) {
      await eventBus.publish(createEvent("group.collapse:after", actorUserId, scope, result.data, before as unknown as Record<string, unknown>, result.data as unknown as Record<string, unknown>));
    }
    return result;
  },

  async delete(input: DeleteGroupInput, actorUserId: string): Promise<ApiResponse<null>> {
    const existing = await groupRepo.findById(input.groupId);
    if (!existing.data) return { data: null, error: "Group not found", status: 404 };

    const scope = { organizationId: "", workspaceId: "", boardId: existing.data.boardId };

    await eventBus.publish(createEvent("group.delete:before", actorUserId, scope, existing.data, existing.data as unknown as Record<string, unknown>, null));

    if (input.cascade && !input.permanent) {
      const records = await recordRepo.findByGroup(input.groupId);
      if (records.data) {
        for (const rec of records.data) {
          await recordRepo.softDelete(rec.id);
        }
      }
    }

    if (input.permanent) {
      if (input.cascade) {
        const records = await recordRepo.findByGroup(input.groupId);
        if (records.data) {
          for (const rec of records.data) {
            await recordRepo.hardDelete(rec.id);
          }
        }
      }
      await groupRepo.hardDelete(input.groupId);
    } else {
      await groupRepo.softDelete(input.groupId);
    }

    await eventBus.publish(createEvent("group.delete:after", actorUserId, scope, existing.data, existing.data as unknown as Record<string, unknown>, null));
    return { data: null, error: null, status: 200 };
  },
};

