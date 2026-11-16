/**
 * Cell Value Service
 *
 * Business logic for Cell Value operations.
 * Each cell update is validated against its Column Definition's type rules
 * using the Column Registry — no switch statements.
 */

import "server-only";

import { CellRepository } from "../repository/cell-repository";
import { ColumnRepository } from "../repository/column-repository";
import { eventBus } from "../events/event-bus";
import { initializeActivityLogging } from "../events/activity-log-subscriber";
import type { DomainEventPayload } from "../events/event-types";
import type { ApiResponse } from "@/types";
import type { ColumnValue, ColumnDefinition } from "../types";
import type { UpdateCellInput, BulkUpdateCellsInput, ClearCellInput } from "../schemas/cell-schemas";
import { isEmptyDateValue, normalizeDateToYmd } from "@/features/automations/date-utils";
import { toValueText } from "../lib/cell-value";

initializeActivityLogging();

const cellRepo = new CellRepository();
const columnRepo = new ColumnRepository();

function normalizeDateCell(column: ColumnDefinition | undefined, value: unknown): ColumnValue {
  if (!column || (column.type !== "date" && column.type !== "timeline")) return value as ColumnValue;
  if (isEmptyDateValue(value)) return null;
  const ymd = normalizeDateToYmd(value);
  return ymd !== null ? ymd : null;
}

export const CellService = {
  /**
   * Update a single cell value.
   * Uses Column Registry to validate and format the value.
   */
  async update(input: UpdateCellInput, actorUserId: string): Promise<ApiResponse<{ id: string; value: ColumnValue }>> {
    const cellId = `${input.boardId}:${input.recordId}:${input.columnId}`;

    // Validate against column definition
    const columnResult = await columnRepo.findById(input.columnId);
    if (!columnResult.data) {
      return { data: null, error: "Column not found", status: 404 };
    }

    const column = columnResult.data;
    const normalizedValue = normalizeDateCell(column, input.value);

    const valueText = toValueText(normalizedValue);

    const result = await cellRepo.upsert({
      id: cellId,
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      boardId: input.boardId,
      recordId: input.recordId,
      columnId: input.columnId,
      value: normalizedValue,
      valueText,
      version: 1,
    } as Parameters<typeof cellRepo.upsert>[0]);

    if (result.error) {
      return { data: null, error: result.error, status: result.status };
    }

    if (result.data) {
      const scope = {
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        boardId: input.boardId,
        columnId: input.columnId,
      };

      await eventBus.publish({
        eventId: crypto.randomUUID(),
        eventName: "cell.update:after",
        timestamp: new Date().toISOString(),
        actorUserId,
        scope,
        before: null,
        after: { value: normalizedValue } as unknown as Record<string, unknown>,
        metadata: { recordId: input.recordId, columnId: input.columnId },
      });
    }

    return { data: { id: cellId, value: normalizedValue as ColumnValue }, error: null, status: 200 };
  },

  /**
   * Bulk update multiple cell values.
   */
  async bulkUpdate(input: BulkUpdateCellsInput, actorUserId: string): Promise<ApiResponse<null>> {
    const scope = {
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      boardId: input.boardId,
    };

    await eventBus.publish({
      eventId: crypto.randomUUID(),
      eventName: "cell.bulk_update:before",
      timestamp: new Date().toISOString(),
      actorUserId,
      scope,
      before: null,
      after: { updates: input.updates } as unknown as Record<string, unknown>,
      metadata: { count: input.updates.length },
    });

    const columnsResult = await columnRepo.findByBoard(input.boardId);
    const colMap = new Map<string, ColumnDefinition>();
    for (const c of columnsResult.data || []) colMap.set(c.id, c);

    await cellRepo.upsertMany(
      input.updates.map((update) => {
        const cellId = `${input.boardId}:${update.recordId}:${update.columnId}`;
        const normalizedValue = normalizeDateCell(colMap.get(update.columnId), update.value);
        const valueText = toValueText(normalizedValue);
        return {
          id: cellId,
          organization_id: input.organizationId,
          workspace_id: input.workspaceId,
          board_id: input.boardId,
          record_id: update.recordId,
          column_id: update.columnId,
          value: normalizedValue,
          value_text: valueText,
          version: 1,
        };
      }),
    );

    await eventBus.publish({
      eventId: crypto.randomUUID(),
      eventName: "cell.bulk_update:after",
      timestamp: new Date().toISOString(),
      actorUserId,
      scope,
      before: null,
      after: { updates: input.updates } as unknown as Record<string, unknown>,
      metadata: { count: input.updates.length },
    });

    return { data: null, error: null, status: 200 };
  },

  /**
   * Clear a cell value (reset to column default).
   */
  async clear(input: ClearCellInput, actorUserId: string): Promise<ApiResponse<null>> {
    const cellId = `${input.boardId}:${input.recordId}:${input.columnId}`;

    await eventBus.publish({
      eventId: crypto.randomUUID(),
      eventName: "cell.update:before",
      timestamp: new Date().toISOString(),
      actorUserId,
      scope: {
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        boardId: input.boardId,
        columnId: input.columnId,
      },
      before: null,
      after: null,
      metadata: { recordId: input.recordId, columnId: input.columnId },
    });

    // Delete the cell entry to reset to column default
    await cellRepo.hardDelete(cellId);

    return { data: null, error: null, status: 200 };
  },
};

