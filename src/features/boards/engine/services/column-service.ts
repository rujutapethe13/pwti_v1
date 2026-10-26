/**
 * Column Service
 *
 * Business logic for Column CRUD operations.
 * Type changes use the Migration Engine for value coercion.
 * All mutations publish domain events via the Event Bus.
 */

import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import { ColumnRepository } from "../repository/column-repository";
import { CellRepository } from "../repository/cell-repository";
import { getColumnTypeDefinition } from "../column-registry";
import { normalizeOptions } from "../lib/option-lookup";
import { migrateColumnType, previewColumnTypeMigration } from "../migration";
import { eventBus } from "../events/event-bus";
import { metadataCache } from "../cache/metadata-cache";
import { isTextCompatibleColumn } from "../lib/primary-column";
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
  DeleteBoardColumnsInput,
} from "../schemas/column-schemas";

const columnRepo = new ColumnRepository();
const cellRepo = new CellRepository();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(value: string): boolean {
  return UUID_RE.test(value);
}

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

    // A status column's labels live in `settings.labels`; the legacy
    // `settings.options` array is kept as an exact mirror so older readers
    // (import/export, client-360 search, analytics) stay correct. When the
    // caller supplies either array, it wins over the registry defaults —
    // otherwise the two arrays would drift apart and the read path (which
    // prefers `labels`) would silently ignore the caller's options.
    const defaultOptions = typeDef.defaultOptions?.map((opt) => ({ ...opt })) ?? [];
    const settings: Record<string, unknown> = { ...input.settings };
    const providedOptions = normalizeOptions(settings.options);
    const effectiveOptions = providedOptions.length > 0 ? providedOptions : defaultOptions;
    if (effectiveOptions.length > 0) settings.options = effectiveOptions;

    if (input.type === "status") {
      const providedLabels = normalizeOptions(settings.labels);
      const effectiveLabels = providedLabels.length > 0 ? providedLabels : effectiveOptions;
      settings.labels = effectiveLabels;
      settings.options = effectiveLabels;
    }

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
      settings,
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
    if (!isValidUuid(input.columnId)) {
      return { data: null, error: "Invalid column ID", status: 400 };
    }

    const existing = await columnRepo.findById(input.columnId);
    if (!existing.data) {
      // Deletion is intentionally idempotent. The cleanup RPC only needs the
      // id and is safe when the column row has already disappeared.
      const client = await createServiceClient();
      const { error } = await client.rpc("cleanup_column_dependents", {
        p_column_id: input.columnId,
      });
      if (error) {
        console.error("[column-service] cleanup for missing column failed:", error);
        return { data: null, error: error.message, status: 500 };
      }
      return { data: null, error: null, status: 200 };
    }

    const column = existing.data;
    if (column.isPrimary) {
      return { data: null, error: "Choose another primary column first", status: 409 };
    }

    await eventBus.publish(createEvent("column.delete:before", actorUserId, column, column as unknown as Record<string, unknown>, null));

    const client = await createServiceClient();

    // Check for dependents (formula/mirror/lookup/rollup columns referencing this one)
    const { data: dependentsData, error: depError } = await client.rpc("get_column_dependents", {
      p_column_id: input.columnId,
    });

    if (depError) {
      return { data: null, error: depError.message, status: 500 };
    }

    let dependents = (dependentsData as { dependencies?: unknown[] } | null)?.dependencies ?? [];
    // Mirrors are disposable projections. Removing their Connect Boards
    // source must remove the projections first rather than leaving dangling
    // settings that crash the board renderer.
    if (column.type === "connected_board") {
      const boardColumns = await columnRepo.findByBoard(column.boardId);
      for (const dependent of boardColumns.data ?? []) {
        if (dependent.type !== "mirror") continue;
        const settings = dependent.settings as Record<string, unknown>;
        if (settings.source_connect_column_id !== column.id) continue;
        const result = await this.delete(
          { columnId: dependent.id, cascade: true, permanent: input.permanent },
          actorUserId,
        );
        if (result.error) return result;
      }
      const refreshed = await client.rpc("get_column_dependents", {
        p_column_id: input.columnId,
      });
      if (refreshed.error) {
        return { data: null, error: refreshed.error.message, status: 500 };
      }
      dependents = (refreshed.data as { dependencies?: unknown[] } | null)?.dependencies ?? [];
    }
    if (dependents.length > 0) {
      return {
        data: null,
        error: `Cannot delete "${column.label}": other columns depend on it. Remove those columns first.`,
        status: 409,
      };
    }

    // Clean up view config references and dependency edges (idempotent RPC)
    const { error: cleanupError } = await client.rpc("cleanup_column_dependents", {
      p_column_id: input.columnId,
    });

    if (cleanupError) {
      return { data: null, error: cleanupError.message, status: 500 };
    }

    if (input.cascade) {
      await cellRepo.clearColumn(column.boardId, input.columnId);
    }

    if (input.permanent) {
      await columnRepo.hardDelete(input.columnId);
    } else {
      await columnRepo.softDelete(input.columnId);
    }

    await eventBus.publish(createEvent("column.delete:after", actorUserId, column, column as unknown as Record<string, unknown>, null));
    metadataCache.invalidate("column", column.boardId);
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
    if (column.isPrimary) {
      const replacementType = input.newType as ColumnDefinition["type"];
      if (!isTextCompatibleColumn({ ...column, type: replacementType })) {
        return { data: null, error: "Choose another primary column first", status: 409 };
      }
    }
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

  /**
   * Write a column's label list to the right place.
   *
   * A status column's labels live in `settings.labels`; `settings.options` is
   * written as an exact mirror so the legacy readers keep working. Every
   * other option column type keeps its list in `settings.options`.
   */
  async writeLabelList(
    column: ColumnDefinition,
    labels: DropdownOption[],
  ): Promise<ApiResponse<ColumnDefinition>> {
    const settings = { ...(column.settings ?? {}) };
    if (column.type === "status") {
      settings.labels = labels;
      settings.options = labels;
    } else {
      settings.options = labels;
    }
    return columnRepo.update(column.id, { settings });
  },

  async updateOptions(input: { columnId: string; options: DropdownOption[] }, actorUserId: string): Promise<ApiResponse<ColumnDefinition>> {
    const existing = await columnRepo.findById(input.columnId);
    if (!existing.data) return { data: null, error: "Column not found", status: 404 };

    const before = { ...existing.data };
    await eventBus.publish(createEvent("column.update_options:before", actorUserId, existing.data, before as unknown as Record<string, unknown>, { options: input.options }));

    const result = await ColumnService.writeLabelList(existing.data, input.options);
    if (result.data) {
      await eventBus.publish(createEvent("column.update_options:after", actorUserId, result.data, before as unknown as Record<string, unknown>, result.data as unknown as Record<string, unknown>));
      metadataCache.invalidate("column", existing.data.boardId);
    }
    return result;
  },

  /**
   * Write a column's label list (the Edit Labels "Apply" path).
   *
   * For a status column the list is written to `settings.labels` — the
   * canonical location every surface reads from — and mirrored into
   * `settings.options`.
   */
  async updateLabels(input: { columnId: string; labels: DropdownOption[] }, actorUserId: string): Promise<ApiResponse<ColumnDefinition>> {
    const existing = await columnRepo.findById(input.columnId);
    if (!existing.data) return { data: null, error: "Column not found", status: 404 };

    const before = { ...existing.data };
    await eventBus.publish(createEvent("column.update_options:before", actorUserId, existing.data, before as unknown as Record<string, unknown>, { labels: input.labels }));

    const result = await ColumnService.writeLabelList(existing.data, input.labels);
    if (result.data) {
      await eventBus.publish(createEvent("column.update_options:after", actorUserId, result.data, before as unknown as Record<string, unknown>, result.data as unknown as Record<string, unknown>));
      metadataCache.invalidate("column", existing.data.boardId);
    }
    return result;
  },

  async deleteBoardColumns(input: DeleteBoardColumnsInput, actorUserId: string): Promise<ApiResponse<null>> {
    const firstColResult = await columnRepo.findById(input.columnIds[0]);
    if (!firstColResult.data) {
      return { data: null, error: "Column not found", status: 404 };
    }

    await eventBus.publish({
      eventId: crypto.randomUUID(),
      eventName: "column.bulk_delete:before",
      timestamp: new Date().toISOString(),
      actorUserId,
      scope: { organizationId: "", workspaceId: "", boardId: input.boardId },
      before: { columnIds: input.columnIds } as unknown as Record<string, unknown>,
      after: null,
      metadata: { boardId: input.boardId },
    });

    const result = await columnRepo.batchSoftDelete(input.columnIds);

    metadataCache.invalidate("column", firstColResult.data.boardId);

    await eventBus.publish({
      eventId: crypto.randomUUID(),
      eventName: "column.bulk_delete:after",
      timestamp: new Date().toISOString(),
      actorUserId,
      scope: { organizationId: "", workspaceId: "", boardId: input.boardId },
      before: null,
      after: { columnIds: input.columnIds } as unknown as Record<string, unknown>,
      metadata: { boardId: input.boardId },
    });

    return result;
  },
};
