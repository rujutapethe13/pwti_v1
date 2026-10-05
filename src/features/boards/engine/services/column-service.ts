/**
 * Column Service
 *
 * Business logic for Column CRUD operations.
 * Type changes use the Migration Engine for value coercion.
 * All mutations publish domain events via the Event Bus.
 */

import "server-only";

import { ColumnRepository } from "../repository/column-repository";
import { CellRepository } from "../repository/cell-repository";
import { getColumnTypeDefinition } from "../column-registry";
import { migrateColumnType, previewColumnTypeMigration } from "../migration";
import { eventBus } from "../events/event-bus";
import { metadataCache } from "../cache/metadata-cache";
import type { DomainEventPayload } from "../events/event-types";
import type { ApiResponse } from "@/types";
import type { ColumnDefinition, MigrationPreview, MigrationResult, ColumnValue, DropdownOption } from "../types";
import type {
  AddColumnInput,
  RenameColumnInput,
  DuplicateColumnInput,
  DeleteColumnInput,
  ReorderColumnsInput,
  HideColumnsInput,
  FreezeColumnInput,
  ChangeColumnTypeInput,
} from "../schemas/column-schemas";

const columnRepo = new ColumnRepository();
const cellRepo = new CellRepository();

function buildScope(column: ColumnDefinition) {
  return { organizationId: "", workspaceId: "", boardId: column.boardId, columnId: column.id };
}

function createEvent(
  eventName: DomainEventPayload["eventName"],
  actorUserId: string,
  column: ColumnDefinition,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  metadata: Record<string, unknown> = {},
): DomainEventPayload {
  return {
    eventId: crypto.randomUUID(),
    eventName,
    timestamp: new Date().toISOString(),
    actorUserId,
    scope: buildScope(column),
    before,
    after,
    metadata: { entityId: column.id, ...metadata },
  };
}

