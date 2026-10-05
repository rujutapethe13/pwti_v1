/**
 * Group Repository
 *
 * Database access layer for groups.
 */

import "server-only";

import { BaseRepository, type DatabaseRow, type RepositoryOptions } from "./base-repository";
import type { ApiResponse } from "@/types";
import type { Group } from "../types";

export class GroupRepository extends BaseRepository<Group> {
  protected tableName = "groups";
  protected primaryKey = "id";

  protected fromDatabase(row: DatabaseRow): Group {
    return {
      id: this.asString(row.id),
      organizationId: this.asString(row.organization_id ?? row.organizationId),
      workspaceId: this.asString(row.workspace_id ?? row.workspaceId),
      boardId: this.asString(row.board_id ?? row.boardId),
      parentGroupId: this.asString(row.parent_group_id ?? row.parentGroupId) || null,
      name: this.asString(row.name),
      color: this.asString(row.color) || undefined,
      collapsed: this.asBoolean(row.collapsed),
      order: this.asNumber(row.sort_order ?? row.order),
      status: this.asString(row.status, "active") as Group["status"],
      permissions: row.permissions ? (row.permissions as Group["permissions"]) : undefined,
      statusOptions: row.status_options
        ? (row.status_options as Group["statusOptions"])
        : undefined,
    };
  }

  protected toDatabase(entity: Partial<Group> | Record<string, unknown>): Record<string, unknown> {
    const e = entity as Partial<Group>;
    return {
      ...(e.id !== undefined ? { id: e.id } : {}),
      ...(e.organizationId !== undefined ? { organization_id: e.organizationId } : {}),
      ...(e.workspaceId !== undefined ? { workspace_id: e.workspaceId } : {}),
      ...(e.boardId !== undefined ? { board_id: e.boardId } : {}),
      ...(e.parentGroupId !== undefined ? { parent_group_id: e.parentGroupId } : {}),
      ...(e.name !== undefined ? { name: e.name } : {}),
      ...(e.color !== undefined ? { color: e.color } : {}),
      ...(e.collapsed !== undefined ? { collapsed: e.collapsed } : {}),
      ...(e.order !== undefined ? { sort_order: e.order } : {}),
      ...(e.status !== undefined ? { status: e.status } : {}),
      ...(e.permissions !== undefined ? { permissions: e.permissions } : {}),
      ...(e.statusOptions !== undefined ? { status_options: e.statusOptions } : {}),
    };
  }

  // ── Group-specific queries ─────────────────────────────

  async findByBoard(
    boardId: string,
    options?: RepositoryOptions,
  ): Promise<ApiResponse<Group[]>> {
    return this.findMany({ board_id: boardId }, { column: "sort_order", ascending: true }, options);
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
}

