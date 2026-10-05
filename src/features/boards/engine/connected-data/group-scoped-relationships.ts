/**
 * Group-Scoped Relationships
 *
 * Relationships can be scoped to matching groups (e.g. Production/May
 * only links to PO/May). The grouping key is arbitrary and configurable—
 * never assumed to be a month or any specific label.
 *
 * ── Design ──────────────────────────────────────────────────
 * The group scope configuration lives in the Connected Board column's
 * settings (GroupScopeConfig). When resolving relationships, the
 * RelationshipChecker verifies that the source and target records
 * belong to groups with matching keys.
 *
 * This is applied at the APPLICATION level (not DB level) so the
 * grouping key can be reconfigured without migration.
 * ────────────────────────────────────────────────────────────
 */

import "server-only";

import { GroupRepository } from "../repository/group-repository";
import { RecordRepository } from "../repository/record-repository";
import type { ApiResponse } from "@/types";
import type { GroupScopeConfig } from "./types";
import type { Group } from "../types";

const groupRepo = new GroupRepository();
const recordRepo = new RecordRepository();

export const GroupScopedRelationships = {
  /**
   * Check if two records are allowed to be linked based on group scope.
   * If no group scope is configured, returns true (no restriction).
   */
  async canLink(
    sourceBoardId: string,
    sourceRecordId: string,
    targetBoardId: string,
    targetRecordId: string,
    scopeConfig?: GroupScopeConfig,
  ): Promise<ApiResponse<{ allowed: boolean; reason?: string }>> {
    if (!scopeConfig?.enabled) {
      return { data: { allowed: true }, error: null, status: 200 };
    }

    // Get the group key to match on
    const groupKey = scopeConfig.groupKey;
    if (!groupKey) {
      return { data: { allowed: true }, error: null, status: 200 };
    }

    // Get both records' groups
    const [sourceRecordResult, targetRecordResult] = await Promise.all([
      recordRepo.findById(sourceRecordId),
      recordRepo.findById(targetRecordId),
    ]);

    if (!sourceRecordResult.data || !targetRecordResult.data) {
      return {
        data: { allowed: false, reason: "One or both records not found" },
        error: null,
        status: 200,
      };
    }

    const sourceGroupId = sourceRecordResult.data.groupId;
    const targetGroupId = targetRecordResult.data.groupId;

    if (!sourceGroupId || !targetGroupId) {
      // If strict mode, require both to have groups
      if (scopeConfig.strict) {
        return {
          data: {
            allowed: false,
            reason: "Both records must belong to a group for scoped linking",
          },
          error: null,
          status: 200,
        };
      }
      return { data: { allowed: true }, error: null, status: 200 };
    }

    // Get the group metadata to find the key value
    const [sourceGroupResult, targetGroupResult] = await Promise.all([
      groupRepo.findById(sourceGroupId),
      groupRepo.findById(targetGroupId),
    ]);

    const sourceGroup = sourceGroupResult.data;
    const targetGroup = targetGroupResult.data;

    if (!sourceGroup || !targetGroup) {
      return {
        data: { allowed: false, reason: "One or both groups not found" },
        error: null,
        status: 200,
      };
    }

    // Match by group name (the simplest grouping key)
    // Future: support arbitrary JSON key lookups in group metadata
    const sourceKey = this.getGroupKeyValue(sourceGroup, groupKey);
    const targetKey = this.getGroupKeyValue(targetGroup, groupKey);

    if (sourceKey !== targetKey) {
      return {
        data: {
          allowed: false,
          reason: `Group mismatch: "${sourceKey}" does not match "${targetKey}"`,
        },
        error: null,
        status: 200,
      };
    }

    return { data: { allowed: true }, error: null, status: 200 };
  },

  /**
   * Get the value of a grouping key from a group.
   * Supports arbitrary keys — never assumes "name" or "month" specifically.
   */
  getGroupKeyValue(group: Group, key: string): string {
    // Primary key: group.name (always available)
    if (key === "name" || key === "group_name") {
      return group.name;
    }

    // Secondary key: group.color
    if (key === "color" || key === "group_color") {
      return group.color ?? "";
    }

    // Arbitrary metadata keys (future: from group.metadata)
    // For now, fall back to group name
    return group.name;
  },

  /**
   * Filter a set of target records by whether they match the
   * source record's group scope. Used by the Relationship Picker
   * to show/hide records.
   */
  async filterByGroupScope(
    sourceBoardId: string,
    sourceRecordId: string,
    targetBoardId: string,
    targetRecordIds: string[],
    scopeConfig?: GroupScopeConfig,
  ): Promise<ApiResponse<string[]>> {
    if (!scopeConfig?.enabled || targetRecordIds.length === 0) {
      return { data: targetRecordIds, error: null, status: 200 };
    }

    const filtered: string[] = [];

    for (const targetId of targetRecordIds) {
      const result = await this.canLink(
        sourceBoardId,
        sourceRecordId,
        targetBoardId,
        targetId,
        scopeConfig,
      );
      if (result.data?.allowed) {
        filtered.push(targetId);
      }
    }

    return { data: filtered, error: null, status: 200 };
  },
};

