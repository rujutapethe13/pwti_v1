/**
 * Column Repository
 *
 * Database access layer for column definitions.
 * Handles column CRUD, ordering, and type migration data access.
 */

import "server-only";

import { BaseRepository, type DatabaseRow, type RepositoryOptions } from "./base-repository";
import type { ApiResponse } from "@/types";
import type { ColumnDefinition, ColumnValue } from "../types";

/**
 * Column write payload.
 *
 * `organization_id` / `workspace_id` live on the `columns` table and are set by
 * the create path, but they are not part of the engine-level `ColumnDefinition`
 * entity, so they are accepted as optional passthrough fields here.
 */
type ColumnWritePayload = Partial<ColumnDefinition> & {
  organizationId?: string;
  workspaceId?: string;
};

export class ColumnRepository extends BaseRepository<ColumnDefinition> {
  protected tableName = "columns";
  protected primaryKey = "id";

  protected fromDatabase(row: DatabaseRow): ColumnDefinition {
    return {
      id: this.asString(row.id),
      boardId: this.asString(row.board_id ?? row.boardId),
      key: this.asString(row.key),
      label: this.asString(row.label, this.asString(row.key)),
      description: this.asString(row.description) || undefined,
      type: this.asString(row.type, "text") as ColumnDefinition["type"],
      required: this.asBoolean(row.required),
      hidden: this.asBoolean(row.hidden),
      frozen: this.asBoolean(row.frozen),
      defaultValue: (row.default_value ?? row.defaultValue ?? null) as ColumnValue,
      settings: this.asRecord(row.settings),
      permissions: this.asRecord(row.permissions, {
        view: ["owner", "editor", "commenter", "viewer"],
        edit: ["owner", "editor"],
        configure: ["owner"],
      }) as unknown as ColumnDefinition["permissions"],
      validation: Array.isArray(row.validation) ? (row.validation as ColumnDefinition["validation"]) : [],
      version: this.asNumber(row.version, 1),
      order: this.asNumber(row.sort_order ?? row.order),
      createdAt: this.asString(row.created_at ?? row.createdAt),
      updatedAt: this.asString(row.updated_at ?? row.updatedAt),
      deletedAt: this.asString(row.deleted_at ?? row.deletedAt) || undefined,
    };
  }

  protected toDatabase(entity: ColumnWritePayload | Record<string, unknown>): Record<string, unknown> {
    const e = entity as ColumnWritePayload;
    return {
      ...(e.id !== undefined ? { id: e.id } : {}),
      ...(e.boardId !== undefined ? { board_id: e.boardId } : {}),
      ...(e.organizationId !== undefined ? { organization_id: e.organizationId } : {}),
      ...(e.workspaceId !== undefined ? { workspace_id: e.workspaceId } : {}),
      ...(e.key !== undefined ? { key: e.key } : {}),
      ...(e.label !== undefined ? { label: e.label } : {}),
      ...(e.description !== undefined ? { description: e.description } : {}),
      ...(e.type !== undefined ? { type: e.type } : {}),
      ...(e.required !== undefined ? { required: e.required } : {}),
      ...(e.hidden !== undefined ? { hidden: e.hidden } : {}),
      ...(e.frozen !== undefined ? { frozen: e.frozen } : {}),
      ...(e.defaultValue !== undefined ? { default_value: e.defaultValue } : {}),
      ...(e.settings !== undefined ? { settings: e.settings } : {}),
      ...(e.permissions !== undefined ? { permissions: e.permissions } : {}),
      ...(e.validation !== undefined ? { validation: e.validation } : {}),
      ...(e.version !== undefined ? { version: e.version } : {}),
      ...(e.order !== undefined ? { sort_order: e.order } : {}),
    };
  }

  // ── Column-specific queries ────────────────────────────

  async findByBoard(
    boardId: string,
    options?: RepositoryOptions,
    includeDeleted = false,
  ): Promise<ApiResponse<ColumnDefinition[]>> {
    const filters: Record<string, unknown> = { board_id: boardId };
    if (!includeDeleted) {
      filters.deleted_at = null;
    }
    return this.findMany(filters, { column: "sort_order", ascending: true }, options);
  }

  async reorder(
    boardId: string,
    orderedIds: Array<{ id: string; order: number }>,
    options?: RepositoryOptions,
  ): Promise<ApiResponse<null>> {
    const client = await this.getClient(options);
    const now = new Date().toISOString();

    const updates = orderedIds.map(({ id, order }) => ({
      id,
      sort_order: order,
      updated_at: now,
    }));

    const { error } = await client.from(this.tableName).upsert(updates);

    if (error) {
      return { data: null, error: error.message, status: 500 };
    }

    return { data: null, error: null, status: 200 };
  }

  async batchHide(
    columnIds: string[],
    hidden: boolean,
    options?: RepositoryOptions,
  ): Promise<ApiResponse<null>> {
    const client = await this.getClient(options);
    const now = new Date().toISOString();

    const updates = columnIds.map((id) => ({
      id,
      hidden,
      updated_at: now,
    }));

    const { error } = await client.from(this.tableName).upsert(updates);

    if (error) {
      return { data: null, error: error.message, status: 500 };
    }

    return { data: null, error: null, status: 200 };
  }

  async softDelete(
    columnId: string,
    options?: RepositoryOptions,
  ): Promise<ApiResponse<ColumnDefinition>> {
    const client = await this.getClient(options);
    const now = new Date().toISOString();

    const { data: row, error } = await client
      .from(this.tableName)
      .update({ deleted_at: now, status: "archived", updated_at: now })
      .eq(this.primaryKey, columnId)
      .is("deleted_at", null)
      .select()
      .single();

    if (error) {
      return { data: null, error: error.message, status: 500 };
    }

    return { data: this.fromDatabase(row as DatabaseRow), error: null, status: 200 };
  }

  async restore(
    columnId: string,
    options?: RepositoryOptions,
  ): Promise<ApiResponse<ColumnDefinition>> {
    const client = await this.getClient(options);
    const now = new Date().toISOString();

    const { data: row, error } = await client
      .from(this.tableName)
      .update({ deleted_at: null, status: "active", updated_at: now })
      .eq(this.primaryKey, columnId)
      .not("deleted_at", "is", null)
      .select()
      .single();

    if (error) {
      return { data: null, error: error.message, status: 500 };
    }

    return { data: this.fromDatabase(row as DatabaseRow), error: null, status: 200 };
  }

  // ── Helpers ────────────────────────────────────────────

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
}

