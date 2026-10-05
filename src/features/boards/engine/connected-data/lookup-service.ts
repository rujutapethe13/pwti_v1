/**
 * Lookup Service
 *
 * Resolves values across a relationship chain.
 * Example: Production → PO → Vendor → Vendor GST
 *
 * ── Design ──────────────────────────────────────────────────
 * Each hop traverses a Connected Board column on the current record
 * to find the related record on the next board, then reads from
 * that record's cell values. The chain can be arbitrarily long —
 * no limit is hardcoded.
 * ────────────────────────────────────────────────────────────
 */

import "server-only";

import { RelationshipEngine } from "./relationship-engine";
import { CellRepository } from "../repository/cell-repository";
import { ColumnRepository } from "../repository/column-repository";
import { RecordRepository } from "../repository/record-repository";
import type { ApiResponse } from "@/types";
import type { ColumnValue, ColumnDefinition } from "../types";
import type { LookupConfig, LookupHop } from "./types";

const cellRepo = new CellRepository();
const columnRepo = new ColumnRepository();
const recordRepo = new RecordRepository();

export const LookupService = {
  /**
   * Resolve a Lookup column value by traversing the hop chain.
   *
   * Flow:
   *   1. Start with the current record
   *   2. For each hop, find the Connected Board relationship
   *      and navigate to the target record
   *   3. After all hops, read the final target column
   *   4. Return formatted result
   */
  async resolve(
    organizationId: string,
    workspaceId: string,
    sourceBoardId: string,
    sourceRecordId: string,
    lookupColumn: ColumnDefinition,
  ): Promise<ApiResponse<ColumnValue>> {
    const config = lookupColumn.settings as unknown as LookupConfig;
    if (!config.sourceConnectedColumnId || !config.targetColumnId) {
      return {
        data: null,
        error: "Lookup column is not fully configured",
        status: 400,
      };
    }

    // Step 1: Navigate the hop chain
    let currentBoardId = sourceBoardId;
    let currentRecordId = sourceRecordId;

    // First hop is through the sourceConnectedColumnId
    const firstHopResult = await this.navigateHop(
      currentBoardId,
      currentRecordId,
      config.sourceConnectedColumnId,
    );

    if (!firstHopResult) {
      return { data: null, error: null, status: 200 }; // No relationship, empty result
    }

    currentBoardId = firstHopResult.targetBoardId;
    currentRecordId = firstHopResult.targetRecordId;

    // Subsequent hops
    if (config.hops && config.hops.length > 0) {
      for (const hop of config.hops) {
        const hopResult = await this.navigateHop(
          currentBoardId,
          currentRecordId,
          hop.throughColumnId,
        );

        if (!hopResult) {
          return { data: null, error: null, status: 200 };
        }

        currentBoardId = hopResult.targetBoardId;
        currentRecordId = hopResult.targetRecordId;
      }
    }

    // Step 2: Read the final target column value
    const cellResult = await cellRepo.findByRecordAndColumn(
      currentRecordId,
      config.targetColumnId,
    );

    if (!cellResult.data) {
      // Fallback to record title
      const recordResult = await recordRepo.findById(currentRecordId);
      if (recordResult.data) {
        return { data: recordResult.data.title as ColumnValue, error: null, status: 200 };
      }
      return { data: null, error: null, status: 200 };
    }

    // Step 3: Format the result
    const value = cellResult.data.value;

    if (config.displayFormat === "joined" && Array.isArray(value)) {
      return {
        data: (value as unknown[]).join(config.joinSeparator ?? ", ") as ColumnValue,
        error: null,
        status: 200,
      };
    }

    if (config.displayFormat === "array" && !Array.isArray(value)) {
      return { data: [value] as unknown as ColumnValue, error: null, status: 200 };
    }

    return { data: value, error: null, status: 200 };
  },

  /**
   * Navigate a single hop: find the relationship from current record
   * through the given Connected Board column, and return the target.
   */
  async navigateHop(
    currentBoardId: string,
    currentRecordId: string,
    connectedColumnId: string,
  ): Promise<{ targetBoardId: string; targetRecordId: string } | null> {
    const relResult = await RelationshipEngine.getBySource(
      currentBoardId,
      currentRecordId,
      connectedColumnId,
    );

    if (!relResult.data || relResult.data.length === 0) {
      return null;
    }

    const relationship = relResult.data[0];
    return {
      targetBoardId: relationship.targetBoardId,
      targetRecordId: relationship.targetRecordId,
    };
  },

  /**
   * Resolve Lookup values for ALL records in a board at once.
   * Used by the Query Service for batch resolution.
   */
  async resolveBatch(
    organizationId: string,
    workspaceId: string,
    boardId: string,
    lookupColumn: ColumnDefinition,
    sourceRecordIds: string[],
  ): Promise<ApiResponse<Map<string, ColumnValue>>> {
    const results = new Map<string, ColumnValue>();

    for (const recordId of sourceRecordIds) {
      const result = await this.resolve(
        organizationId,
        workspaceId,
        boardId,
        recordId,
        lookupColumn,
      );
      results.set(recordId, result.data as ColumnValue);
    }

    return { data: results, error: null, status: 200 };
  },
};

