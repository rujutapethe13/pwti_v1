/**
 * Relationship Engine
 *
 * Generic relationship CRUD model for 1:1, 1:many, many:1, and many:many.
 * No relationship type or board name is ever hardcoded anywhere in this layer.
 *
 * ── Delete Rules ────────────────────────────────────────────
 * - cascade:     When a record is deleted, all its relationships are deleted
 * - restrict:    Prevent deletion if relationships exist
 * - set_null:    Nullify the target reference (soft-delete the relationship)
 * ────────────────────────────────────────────────────────────
 */

import "server-only";

import { RelationshipRepository } from "./relationship-repository";
import { eventBus } from "../events/event-bus";
import { metadataCache } from "../cache/metadata-cache";
import type { ApiResponse } from "@/types";
import type {
  Relationship,
  RelationshipType,
  RelationshipDirection,
  RelationshipDeleteRule,
} from "./types";

const relationshipRepo = new RelationshipRepository();

// ── Create Relationship Input ───────────────────────────────

export interface CreateRelationshipInput {
  organizationId: string;
  workspaceId: string;
  sourceBoardId: string;
  sourceRecordId: string;
  sourceColumnId: string;
  targetBoardId: string;
  targetRecordId: string;
  relationshipType: RelationshipType;
  direction?: RelationshipDirection;
  label?: string;
  deleteRule?: RelationshipDeleteRule;
  metadata?: Record<string, unknown>;
  actorUserId: string;
}

export interface UpdateRelationshipInput {
  id: string;
  label?: string;
  relationshipType?: RelationshipType;
  direction?: RelationshipDirection;
  deleteRule?: RelationshipDeleteRule;
  metadata?: Record<string, unknown>;
  sortOrder?: number;
  actorUserId: string;
}

// ── Relationship Service ────────────────────────────────────

