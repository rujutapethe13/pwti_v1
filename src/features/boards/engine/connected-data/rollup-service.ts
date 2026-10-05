/**
 * Rollup Service
 *
 * Aggregates values across a one-to-many relationship.
 * Supports: count, sum, average, min, max, first, last, median, mode,
 * count-empty, count-filled, percent-filled, concatenate, unique,
 * and/or (for boolean columns), earliest_date, latest_date.
 *
 * ── Design ──────────────────────────────────────────────────
 * Aggregation is performed in-memory from the resolved values.
 * Future optimization: push aggregations down to SQL via the
 * RelationshipRepository for large datasets.
 * ────────────────────────────────────────────────────────────
 */

import "server-only";

import { RelationshipEngine } from "./relationship-engine";
import { CellRepository } from "../repository/cell-repository";
import { ColumnRepository } from "../repository/column-repository";
import type { ApiResponse } from "@/types";
import type { ColumnValue, ColumnDefinition } from "../types";
import type { RollupConfig, RollupAggregation } from "./types";

const cellRepo = new CellRepository();
const columnRepo = new ColumnRepository();

export const RollupService = {
  /**
   * Resolve a Rollup column value by aggregating across related records.
   *
   * Flow:
   *   1. Find all relationships from the source record through the
   *      Connected Board column
   *   2. Collect all target record IDs
   *   3. Read the target column value from each target record
   *   4. Apply the aggregation function
   */
  async resolve(
    organizationId: string,
    workspaceId: string,
    sourceBoardId: string,
    sourceRecordId: string,
    rollupColumn: ColumnDefinition,
  ): Promise<ApiResponse<ColumnValue>> {
    const config = rollupColumn.settings as unknown as RollupConfig;
    if (!config.sourceConnectedColumnId || !config.targetColumnId || !config.aggregation) {
      return {
        data: null,
        error: "Rollup column is not fully configured",
        status: 400,
      };
    }

    // Step 1: Get all relationships (one-to-many)
    const relResult = await RelationshipEngine.getBySource(
      sourceBoardId,
      sourceRecordId,
      config.sourceConnectedColumnId,
    );

    if (!relResult.data || relResult.data.length === 0) {
      return { data: this.aggregate([], config.aggregation), error: null, status: 200 };
    }

    // Step 2: Collect target record IDs
    const targetRecordIds = relResult.data.map((r) => r.targetRecordId);

    // Step 3: Read all cell values for the target column
    const allCells = await Promise.all(
      targetRecordIds.map((recordId) =>
        cellRepo.findByRecordAndColumn(recordId, config.targetColumnId),
      ),
    );

    const values: ColumnValue[] = [];
    for (const cellResult of allCells) {
      if (cellResult.data) {
        values.push(cellResult.data.value);
      }
    }

    // Step 4: Apply aggregation
    const result = this.aggregate(values, config.aggregation);

    return { data: result, error: null, status: 200 };
  },

  /**
   * Apply an aggregation function to an array of values.
   * Metadata-driven — no switch on board name or column type.
   */
  aggregate(values: ColumnValue[], aggregation: RollupAggregation): ColumnValue {
    if (values.length === 0) {
      return this.getEmptyResult(aggregation);
    }

    const numericValues = values
      .map((v) => (typeof v === "number" ? v : Number(v)))
      .filter((v) => !isNaN(v));

    const stringValues = values
      .filter((v): v is string => typeof v === "string")
      .filter((v) => v.length > 0);

    const booleanValues = values
      .filter((v): v is boolean => typeof v === "boolean");

    const dateValues = values
      .filter((v): v is string => typeof v === "string")
      .filter((v) => !isNaN(Date.parse(v)));

    switch (aggregation) {
      // ── Count ──────────────────────────────────────────
      case "count":
        return values.length;
      case "count_unique": {
        const seen = new Set(values.map((v) => JSON.stringify(v)));
        return seen.size;
      }
      case "count_empty":
        return values.filter((v) => v === null || v === undefined || v === "").length;
      case "count_filled":
        return values.filter((v) => v !== null && v !== undefined && v !== "").length;
      case "percent_filled": {
        const filled = values.filter((v) => v !== null && v !== undefined && v !== "").length;
        return values.length > 0 ? Math.round((filled / values.length) * 100) : 0;
      }
      case "percent_empty": {
        const empty = values.filter((v) => v === null || v === undefined || v === "").length;
        return values.length > 0 ? Math.round((empty / values.length) * 100) : 0;
      }

      // ── Numeric ────────────────────────────────────────
      case "sum":
        return numericValues.reduce((a, b) => a + b, 0);
      case "average":
        return numericValues.length > 0
          ? numericValues.reduce((a, b) => a + b, 0) / numericValues.length
          : 0;
      case "min":
        return numericValues.length > 0 ? Math.min(...numericValues) : 0;
      case "max":
        return numericValues.length > 0 ? Math.max(...numericValues) : 0;
      case "median": {
        if (numericValues.length === 0) return 0;
        const sorted = [...numericValues].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 === 0
          ? (sorted[mid - 1] + sorted[mid]) / 2
          : sorted[mid];
      }
      case "mode": {
        if (numericValues.length === 0) return 0;
        const freq = new Map<number, number>();
        for (const v of numericValues) {
          freq.set(v, (freq.get(v) ?? 0) + 1);
        }
        let maxFreq = 0;
        let mode = numericValues[0];
        for (const [value, count] of freq) {
          if (count > maxFreq) {
            maxFreq = count;
            mode = value;
          }
        }
        return mode;
      }

      // ── Text ───────────────────────────────────────────
      case "concatenate":
        return stringValues.join(", ");
      case "unique":
        return [...new Set(stringValues)].join(", ");
      case "first":
        return values[0];
      case "last":
        return values[values.length - 1];

      // ── Boolean ────────────────────────────────────────
      case "and":
        return booleanValues.length > 0 && booleanValues.every((v) => v === true);
      case "or":
        return booleanValues.some((v) => v === true);

      // ── Date ───────────────────────────────────────────
      case "earliest_date":
        return dateValues.length > 0
          ? dateValues.sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0]
          : null;
      case "latest_date":
        return dateValues.length > 0
          ? dateValues.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
          : null;

      default:
        return null;
    }
  },

  getEmptyResult(aggregation: RollupAggregation): ColumnValue {
    switch (aggregation) {
      case "count":
      case "count_unique":
      case "count_empty":
      case "count_filled":
      case "sum":
        return 0;
      case "average":
      case "min":
      case "max":
      case "median":
      case "mode":
        return 0;
      case "first":
      case "last":
        return null;
      case "concatenate":
      case "unique":
        return "";
      case "and":
        return true; // Empty set is vacuously true
      case "or":
        return false;
      case "earliest_date":
      case "latest_date":
        return null;
      case "percent_filled":
      case "percent_empty":
        return 0;
      default:
        return null;
    }
  },

  /**
   * Resolve Rollup values for ALL records in a board at once.
   * Used by the Query Service for batch resolution.
   */
  async resolveBatch(
    organizationId: string,
    workspaceId: string,
    boardId: string,
    rollupColumn: ColumnDefinition,
    sourceRecordIds: string[],
  ): Promise<ApiResponse<Map<string, ColumnValue>>> {
    const results = new Map<string, ColumnValue>();

    for (const recordId of sourceRecordIds) {
      const result = await this.resolve(
        organizationId,
        workspaceId,
        boardId,
        recordId,
        rollupColumn,
      );
      results.set(recordId, result.data as ColumnValue);
    }

    return { data: results, error: null, status: 200 };
  },
};

