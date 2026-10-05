/**
 * Connected Data — Query Engine Extension
 *
 * Extends the existing Query Service (does NOT replace it) to support:
 *   - Relationship traversal
 *   - Deep fetch of connected records
 *   - Resolution of mirror/lookup/rollup/formula values
 *   - Caching and lazy evaluation
 *
 * ── Architecture ─────────────────────────────────────────────
 * Views consume ONLY the Query Service. The Query Service delegates
 * to this extension when it encounters derived columns.
 *
 * This extension integrates with the existing BoardQueryResult:
 *   cellValues: Map<string, ColumnValue>
 *
 * Derived column values are ADDED to the same cellValues map so
 * existing cell renderers and views continue to work unchanged.
 * ────────────────────────────────────────────────────────────
 */

import "server-only";

import { ColumnRepository } from "../repository/column-repository";
import { RecordRepository } from "../repository/record-repository";
import { RelationshipEngine } from "./relationship-engine";
import { MirrorService } from "./mirror-service";
import { LookupService } from "./lookup-service";
import { RollupService } from "./rollup-service";
import { FormulaEngine } from "./formula-engine";
import { DerivedValueCache } from "./cache";
import {
  buildDependencyGraph,
  extractDerivedColumnConfigs,
  getRecalculationOrder,
} from "./dependency-graph";
import type { ApiResponse } from "@/types";
import type {
  BoardDefinition,
  BoardRecord,
  ColumnDefinition,
  ColumnValue,
} from "../types";
import type { Relationship, FormulaConfig } from "./types";

export const ConnectedDataQueryExtension = {
  /**
   * Resolve all derived values for a board's records.
   * Called by the Query Service after loading base cell values.
   *
   * This is the LAZY EVALUATION path — resolves values on read
   * if they haven't been cached by the event subscriber.
   */
  async resolveDerivedValues(
    organizationId: string,
    workspaceId: string,
    boardId: string,
    columns: ColumnDefinition[],
    records: BoardRecord[],
    existingCellValues: Map<string, ColumnValue>,
  ): Promise<ApiResponse<Map<string, ColumnValue>>> {
    const result = new Map(existingCellValues);

    // Find derived columns
    const derivedColumns = columns.filter((c) =>
      ["connected_board", "mirror", "lookup", "rollup", "formula"].includes(c.type),
    );

    if (derivedColumns.length === 0) {
      return { data: result, error: null, status: 200 };
    }

    // Build dependency graph to determine resolution order
    const derivedConfigs = extractDerivedColumnConfigs(columns);
    const graph = buildDependencyGraph({ columns, derivedConfigs });

    // Get resolution order (dependencies first)
    let resolutionOrder: string[];
    try {
      resolutionOrder = getRecalculationOrder(graph);
    } catch {
      // Fall back to flat resolution if cycle detection fails
      resolutionOrder = derivedColumns.map((c) => c.id);
    }

    // Resolve in dependency order
    for (const columnId of resolutionOrder) {
      const column = derivedColumns.find((c) => c.id === columnId);
      if (!column) continue;

      for (const record of records) {
        const cellKey = `${record.id}:${column.id}`;
        if (result.has(cellKey)) continue; // Already resolved

        // Check cache
        const cached = DerivedValueCache.get(record.id, column.id);
        if (cached !== undefined) {
          result.set(cellKey, cached);
          continue;
        }

        // Resolve on demand
        const value = await this.resolveSingleDerivedValue(
          organizationId,
          workspaceId,
          boardId,
          record,
          column,
          result,
        );

        if (value !== undefined) {
          result.set(cellKey, value);
          DerivedValueCache.set(record.id, column.id, value);
        }
      }
    }

    // Resolve Connected Board column values (relationship IDs)
    for (const column of derivedColumns) {
      if (column.type !== "connected_board") continue;

      for (const record of records) {
        const cellKey = `${record.id}:${column.id}`;
        if (result.has(cellKey)) continue;

        // Get the relationships for this record + column
        const relResult = await RelationshipEngine.getBySource(
          boardId,
          record.id,
          column.id,
        );

        if (relResult.data && relResult.data.length > 0) {
          // Store the list of related record IDs as the cell value
          const relatedRecordIds = relResult.data.map((r) => ({
            id: r.targetRecordId,
            boardId: r.targetBoardId,
          }));
          result.set(cellKey, relatedRecordIds as unknown as ColumnValue);
        } else {
          result.set(cellKey, null);
        }
      }
    }

    return { data: result, error: null, status: 200 };
  },

  /**
   * Resolve a single derived value for a record.
   */
  async resolveSingleDerivedValue(
    organizationId: string,
    workspaceId: string,
    boardId: string,
    record: BoardRecord,
    column: ColumnDefinition,
    existingValues: Map<string, ColumnValue>,
  ): Promise<ColumnValue | undefined> {
    switch (column.type) {
      case "mirror": {
        // Check if the mirror value is already in the map
        // (resolved by the event subscriber)
        const mirrorKey = `${record.id}:${column.id}`;
        const existing = existingValues.get(mirrorKey);
        if (existing !== undefined) return existing;

        // Resolve on demand
        const result = await MirrorService.resolve(
          organizationId,
          workspaceId,
          boardId,
          record.id,
          column,
        );
        return result.data ?? undefined;
      }

      case "lookup": {
        const result = await LookupService.resolve(
          organizationId,
          workspaceId,
          boardId,
          record.id,
          column,
        );
        return result.data ?? undefined;
      }

      case "rollup": {
        const result = await RollupService.resolve(
          organizationId,
          workspaceId,
          boardId,
          record.id,
          column,
        );
        return result.data ?? undefined;
      }

      case "formula": {
        const config = column.settings as unknown as FormulaConfig;
        if (!config.expression) return undefined;

        // Build evaluation context from existing values
        const recordValues: Record<string, ColumnValue> = {};
        for (const [key, value] of existingValues) {
          const [, colId] = key.split(":");
          if (colId) recordValues[colId] = value;
        }

        const value = FormulaEngine.evaluate(config.expression, {
          recordValues,
          today: new Date().toISOString().split("T")[0],
          now: new Date().toISOString(),
        });

        return value;
      }

      default:
        return undefined;
    }
  },

  /**
   * Deep fetch: load related records from relationships.
   * Used by the View Engine when rendering connected records inline.
   */
  async deepFetchRelatedRecords(
    boardId: string,
    recordId: string,
    connectedColumnId: string,
  ): Promise<ApiResponse<BoardRecord[]>> {
    const relResult = await RelationshipEngine.getBySource(
      boardId,
      recordId,
      connectedColumnId,
    );

    if (!relResult.data || relResult.data.length === 0) {
      return { data: [], error: null, status: 200 };
    }

    const recordRepo = new RecordRepository();
    const targetRecordIds = relResult.data.map((r) => r.targetRecordId);
    const records: BoardRecord[] = [];

    for (const targetId of targetRecordIds) {
      const recResult = await recordRepo.findById(targetId);
      if (recResult.data) {
        records.push(recResult.data);
      }
    }

    return { data: records, error: null, status: 200 };
  },

  /**
   * Get all relationships for a board with their related record metadata.
   * Used for relationship-aware sorting and filtering in views.
   */
  async resolveRelationships(
    boardId: string,
  ): Promise<ApiResponse<Relationship[]>> {
    return RelationshipEngine.getByBoard(boardId);
  },
};

