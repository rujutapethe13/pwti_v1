/**
 * Relationship Repository
 *
 * Database access layer for the generic `relationships` table.
 * Extends the existing BaseRepository pattern used by all entity repos.
 * No relationship type or board name is ever hardcoded here —
 * everything is metadata-driven.
 *
 * ── Design ──────────────────────────────────────────────────
 * One generic table for ALL relationship types (1:1, 1:many, many:1, many:many).
 * Mirror, Lookup, Rollup, and Formula columns reference this table
 * rather than maintaining their own relationship storage.
 * ────────────────────────────────────────────────────────────
 */

import "server-only";

import { BaseRepository, type DatabaseRow, type RepositoryOptions } from "../repository/base-repository";
import type { ApiResponse } from "@/types";
import type { Relationship, RelationshipType, RelationshipDirection, RelationshipDeleteRule } from "./types";

export class RelationshipRepository extends BaseRepository<Relationship> {
  protected tableName = "relationships";
  protected primaryKey = "id";

  protected fromDatabase(row: DatabaseRow): Relationship {
    return {
      id: this.asString(row.id),
      organizationId: this.asString(row.organization_id ?? row.organizationId),
      workspaceId: this.asString(row.workspace_id ?? row.workspaceId),

      sourceBoardId: this.asString(row.source_board_id ?? row.sourceBoardId),
      sourceRecordId: this.asString(row.source_record_id ?? row.sourceRecordId),
      sourceColumnId: this.asString(row.source_column_id ?? row.sourceColumnId),

      targetBoardId: this.asString(row.target_board_id ?? row.targetBoardId),
      targetRecordId: this.asString(row.target_record_id ?? row.targetRecordId),

      relationshipType: (row.relationship_type ?? row.relationshipType ?? "one_to_many") as RelationshipType,
      direction: (row.direction ?? "forward") as RelationshipDirection,
      label: this.asString(row.label),
      status: this.asString(row.status, "active"),
      deleteRule: (row.delete_rule ?? row.deleteRule ?? "cascade") as RelationshipDeleteRule,
      sortOrder: this.asNumber(row.sort_order ?? row.sortOrder, 0),

      metadata: this.asRecord(row.metadata),
      isActive: this.asBoolean(row.is_active ?? row.isActive, true),

      createdAt: this.asString(row.created_at ?? row.createdAt),
      updatedAt: this.asString(row.updated_at ?? row.updatedAt),
      deletedAt: this.asNullableString(row.deleted_at ?? row.deletedAt),
    };
  }

  protected toDatabase(entity: Partial<Relationship> | Record<string, unknown>): Record<string, unknown> {
    const e = entity as Partial<Relationship>;
    return {
      ...(e.id !== undefined ? { id: e.id } : {}),
      ...(e.organizationId !== undefined ? { organization_id: e.organizationId } : {}),
      ...(e.workspaceId !== undefined ? { workspace_id: e.workspaceId } : {}),
      ...(e.sourceBoardId !== undefined ? { source_board_id: e.sourceBoardId } : {}),
      ...(e.sourceRecordId !== undefined ? { source_record_id: e.sourceRecordId } : {}),
      ...(e.sourceColumnId !== undefined ? { source_column_id: e.sourceColumnId } : {}),
      ...(e.targetBoardId !== undefined ? { target_board_id: e.targetBoardId } : {}),
      ...(e.targetRecordId !== undefined ? { target_record_id: e.targetRecordId } : {}),
      ...(e.relationshipType !== undefined ? { relationship_type: e.relationshipType } : {}),
      ...(e.direction !== undefined ? { direction: e.direction } : {}),
      ...(e.label !== undefined ? { label: e.label } : {}),
      ...(e.status !== undefined ? { status: e.status } : {}),
      ...(e.deleteRule !== undefined ? { delete_rule: e.deleteRule } : {}),
      ...(e.sortOrder !== undefined ? { sort_order: e.sortOrder } : {}),
      ...(e.metadata !== undefined ? { metadata: e.metadata } : {}),
      ...(e.isActive !== undefined ? { is_active: e.isActive } : {}),
    };
  }

  // ── Relationship-specific queries ─────────────────────────