export const ColumnService = {
  async add(input: AddColumnInput, actorUserId: string): Promise<ApiResponse<ColumnDefinition>> {
    // Determine next order
    const existingResult = await columnRepo.findByBoard(input.boardId);
    const nextOrder = existingResult.data ? existingResult.data.length : 0;
    const typeDef = getColumnTypeDefinition(input.type);

    const column: ColumnDefinition = {
      id: crypto.randomUUID(),
      boardId: input.boardId,
      key: input.key,
      label: input.label,
      description: input.description,
      type: input.type,
      required: input.required,
      hidden: false,
      frozen: false,
      defaultValue: (input.defaultValue ?? typeDef.defaultValue) as ColumnValue,
      settings: {
        ...input.settings,
        ...(typeDef.defaultOptions && !input.settings.options ? { options: typeDef.defaultOptions.map((opt) => ({ ...opt })) } : {}),
      },
      permissions: {
        view: ["owner", "editor", "commenter", "viewer"],
        edit: ["owner", "editor"],
        configure: ["owner"],
      },
      validation: [],
      version: 1,
      order: nextOrder,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await eventBus.publish(createEvent("column.create:before", actorUserId, column, null, column as unknown as Record<string, unknown>));
    const result = await columnRepo.create({
      ...column,
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
    } as Parameters<typeof columnRepo.create>[0]);
    if (result.data) {
      await eventBus.publish(createEvent("column.create:after", actorUserId, result.data, null, result.data as unknown as Record<string, unknown>));
      metadataCache.invalidate("column", input.boardId);
    }
    return result;
  },

  async rename(input: RenameColumnInput, actorUserId: string): Promise<ApiResponse<ColumnDefinition>> {
    const existing = await columnRepo.findById(input.columnId);
    if (!existing.data) return existing as ApiResponse<ColumnDefinition>;

    const before = { ...existing.data };
    await eventBus.publish(createEvent("column.rename:before", actorUserId, existing.data, before as unknown as Record<string, unknown>, { label: input.label }));
    const result = await columnRepo.update(input.columnId, { label: input.label });
    if (result.data) {
      await eventBus.publish(createEvent("column.rename:after", actorUserId, result.data, before as unknown as Record<string, unknown>, result.data as unknown as Record<string, unknown>));
      metadataCache.invalidate("column", existing.data.boardId);
    }
    return result;
  },

  async duplicate(input: DuplicateColumnInput, actorUserId: string): Promise<ApiResponse<ColumnDefinition>> {
    const source = await columnRepo.findById(input.columnId);
    if (!source.data) return source as ApiResponse<ColumnDefinition>;

    const existingResult = await columnRepo.findByBoard(source.data.boardId);
    const nextOrder = existingResult.data ? existingResult.data.length : 0;

    const newColumn: ColumnDefinition = {
      ...source.data,
      id: crypto.randomUUID(),
      key: `${source.data.key}_copy`,
      label: `${source.data.label} (copy)`,
      order: nextOrder,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await eventBus.publish(createEvent("column.duplicate:before", actorUserId, source.data, source.data as unknown as Record<string, unknown>, null));
    const result = await columnRepo.create(newColumn);

    if (result.data && input.includeValues) {
      const cellsResult = await cellRepo.findByColumn(source.data.boardId, source.data.id);
      if (cellsResult.data) {
        for (const cell of cellsResult.data) {
          await cellRepo.create({
            id: crypto.randomUUID(),
            organizationId: cell.organizationId,
            workspaceId: cell.workspaceId,
            boardId: cell.boardId,
            recordId: cell.recordId,
            columnId: result.data.id,
            value: cell.value,
            valueText: cell.valueText,
            version: 1,
          } as Parameters<typeof cellRepo.create>[0]);
        }
      }
    }

    if (result.data) {
      await eventBus.publish(createEvent("column.duplicate:after", actorUserId, result.data, source.data as unknown as Record<string, unknown>, result.data as unknown as Record<string, unknown>));
      metadataCache.invalidate("column", source.data.boardId);
    }
    return result;
  },

  async delete(input: DeleteColumnInput, actorUserId: string): Promise<ApiResponse<null>> {
    const existing = await columnRepo.findById(input.columnId);
    if (!existing.data) return { data: null, error: "Column not found", status: 404 };

    await eventBus.publish(createEvent("column.delete:before", actorUserId, existing.data, existing.data as unknown as Record<string, unknown>, null));

    if (input.cascade) {
      await cellRepo.clearColumn(existing.data.boardId, input.columnId);
    }

    if (input.permanent) {
      await columnRepo.hardDelete(input.columnId);
    } else {
      await columnRepo.softDelete(input.columnId);
    }

    await eventBus.publish(createEvent("column.delete:after", actorUserId, existing.data, existing.data as unknown as Record<string, unknown>, null));
    metadataCache.invalidate("column", existing.data.boardId);
    return { data: null, error: null, status: 200 };
  },

  async reorder(input: ReorderColumnsInput, actorUserId: string): Promise<ApiResponse<null>> {
    await eventBus.publish({
      eventId: crypto.randomUUID(),
      eventName: "column.reorder:before",
      timestamp: new Date().toISOString(),
      actorUserId,
      scope: { organizationId: "", workspaceId: "", boardId: input.boardId },
      before: { columns: input.columns } as unknown as Record<string, unknown>,
      after: { columns: input.columns } as unknown as Record<string, unknown>,
      metadata: {},
    });

    const result = await columnRepo.reorder(input.boardId, input.columns);

    await eventBus.publish({
      eventId: crypto.randomUUID(),
      eventName: "column.reorder:after",
      timestamp: new Date().toISOString(),
      actorUserId,
      scope: { organizationId: "", workspaceId: "", boardId: input.boardId },
      before: null,
      after: { columns: input.columns } as unknown as Record<string, unknown>,
       metadata: { boardId: input.boardId },
    });

    metadataCache.invalidate("column", input.boardId);

    return result;
  },

  async hide(input: HideColumnsInput, actorUserId: string): Promise<ApiResponse<null>> {
    const action = input.hidden ? "hide" : "unhide";
    await eventBus.publish({
      eventId: crypto.randomUUID(),
      eventName: `column.${action}:before` as DomainEventPayload["eventName"],
      timestamp: new Date().toISOString(),
      actorUserId,
      scope: { organizationId: "", workspaceId: "", boardId: "" },
      before: { columnIds: input.columnIds } as unknown as Record<string, unknown>,
      after: { hidden: input.hidden } as unknown as Record<string, unknown>,
      metadata: {},
    });

    const result = await columnRepo.batchHide(input.columnIds, input.hidden);

    const firstColResult = await columnRepo.findById(input.columnIds[0]);
    if (firstColResult.data) {
      metadataCache.invalidate("column", firstColResult.data.boardId);
    }

    await eventBus.publish({
      eventId: crypto.randomUUID(),
      eventName: `column.${action}:after` as DomainEventPayload["eventName"],
      timestamp: new Date().toISOString(),
      actorUserId,
      scope: { organizationId: "", workspaceId: "", boardId: "" },
      before: null,
      after: { columnIds: input.columnIds, hidden: input.hidden } as unknown as Record<string, unknown>,
      metadata: {},
    });

    return result;
  },

  async freeze(input: FreezeColumnInput, actorUserId: string): Promise<ApiResponse<ColumnDefinition>> {
    const existing = await columnRepo.findById(input.columnId);
    if (!existing.data) return existing as ApiResponse<ColumnDefinition>;

    const before = { ...existing.data };
    await eventBus.publish(createEvent("column.freeze:before", actorUserId, existing.data, before as unknown as Record<string, unknown>, { frozen: input.frozen }));
    const result = await columnRepo.update(input.columnId, { frozen: input.frozen });
    if (result.data) {
      await eventBus.publish(createEvent("column.freeze:after", actorUserId, result.data, before as unknown as Record<string, unknown>, result.data as unknown as Record<string, unknown>));
      metadataCache.invalidate("column", existing.data.boardId);
    }
    return result;
  },

  async changeType(input: ChangeColumnTypeInput, actorUserId: string): Promise<ApiResponse<MigrationResult | MigrationPreview>> {
    const existing = await columnRepo.findById(input.columnId);
    if (!existing.data) return { data: null, error: "Column not found", status: 404 };

    const column = existing.data;
    const cellsResult = await cellRepo.findByColumn(column.boardId, column.id);
    const cellValues = (cellsResult.data ?? []).map((c) => ({
      recordId: c.recordId,
      value: c.value,
    }));

    // If preview, return migration preview
    if (input.preview) {
      const preview = previewColumnTypeMigration({
        column,
        toType: input.newType,
        values: cellValues,
      });
      return { data: preview, error: null, status: 200 };
    }

    // Execute migration
    const migration = migrateColumnType({ column, toType: input.newType, values: cellValues });
    const before = { ...column } as Record<string, unknown>;

    // Update column type and version
    await columnRepo.update(input.columnId, {
      type: input.newType,
      version: column.version + 1,
      defaultValue: getColumnTypeDefinition(input.newType).defaultValue,
    });

    metadataCache.invalidate("column", column.boardId);

    // Update cell values to coerced values
    for (const updated of migration.updatedValues) {
      await cellRepo.update(
        `${column.boardId}:${updated.recordId}:${column.id}`,
        { value: updated.value },
      );
    }

    await eventBus.publish(createEvent("column.change_type:after", actorUserId, column, before, { type: input.newType } as unknown as Record<string, unknown>, {
      migration: { fromType: column.type, toType: input.newType, clearedCount: migration.clearedValueCount },
    }));

    return { data: migration, error: null, status: 200 };
  },

  async updateOptions(input: { columnId: string; options: DropdownOption[] }, actorUserId: string): Promise<ApiResponse<ColumnDefinition>> {
    const existing = await columnRepo.findById(input.columnId);
    if (!existing.data) return { data: null, error: "Column not found", status: 404 };

    const before = { ...existing.data };
    await eventBus.publish(createEvent("column.update_options:before", actorUserId, existing.data, before as unknown as Record<string, unknown>, { options: input.options }));

    const currentSettings = existing.data.settings ?? {};
    const updatedSettings = { ...currentSettings, options: input.options };

    const result = await columnRepo.update(input.columnId, { settings: updatedSettings });
    if (result.data) {
      await eventBus.publish(createEvent("column.update_options:after", actorUserId, result.data, before as unknown as Record<string, unknown>, result.data as unknown as Record<string, unknown>));
      metadataCache.invalidate("column", existing.data.boardId);
    }
    return result;
  },
};

