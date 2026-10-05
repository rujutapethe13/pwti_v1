/**
 * Mirror Service
 *
 * Resolves Mirror column values by reading the source column value
 * from a connected record through a relationship.
 *
 * Supports both legacy single-column mirrors and new multi-column mirrors.
 */

import "server-only";

import { RelationshipEngine } from "./relationship-engine";
import { CellRepository } from "../repository/cell-repository";
import { RecordRepository } from "../repository/record-repository";
import { ColumnRepository } from "../repository/column-repository";
import { metadataCache } from "../cache/metadata-cache";
import type { ApiResponse } from "@/types";
import type { ColumnValue, ColumnDefinition } from "../types";
import type { MirrorConfig, DerivedValue } from "./types";
import { getMirroredColumnConfigs } from "./mirror-utils";

const cellRepo = new CellRepository();
const recordRepo = new RecordRepository();
const columnRepo = new ColumnRepository();

export const MirrorService = {
  /**
   * Resolve a Mirror column value for a given record.
   *
   * For single-column mirrors (legacy), returns the raw cell value.
   * For multi-column mirrors, returns an array of resolved values.
   */
  async resolve(
    organizationId: string,
    workspaceId: string,
    sourceBoardId: string,
    sourceRecordId: string,
    mirrorColumn: ColumnDefinition,
  ): Promise<ApiResponse<ColumnValue>> {
    const config = mirrorColumn.settings as unknown as Record<string, unknown>;
    if (!config.source_connect_column_id || typeof config.source_connect_column_id !== "string") {
      return {
        data: null,
        error: "Mirror column is not fully configured: missing source_connect_column_id",
        status: 400,
      };
    }

    const mirrorConfigs = getMirroredColumnConfigs(config);
    if (mirrorConfigs.length === 0) {
      return {
        data: null,
        error: "Mirror column has no mirrored columns configured",
        status: 400,
      };
    }

    const relResult = await RelationshipEngine.getBySource(
      sourceBoardId,
      sourceRecordId,
      config.source_connect_column_id,
    );

    if (!relResult.data || relResult.data.length === 0) {
      return {
        data: (config.fallbackValue as ColumnValue) ?? null,
        error: null,
        status: 200,
      };
    }

    // Single-column legacy: return the first linked item's value.
    if (mirrorConfigs.length === 1 && mirrorConfigs[0].column_id === (config as Record<string, unknown>).mirrored_column_id) {
      const relationship = relResult.data[0];
      const cellResult = await cellRepo.findByRecordAndColumn(
        relationship.targetRecordId,
        mirrorConfigs[0].column_id,
      );

      if (!cellResult.data) {
        const recordResult = await recordRepo.findById(relationship.targetRecordId);
        if (recordResult.data) {
          return {
            data: recordResult.data.title as ColumnValue,
            error: null,
            status: 200,
          };
        }
        return {
          data: config.fallbackValue as ColumnValue ?? null,
          error: null,
          status: 200,
        };
      }

      return {
        data: cellResult.data.value,
        error: null,
        status: 200,
      };
    }

    // Multi-column: resolve each configured column for each linked item.
    const results: Array<{ boardId: string; recordId: string; columnId: string; value: ColumnValue }> = [];
    const allTargetRecordIds = new Set<string>();
    const allColumnIds = new Set(mirrorConfigs.map((m) => m.column_id));

    for (const rel of relResult.data) {
      allTargetRecordIds.add(rel.targetRecordId);
    }

    // Batch-fetch all cell values for all target records and columns.
    const cellMap = new Map<string, ColumnValue>();
    for (const recordId of allTargetRecordIds) {
      for (const columnId of allColumnIds) {
        const cellResult = await cellRepo.findByRecordAndColumn(recordId, columnId);
        const key = `${recordId}:${columnId}`;
        cellMap.set(key, cellResult.data?.value ?? null);
      }
    }

    const relationships = relResult.data ?? [];
    const values = mirrorConfigs.map((mc) => {
      const vals = relationships.map((rel) => {
        const key = `${rel.targetRecordId}:${mc.column_id}`;
        return cellMap.get(key) ?? null;
      });
      return vals.length === 1 ? vals[0] : vals;
    });

    return {
      data: values as ColumnValue,
      error: null,
      status: 200,
    };
  },

  /**
   * Resolve Mirror values for ALL records in a board at once.
   * Used by the Query Service for batch resolution (avoids N+1).
   */
  async resolveBatch(
    organizationId: string,
    workspaceId: string,
    boardId: string,
    mirrorColumn: ColumnDefinition,
    sourceRecordIds: string[],
  ): Promise<ApiResponse<Map<string, ColumnValue>>> {
    const results = new Map<string, ColumnValue>();
    const rawConfig = mirrorColumn.settings as Record<string, unknown>;
    const sourceColId = rawConfig.source_connect_column_id as string | undefined;
    const fallbackValue = (rawConfig.fallbackValue as ColumnValue | undefined) ?? null;

    if (!sourceColId) {
      return { data: results, error: null, status: 200 };
    }

    const mirrorConfigs = getMirroredColumnConfigs(rawConfig);
    if (mirrorConfigs.length === 0) {
      return { data: results, error: null, status: 200 };
    }

    // Get ALL relationships for this connected column across all records.
    const relResult = await RelationshipEngine.getByBoard(boardId);
    const relationships = relResult.data ?? [];

    // Group relationships by source record.
    const relBySource = new Map<string, Array<{ targetBoardId: string; targetRecordId: string }>>();
    for (const rel of relationships) {
      if (rel.sourceColumnId !== sourceColId) continue;
      const existing = relBySource.get(rel.sourceRecordId) ?? [];
      existing.push({ targetBoardId: rel.targetBoardId, targetRecordId: rel.targetRecordId });
      relBySource.set(rel.sourceRecordId, existing);
    }

    // Collect all unique target board/record/column combinations for batch fetch.
    const allTargets = new Set<string>();
    const allColumnIds = new Set(mirrorConfigs.map((m) => m.column_id));
    for (const [, targets] of relBySource) {
      for (const t of targets) {
        allTargets.add(`${t.targetBoardId}:${t.targetRecordId}`);
      }
    }

    // Batch-fetch cell values by board_id and record_id.
    const cellMap = new Map<string, ColumnValue>();
    for (const targetKey of allTargets) {
      const [targetBoardId, targetRecordId] = targetKey.split(":");
      if (!targetBoardId || !targetRecordId) continue;
      for (const columnId of allColumnIds) {
        const cellResult = await cellRepo.findByRecordAndColumn(targetRecordId, columnId);
        const key = `${targetBoardId}:${targetRecordId}:${columnId}`;
        cellMap.set(key, cellResult.data?.value ?? null);
      }
    }

    // Resolve for each source record.
    for (const sourceRecordId of sourceRecordIds) {
      const targets = relBySource.get(sourceRecordId);
      if (!targets || targets.length === 0) {
        results.set(sourceRecordId, fallbackValue);
        continue;
      }

      const mirroredColumns = (rawConfig as Record<string, unknown>).mirrored_columns;
      const hasMulti = Array.isArray(mirroredColumns) ? (mirroredColumns as Array<{ board_id: string; column_id: string; aggregation: string | null }>).length > 0 : false;
      if (mirrorConfigs.length === 1 && !hasMulti) {
        const mc = mirrorConfigs[0];
        const key = `${targets[0].targetBoardId}:${targets[0].targetRecordId}:${mc.column_id}`;
        results.set(sourceRecordId, cellMap.get(key) ?? fallbackValue);
      } else {
        const values = mirrorConfigs.map((mc) => {
          const vals = targets.map((t) => {
            const key = `${t.targetBoardId}:${t.targetRecordId}:${mc.column_id}`;
            return cellMap.get(key) ?? null;
          });
          return vals.length === 1 ? vals[0] : vals;
        });
        results.set(sourceRecordId, values as ColumnValue);
      }
    }

    return { data: results, error: null, status: 200 };
  },
};