  /**
   * Find all relationships originating from a specific source record + column.
   * Used by Mirror, Lookup, and Rollup resolution.
   */
  async findBySource(
    sourceBoardId: string,
    sourceRecordId: string,
    sourceColumnId: string,
    options?: RepositoryOptions,
  ): Promise<ApiResponse<Relationship[]>> {
    return this.findMany(
      {
        source_board_id: sourceBoardId,
        source_record_id: sourceRecordId,
        source_column_id: sourceColumnId,
        is_active: true,
      },
      { column: "sort_order", ascending: true },
      options,
    );
  }

  /**
   * Find all relationships pointing TO a specific target record.
   * Used for reverse relationship traversal.
   */
  async findByTarget(
    targetBoardId: string,
    targetRecordId: string,
    options?: RepositoryOptions,
  ): Promise<ApiResponse<Relationship[]>> {
    return this.findMany(
      {
        target_board_id: targetBoardId,
        target_record_id: targetRecordId,
        is_active: true,
      },
      undefined,
      options,
    );
  }

  /**
   * Find all relationships for a given source column (across all records).
   * Used for dependency graph building and cache warming.
   */
  async findByColumn(
    sourceColumnId: string,
    options?: RepositoryOptions,
  ): Promise<ApiResponse<Relationship[]>> {
    return this.findMany(
      {
        source_column_id: sourceColumnId,
        is_active: true,
      },
      undefined,
      options,
    );
  }

  /**
   * Find all relationships for a board (both source and target).
   * Used for full relationship graph resolution.
   */
  async findByBoard(
    boardId: string,
    options?: RepositoryOptions,
  ): Promise<ApiResponse<Relationship[]>> {
    const client = await this.getClient(options);

    const { data, error } = await client
      .from(this.tableName)
      .select("*")
      .or(`source_board_id.eq.${boardId},target_board_id.eq.${boardId}`)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (error) {
      return { data: null, error: error.message, status: 500 };
    }

    return {
      data: (data ?? []).map((row) => this.fromDatabase(row as DatabaseRow)),
      error: null,
      status: 200,
    };
  }

  /**
   * Soft-delete a relationship by marking it inactive.
   * Does NOT physically remove the row — preserves audit trail.
   */
  async softDelete(id: string, options?: RepositoryOptions): Promise<ApiResponse<Relationship>> {
    return this.update(
      id,
      { isActive: false, deletedAt: new Date().toISOString() } as Partial<Relationship>,
      options,
    );
  }

  /**
   * Bulk-create relationships (for multi-select linking).
   */
  async bulkCreate(
    relationships: Array<Omit<Relationship, "id" | "createdAt" | "updatedAt" | "deletedAt">>,
    options?: RepositoryOptions,
  ): Promise<ApiResponse<Relationship[]>> {
    const client = await this.getClient(options);
    const now = new Date().toISOString();

    const payload = relationships.map((rel) => ({
      ...this.toDatabase(rel as Partial<Relationship>),
      created_at: now,
      updated_at: now,
    }));

    const { data, error } = await client
      .from(this.tableName)
      .insert(payload)
      .select();

    if (error) {
      return { data: null, error: error.message, status: 500 };
    }

    return {
      data: (data ?? []).map((row) => this.fromDatabase(row as DatabaseRow)),
      error: null,
      status: 201,
    };
  }

  /**
   * Check if a relationship already exists (for deduplication).
   */
  async exists(
    sourceRecordId: string,
    sourceColumnId: string,
    targetRecordId: string,
    options?: RepositoryOptions,
  ): Promise<boolean> {
    const client = await this.getClient(options);

    const { data } = await client
      .from(this.tableName)
      .select("id", { count: "exact", head: true })
      .eq("source_record_id", sourceRecordId)
      .eq("source_column_id", sourceColumnId)
      .eq("target_record_id", targetRecordId)
      .eq("is_active", true);

    return (data ?? []).length > 0;
  }

  // ── Helpers ─────────────────────────────────────────────

  private asString(value: unknown, fallback = ""): string {
    return typeof value === "string" && value.length > 0 ? value : fallback;
  }

  private asBoolean(value: unknown, fallback = false): boolean {
    return typeof value === "boolean" ? value : fallback;
  }

  private asNumber(value: unknown, fallback = 0): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
  }

  private asRecord(
    value: unknown,
    fallback: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : fallback;
  }

  private asNullableString(value: unknown): string | null {
    return typeof value === "string" && value.length > 0 ? value : null;
  }
}

