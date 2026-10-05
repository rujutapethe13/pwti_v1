/**
 * Record Service
 *
 * Business logic for Record CRUD operations.
 * Supports single-record and bulk operations.
 * All mutations publish domain events via the Event Bus.
 */

import "server-only";

import { RecordRepository } from "../repository/record-repository";
import { CellRepository } from "../repository/cell-repository";
import { eventBus } from "../events/event-bus";
import { initializeActivityLogging } from "../events/activity-log-subscriber";
import type { DomainEventPayload } from "../events/event-types";
import type { ApiResponse } from "@/types";
import type { BoardRecord, ColumnValue, EntityStatus } from "../types";
import type {
  CreateRecordInput,
  EditRecordInput,
  DuplicateRecordInput,
  DeleteRecordInput,
  ArchiveRecordInput,
  RestoreRecordInput,
  MoveRecordInput,
  BulkUpdateInput,
  BulkDeleteInput,
  BulkCreateRecordsInput,
} from "../schemas/record-schemas";

initializeActivityLogging();

const recordRepo = new RecordRepository();
const cellRepo = new CellRepository();

const IMPORT_BATCH_SIZE = 500;

function buildScope(record: BoardRecord) {
  return {
    organizationId: record.organizationId,
    workspaceId: record.workspaceId,
    boardId: record.boardId,
  };
}

function createEvent(
  eventName: DomainEventPayload["eventName"],
  actorUserId: string,
  record: BoardRecord,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  metadata: Record<string, unknown> = {},
): DomainEventPayload {
  return {
    eventId: crypto.randomUUID(),
    eventName,
    timestamp: new Date().toISOString(),
    actorUserId,
    scope: buildScope(record),
    before,
    after,
    metadata: { entityId: record.id, ...metadata },
  };
}

