/**
 * Group Service
 *
 * Business logic for Group CRUD operations.
 * All mutations publish domain events via the Event Bus.
 */

import "server-only";

import { GroupRepository } from "../repository/group-repository";
import { ColumnRepository } from "../repository/column-repository";
import { RecordRepository } from "../repository/record-repository";
import { eventBus } from "../events/event-bus";
import type { DomainEventPayload } from "../events/event-types";
import type { ApiResponse } from "@/types";
import type { ColumnDefinition, DropdownOption, Group } from "../types";
import {
  DEFAULT_TITLE_COLUMN_LABEL,
  resolveTitleColumnLabel,
} from "../lib/title-column";
import type {
  CreateGroupInput,
  RenameGroupInput,
  ReorderGroupsInput,
  MoveGroupInput,
  DuplicateGroupInput,
  CollapseGroupInput,
  DeleteGroupInput,
} from "../schemas/group-schemas";

const groupRepo = new GroupRepository();
const columnRepo = new ColumnRepository();
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

/**
 * Create the column set of a custom-mode group.
 *
 * A custom group owns its columns (`columns.group_id = group.id`). The set is
 * either taken verbatim from the caller, or copied from another group — a
 * custom group's own columns, or the board's shared columns when the source
 * group is in shared mode.
 */
async function createGroupColumns(params: {
  boardId: string;
  organizationId: string;
  workspaceId: string;
  groupId: string;
  copyFromGroupId?: string;
  explicitColumns?: Array<{ key: string; label: string; type: string }>;
}): Promise<void> {
  const { boardId, organizationId, workspaceId, groupId } = params;
  const now = new Date().toISOString();

  let sourceColumns: ColumnDefinition[] = [];

  if (params.explicitColumns && params.explicitColumns.length > 0) {
    sourceColumns = params.explicitColumns.map((col, index) => ({
      id: crypto.randomUUID(),
      groupId,
      boardId,
      key: col.key,
      label: col.label,
      type: col.type as ColumnDefinition["type"],
      required: false,
      hidden: false,
      frozen: false,
      defaultValue: null,
      settings: {},
      permissions: {
        view: ["owner", "editor", "commenter", "viewer"],
        edit: ["owner", "editor"],
        configure: ["owner"],
      },
      validation: [],
      version: 1,
      order: index,
      createdAt: now,
      updatedAt: now,
    }));
  } else if (params.copyFromGroupId) {
    const sourceGroup = await groupRepo.findById(params.copyFromGroupId);
    const sourceIsCustom = sourceGroup.data?.columnMode === "custom";
    const source = sourceIsCustom
      ? await columnRepo.listGroupColumns(boardId, params.copyFromGroupId)
      : await columnRepo.findByBoard(boardId);
    sourceColumns = (source.data ?? []).map((col, index) => ({
      ...col,
      id: crypto.randomUUID(),
      groupId,
      order: index,
      createdAt: now,
      updatedAt: now,
    }));
  }

  for (const column of sourceColumns) {
    await columnRepo.create({
      ...column,
      organizationId,
      workspaceId,
    } as Parameters<typeof columnRepo.create>[0]);
  }
}

export const GroupService = {
  async create(input: CreateGroupInput, actorUserId: string): Promise<ApiResponse<Group>> {
    // Determine the next order value
    const existingResult = await groupRepo.findByBoard(input.boardId);
    const nextOrder = existingResult.data ? existingResult.data.length : 0;

    const columnMode = input.columnMode ?? "shared";

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
      columnMode,
      titleColumnLabel: resolveTitleColumnLabel(
        input.titleColumnLabel,
        DEFAULT_TITLE_COLUMN_LABEL,
      ),
    };

    const scope = { organizationId: input.organizationId, workspaceId: input.workspaceId, boardId: input.boardId };

    await eventBus.publish(createEvent("group.create:before", actorUserId, scope, group, null, group as unknown as Record<string, unknown>));
    const result = await groupRepo.create(group);
    if (result.data) {
      // A custom-mode group owns its own column set, so the columns have to
      // be created with `group_id` pointing at the new group. A shared-mode
      // group simply reuses the board's shared columns and needs nothing here.
      if (columnMode === "custom") {
        await createGroupColumns({
          boardId: input.boardId,
          organizationId: input.organizationId,
          workspaceId: input.workspaceId,
          groupId: result.data.id,
          copyFromGroupId: input.copyFromGroupId,
          explicitColumns: input.columns,
        });
      }
      await eventBus.publish(createEvent("group.create:after", actorUserId, scope, result.data, null, result.data as unknown as Record<string, unknown>));
    }
    return result;
  },

  /**
   * Update the group's title (record-title) column label.
   *
   * The label lives in its own field (`groups.title_column_label`) and is
   * never derived from a data column.
   */
  async updateTitleColumnLabel(
    input: { groupId: string; titleColumnLabel: string },
    actorUserId: string,
  ): Promise<ApiResponse<Group>> {
    const existing = await groupRepo.findById(input.groupId);
    if (!existing.data) return { data: null, error: "Group not found", status: 404 };

    const scope = { organizationId: "", workspaceId: "", boardId: existing.data.boardId };
    const before = { ...existing.data };
    const label = resolveTitleColumnLabel(input.titleColumnLabel);

    await eventBus.publish(createEvent("group.update:titleColumnLabel:before", actorUserId, scope, existing.data, before as unknown as Record<string, unknown>, { titleColumnLabel: label }));
    const result = await groupRepo.update(input.groupId, { titleColumnLabel: label });
    if (result.data) {
      await eventBus.publish(createEvent("group.update:titleColumnLabel:after", actorUserId, scope, result.data, before as unknown as Record<string, unknown>, result.data as unknown as Record<string, unknown>));
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
      columnMode: source.data.columnMode,
      titleColumnLabel: source.data.titleColumnLabel,
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