export const RelationshipEngine = {
  /**
   * Create a relationship between two records.
   * Publishes RelationshipCreated event.
   */
  async create(input: CreateRelationshipInput): Promise<ApiResponse<Relationship>> {
    const { actorUserId, ...data } = input;

    // Check for duplicate
    const exists = await relationshipRepo.exists(
      data.sourceRecordId,
      data.sourceColumnId,
      data.targetRecordId,
    );
    if (exists) {
      return {
        data: null,
        error: "Relationship already exists between these records",
        status: 409,
      };
    }

    const now = new Date().toISOString();
    const result = await relationshipRepo.create({
      id: crypto.randomUUID(),
      organizationId: data.organizationId,
      workspaceId: data.workspaceId,
      sourceBoardId: data.sourceBoardId,
      sourceRecordId: data.sourceRecordId,
      sourceColumnId: data.sourceColumnId,
      targetBoardId: data.targetBoardId,
      targetRecordId: data.targetRecordId,
      relationshipType: data.relationshipType,
      direction: data.direction ?? "forward",
      label: data.label ?? "",
      status: "active",
      deleteRule: data.deleteRule ?? "cascade",
      sortOrder: 0,
      metadata: data.metadata ?? {},
      isActive: true,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    } as Relationship);

    if (result.data) {
      // Invalidate relationship cache
      metadataCache.invalidate("relationship", data.sourceBoardId);
      metadataCache.invalidate("relationship", data.targetBoardId);
      metadataCache.invalidate("dependencyGraph", data.sourceBoardId);

      // Publish domain event
      await eventBus.publish({
        eventId: crypto.randomUUID(),
        eventName: "relationship.create:after",
        timestamp: new Date().toISOString(),
        actorUserId,
        scope: {
          organizationId: data.organizationId,
          workspaceId: data.workspaceId,
          boardId: data.sourceBoardId,
        },
        before: null,
        after: result.data as unknown as Record<string, unknown>,
        metadata: {
          sourceBoardId: data.sourceBoardId,
          sourceRecordId: data.sourceRecordId,
          targetBoardId: data.targetBoardId,
          targetRecordId: data.targetRecordId,
          relationshipType: data.relationshipType,
        },
      });
    }

    return result;
  },

  /**
   * Delete a relationship by ID.
   * Publishes RelationshipDeleted event.
   */
  async delete(id: string, actorUserId: string): Promise<ApiResponse<null>> {
    const existing = await relationshipRepo.findById(id);
    if (!existing.data) {
      return { data: null, error: "Relationship not found", status: 404 };
    }

    const relationship = existing.data;

    await relationshipRepo.hardDelete(id);

    // Invalidate caches
    metadataCache.invalidate("relationship", relationship.sourceBoardId);
    metadataCache.invalidate("relationship", relationship.targetBoardId);

    // Publish domain event
    await eventBus.publish({
      eventId: crypto.randomUUID(),
      eventName: "relationship.delete:after",
      timestamp: new Date().toISOString(),
      actorUserId,
      scope: {
        organizationId: relationship.organizationId,
        workspaceId: relationship.workspaceId,
        boardId: relationship.sourceBoardId,
      },
      before: relationship as unknown as Record<string, unknown>,
      after: null,
      metadata: { relationshipId: id },
    });

    return { data: null, error: null, status: 200 };
  },

  /**
   * Update relationship metadata.
   * Publishes RelationshipUpdated event.
   */
  async update(input: UpdateRelationshipInput): Promise<ApiResponse<Relationship>> {
    const { actorUserId, id, ...updates } = input;

    const existing = await relationshipRepo.findById(id);
    if (!existing.data) {
      return { data: null, error: "Relationship not found", status: 404 };
    }

    const result = await relationshipRepo.update(id, updates as Partial<Relationship>);
    if (result.data) {
      metadataCache.invalidate("relationship", result.data.sourceBoardId);
      metadataCache.invalidate("relationship", result.data.targetBoardId);

      await eventBus.publish({
        eventId: crypto.randomUUID(),
        eventName: "relationship.update:after",
        timestamp: new Date().toISOString(),
        actorUserId,
        scope: {
          organizationId: result.data.organizationId,
          workspaceId: result.data.workspaceId,
          boardId: result.data.sourceBoardId,
        },
        before: existing.data as unknown as Record<string, unknown>,
        after: result.data as unknown as Record<string, unknown>,
        metadata: { relationshipId: id, updates },
      });
    }

    return result;
  },

  /**
   * Get all relationships for a source record and column.
   */
  async getBySource(
    sourceBoardId: string,
    sourceRecordId: string,
    sourceColumnId: string,
  ): Promise<ApiResponse<Relationship[]>> {
    // Check cache first
    const cacheKey = `${sourceBoardId}:${sourceRecordId}:${sourceColumnId}`;
    const cached = metadataCache.get<Relationship[]>("relationship", cacheKey);
    if (cached) {
      return { data: cached, error: null, status: 200 };
    }

    const result = await relationshipRepo.findBySource(
      sourceBoardId,
      sourceRecordId,
      sourceColumnId,
    );

    // Cache the result
    if (result.data) {
      metadataCache.set("relationship", cacheKey, result.data, 60_000); // 1 minute TTL
    }

    return result;
  },

  /**
   * Get all relationships pointing TO a record.
   * Used for reverse relationship traversal.
   */
  async getByTarget(
    targetBoardId: string,
    targetRecordId: string,
  ): Promise<ApiResponse<Relationship[]>> {
    return relationshipRepo.findByTarget(targetBoardId, targetRecordId);
  },

  /**
   * Get all relationships for a board.
   */
  async getByBoard(boardId: string): Promise<ApiResponse<Relationship[]>> {
    const cached = metadataCache.get<Relationship[]>("relationship", boardId);
    if (cached) {
      return { data: cached, error: null, status: 200 };
    }

    const result = await relationshipRepo.findByBoard(boardId);
    if (result.data) {
      metadataCache.set("relationship", boardId, result.data, 60_000);
    }

    return result;
  },

  /**
   * Remove all relationships for a source record + column.
   * Used when unlinking all records from a Connected Board column.
   */
  async removeAll(
    sourceBoardId: string,
    sourceRecordId: string,
    sourceColumnId: string,
    actorUserId: string,
  ): Promise<ApiResponse<null>> {
    const existing = await relationshipRepo.findBySource(
      sourceBoardId,
      sourceRecordId,
      sourceColumnId,
    );

    if (!existing.data || existing.data.length === 0) {
      return { data: null, error: null, status: 200 };
    }

    for (const rel of existing.data) {
      await relationshipRepo.hardDelete(rel.id);
    }

    metadataCache.invalidate("relationship", sourceBoardId);

    await eventBus.publish({
      eventId: crypto.randomUUID(),
      eventName: "relationship.delete:after",
      timestamp: new Date().toISOString(),
      actorUserId,
      scope: {
        organizationId: existing.data[0].organizationId,
        workspaceId: existing.data[0].workspaceId,
        boardId: sourceBoardId,
      },
      before: null,
      after: null,
      metadata: {
        sourceBoardId,
        sourceRecordId,
        sourceColumnId,
        removedCount: existing.data.length,
      },
    });

    return { data: null, error: null, status: 200 };
  },
};