export const RecordService = {
  async create(input: CreateRecordInput, actorUserId: string): Promise<ApiResponse<BoardRecord>> {
    const record: BoardRecord = {
      id: crypto.randomUUID(),
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      boardId: input.boardId,
      groupId: input.groupId ?? null,
      title: input.title,
      status: "active",
      version: 1,
      archivedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await eventBus.publish(createEvent("record.create:before", actorUserId, record, null, record as unknown as Record<string, unknown>));
    const result = await recordRepo.create(record);

    // Create initial cell values
    if (result.data) {
      for (const [columnId, value] of Object.entries(input.cellValues)) {
        const cellResult = await cellRepo.create({
          id: `${record.boardId}:${record.id}:${columnId}`,
          organizationId: record.organizationId,
          workspaceId: record.workspaceId,
          boardId: record.boardId,
          recordId: record.id,
          columnId,
          value,
          valueText: typeof value === "string" ? value : JSON.stringify(value),
          version: 1,
        } as Parameters<typeof cellRepo.create>[0]);
        if (cellResult.error) {
          console.error(
            `Failed to create cell value for column ${columnId} on record ${record.id}:`,
            cellResult.error,
          );
        }
      }

      await eventBus.publish(createEvent("record.create:after", actorUserId, result.data, null, result.data as unknown as Record<string, unknown>));
    }

    return result;
  },

   /**
    * Bulk-create records and their cell values in batched multi-row
    * inserts within a minimal number of round-trips.
    *
    * Replaces the row-by-row `createRecord` + per-cell `create` pattern
    * that previously issued one DB request per record and one per cell
    * (N + N×M round-trips for N records with M columns).
    */
   async bulkCreate(
     input: BulkCreateRecordsInput,
     actorUserId: string,
   ): Promise<
     ApiResponse<{
       createdRecords: BoardRecord[];
       importErrors: Array<{ rowIndex: number; reason: string }>;
     }>
   > {
     const now = new Date().toISOString();

     const scope = {
       organizationId: input.organizationId,
       workspaceId: input.workspaceId,
       boardId: input.boardId,
     };

     await eventBus.publish({
       eventId: crypto.randomUUID(),
       eventName: "record.bulk_create:before",
       timestamp: now,
       actorUserId,
       scope,
       before: null,
       after: { recordCount: input.records.length } as unknown as Record<string, unknown>,
       metadata: {},
     });

     const importErrors: Array<{ rowIndex: number; reason: string }> = [];
     const createdRecords: BoardRecord[] = [];

     // ── 1) Generate record entities (client-side IDs, no round-trip) ──
     const entities: BoardRecord[] = input.records.map((rec, index) => ({
       id: crypto.randomUUID(),
       organizationId: input.organizationId,
       workspaceId: input.workspaceId,
       boardId: input.boardId,
       groupId: input.groupId ?? null,
       title: rec.title,
       status: "active" as EntityStatus,
       version: 1,
       archivedAt: null,
       createdAt: now,
       updatedAt: now,
     }));

     // ── 2) Batch-insert records in chunks ──
     for (let i = 0; i < entities.length; i += IMPORT_BATCH_SIZE) {
       const batch = entities.slice(i, i + IMPORT_BATCH_SIZE);
       const result = await recordRepo.bulkUpsert(batch);
       if (result.error) {
         for (let j = 0; j < batch.length; j++) {
           importErrors.push({
             rowIndex: i + j,
             reason: result.error,
           });
         }
       } else {
         createdRecords.push(...batch);
       }
     }

     if (createdRecords.length === 0) {
       await eventBus.publish({
         eventId: crypto.randomUUID(),
         eventName: "record.bulk_create:after",
         timestamp: new Date().toISOString(),
         actorUserId,
         scope,
         before: null,
         after: { createdCount: 0, errorCount: importErrors.length } as unknown as Record<string, unknown>,
         metadata: {},
       });
       return { data: { createdRecords: [], importErrors }, error: null, status: 200 };
     }

     // ── 3) Build all cell-value payloads in memory ──
     const cellPayloads: Array<{
       id: string;
       organizationId: string;
       workspaceId: string;
       boardId: string;
       recordId: string;
       columnId: string;
       value: ColumnValue;
       valueText: string;
     }> = [];

     for (let i = 0; i < input.records.length; i++) {
       const rec = input.records[i];
       const entity = entities[i];
       if (!entity) continue;

       for (const [columnId, value] of Object.entries(rec.cellValues ?? {})) {
         cellPayloads.push({
           id: `${entity.boardId}:${entity.id}:${columnId}`,
           organizationId: entity.organizationId,
           workspaceId: entity.workspaceId,
           boardId: entity.boardId,
           recordId: entity.id,
            columnId,
            value: value as ColumnValue,
           valueText: typeof value === "string" ? value : JSON.stringify(value),
         });
       }
     }

     // ── 4) Batch-upsert cell values in chunks ──
     for (let i = 0; i < cellPayloads.length; i += IMPORT_BATCH_SIZE) {
       const chunk = cellPayloads.slice(i, i + IMPORT_BATCH_SIZE);
       const result = await cellRepo.bulkUpsert(chunk);
       if (result.error) {
         importErrors.push({
           rowIndex: i,
           reason: `Bulk cell insert failed: ${result.error}`,
         });
       }
     }

     await eventBus.publish({
       eventId: crypto.randomUUID(),
       eventName: "record.bulk_create:after",
       timestamp: new Date().toISOString(),
       actorUserId,
       scope,
       before: null,
       after: { createdCount: createdRecords.length, cellCount: cellPayloads.length } as unknown as Record<string, unknown>,
       metadata: {},
     });

     return {
       data: { createdRecords, importErrors },
       error: null,
       status: 201,
    };
   },

   async edit(input: EditRecordInput, actorUserId: string): Promise<ApiResponse<BoardRecord>> {
    const existing = await recordRepo.findById(input.recordId);
    if (!existing.data) return existing as ApiResponse<BoardRecord>;

    const before = { ...existing.data };

    const updates: Partial<BoardRecord> = {};
    if (input.title !== undefined) updates.title = input.title;
    if (input.groupId !== undefined) updates.groupId = input.groupId;

    await eventBus.publish(createEvent("record.update:before", actorUserId, existing.data, before as unknown as Record<string, unknown>, updates as unknown as Record<string, unknown>));

    const result = await recordRepo.update(input.recordId, updates);

    // Update cell values
    if (result.data && input.cellValues) {
      for (const [columnId, value] of Object.entries(input.cellValues)) {
        const cellResult = await cellRepo.create({
          id: `${result.data.boardId}:${result.data.id}:${columnId}`,
          organizationId: result.data.organizationId,
          workspaceId: result.data.workspaceId,
          boardId: result.data.boardId,
          recordId: result.data.id,
          columnId,
          value,
          valueText: typeof value === "string" ? value : JSON.stringify(value),
          version: 1,
        } as Parameters<typeof cellRepo.create>[0]);
        if (cellResult.error) {
          console.error(
            `Failed to update cell value for column ${columnId} on record ${result.data.id}:`,
            cellResult.error,
          );
        }
      }
    }

    if (result.data) {
      await eventBus.publish(createEvent("record.update:after", actorUserId, result.data, before as unknown as Record<string, unknown>, result.data as unknown as Record<string, unknown>));
    }

    return result;
  },

  async duplicate(input: DuplicateRecordInput, actorUserId: string): Promise<ApiResponse<BoardRecord>> {
    const source = await recordRepo.findById(input.recordId);
    if (!source.data) return source as ApiResponse<BoardRecord>;

    const newRecord: BoardRecord = {
      ...source.data,
      id: crypto.randomUUID(),
      title: input.newTitle ?? `${source.data.title} (copy)`,
      groupId: input.targetGroupId ?? source.data.groupId,
      version: 1,
      archivedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await eventBus.publish(createEvent("record.duplicate:before", actorUserId, source.data, source.data as unknown as Record<string, unknown>, null));
    const result = await recordRepo.create(newRecord);

    // Duplicate cell values
    if (result.data) {
      const cellsResult = await cellRepo.findByRecord(source.data.id);
      if (cellsResult.data) {
        for (const cell of cellsResult.data) {
          await cellRepo.create({
            id: `${result.data.boardId}:${result.data.id}:${cell.columnId}`,
            organizationId: result.data.organizationId,
            workspaceId: result.data.workspaceId,
            boardId: result.data.boardId,
            recordId: result.data.id,
            columnId: cell.columnId,
            value: cell.value,
            valueText: cell.valueText,
            version: 1,
          } as Parameters<typeof cellRepo.create>[0]);
        }
      }

      await eventBus.publish(createEvent("record.duplicate:after", actorUserId, result.data, source.data as unknown as Record<string, unknown>, result.data as unknown as Record<string, unknown>));
    }

    return result;
  },

  async delete(input: DeleteRecordInput, actorUserId: string): Promise<ApiResponse<null>> {
    const existing = await recordRepo.findById(input.recordId);
    if (!existing.data) return { data: null, error: "Record not found", status: 404 };

    await eventBus.publish(createEvent("record.delete:before", actorUserId, existing.data, existing.data as unknown as Record<string, unknown>, null));

    if (input.permanent) {
      await cellRepo.clearRecord(input.recordId);
      await recordRepo.hardDelete(input.recordId);
    } else {
      await recordRepo.softDelete(input.recordId);
    }

    await eventBus.publish(createEvent("record.delete:after", actorUserId, existing.data, existing.data as unknown as Record<string, unknown>, null));
    return { data: null, error: null, status: 200 };
  },

  async archive(input: ArchiveRecordInput, actorUserId: string): Promise<ApiResponse<BoardRecord>> {
    const existing = await recordRepo.findById(input.recordId);
    if (!existing.data) return existing as ApiResponse<BoardRecord>;

    const before = { ...existing.data };
    await eventBus.publish(createEvent("record.archive:before", actorUserId, existing.data, before as unknown as Record<string, unknown>, null));
    const result = await recordRepo.softDelete(input.recordId);
    if (result.data) {
      await eventBus.publish(createEvent("record.archive:after", actorUserId, result.data, before as unknown as Record<string, unknown>, result.data as unknown as Record<string, unknown>));
    }
    return result;
  },

  async restore(input: RestoreRecordInput, actorUserId: string): Promise<ApiResponse<BoardRecord>> {
    const existing = await recordRepo.findById(input.recordId);
    if (!existing.data) return existing as ApiResponse<BoardRecord>;

    const before = { ...existing.data };
    await eventBus.publish(createEvent("record.restore:before", actorUserId, existing.data, before as unknown as Record<string, unknown>, null));
    const result = await recordRepo.update(input.recordId, { status: "active", archivedAt: null });
    if (result.data) {
      await eventBus.publish(createEvent("record.restore:after", actorUserId, result.data, before as unknown as Record<string, unknown>, result.data as unknown as Record<string, unknown>));
    }
    return result;
  },

  async move(input: MoveRecordInput, actorUserId: string): Promise<ApiResponse<BoardRecord>> {
    const existing = await recordRepo.findById(input.recordId);
    if (!existing.data) return existing as ApiResponse<BoardRecord>;

    const before = { ...existing.data };
    await eventBus.publish(createEvent("record.move:before", actorUserId, existing.data, before as unknown as Record<string, unknown>, { targetGroupId: input.targetGroupId }));
    const result = await recordRepo.moveToGroup(input.recordId, input.targetGroupId);
    if (result.data) {
      await eventBus.publish(createEvent("record.move:after", actorUserId, result.data, before as unknown as Record<string, unknown>, result.data as unknown as Record<string, unknown>));
    }
    return result;
  },

  async bulkUpdate(input: BulkUpdateInput, actorUserId: string): Promise<ApiResponse<null>> {
    // Fetch one record to build scope
    const firstRecord = await recordRepo.findById(input.recordIds[0]);
    if (!firstRecord.data) return { data: null, error: "Records not found", status: 404 };
    const scope = buildScope(firstRecord.data);

    await eventBus.publish({
      eventId: crypto.randomUUID(),
      eventName: "record.bulk_update:before",
      timestamp: new Date().toISOString(),
      actorUserId,
      scope,
      before: { recordIds: input.recordIds } as unknown as Record<string, unknown>,
      after: { cellValues: input.cellValues } as unknown as Record<string, unknown>,
      metadata: {},
    });

    // Update cell values for all records
    for (const recordId of input.recordIds) {
      for (const [columnId, value] of Object.entries(input.cellValues)) {
        await cellRepo.create({
          id: `${firstRecord.data.boardId}:${recordId}:${columnId}`,
          organizationId: firstRecord.data.organizationId,
          workspaceId: firstRecord.data.workspaceId,
          boardId: firstRecord.data.boardId,
          recordId,
          columnId,
          value,
          valueText: typeof value === "string" ? value : JSON.stringify(value),
          version: 1,
        } as Parameters<typeof cellRepo.create>[0]);
      }
    }

    // Move records to target group if specified
    if (input.targetGroupId) {
      for (const recordId of input.recordIds) {
        await recordRepo.update(recordId, { groupId: input.targetGroupId });
      }
    }

    await eventBus.publish({
      eventId: crypto.randomUUID(),
      eventName: "record.bulk_update:after",
      timestamp: new Date().toISOString(),
      actorUserId,
      scope,
      before: null,
      after: { recordIds: input.recordIds } as unknown as Record<string, unknown>,
      metadata: { count: input.recordIds.length },
    });

    return { data: null, error: null, status: 200 };
  },

  async bulkDelete(input: BulkDeleteInput, actorUserId: string): Promise<ApiResponse<null>> {
    const firstRecord = await recordRepo.findById(input.recordIds[0]);
    if (!firstRecord.data) return { data: null, error: "Records not found", status: 404 };
    const scope = buildScope(firstRecord.data);

    await eventBus.publish({
      eventId: crypto.randomUUID(),
      eventName: "record.bulk_delete:before",
      timestamp: new Date().toISOString(),
      actorUserId,
      scope,
      before: { recordIds: input.recordIds } as unknown as Record<string, unknown>,
      after: null,
      metadata: {},
    });

    const result = await recordRepo.bulkDelete(input.recordIds, input.permanent);

    await eventBus.publish({
      eventId: crypto.randomUUID(),
      eventName: "record.bulk_delete:after",
      timestamp: new Date().toISOString(),
      actorUserId,
      scope,
      before: null,
      after: { recordIds: input.recordIds } as unknown as Record<string, unknown>,
      metadata: { count: input.recordIds.length, permanent: input.permanent },
    });

    return result;
  },
};

