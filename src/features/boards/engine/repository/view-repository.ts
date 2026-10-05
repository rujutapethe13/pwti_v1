/**
 * View Repository
 *
 * Database access layer for board views.
 * Handles view CRUD, default view logic, and view ordering.
 */

import "server-only";

import { BaseRepository, type DatabaseRow, type RepositoryOptions } from "./base-repository";
import { createServiceClient } from "@/lib/supabase/server";
import type { ApiResponse } from "@/types";
import type { BoardView } from "../types";
import type { SupabaseClient } from "@supabase/supabase-js";

export class ViewRepository extends BaseRepository<BoardView> {
  protected tableName = "views";
  protected primaryKey = "id";

  protected async getClient(options?: RepositoryOptions): Promise<SupabaseClient> {
    if (options?.client) return options.client;
    return createServiceClient();
  }

  protected fromDatabase(row: DatabaseRow): BoardView {
    return {
      id: this.asString(row.id),
      boardId: this.asString(row.board_id ?? row.boardId),
      organizationId: this.asString(row.organization_id ?? row.organizationId) || undefined,
      workspaceId: this.asString(row.workspace_id ?? row.workspaceId) || undefined,
      name: this.asString(row.name),
      description: this.asString(row.description) || undefined,
      type: this.asString(row.type, "table") as BoardView["type"],
      visibility: this.asString(row.visibility, "shared") as BoardView["visibility"],
      filters: Array.isArray(row.filters) ? (row.filters as BoardView["filters"]) : [],
      sorting: Array.isArray(row.sorting) ? (row.sorting as BoardView["sorting"]) : [],
      grouping: Array.isArray(row.grouping) ? (row.grouping as BoardView["grouping"]) : [],
      visibleColumnIds: Array.isArray(row.visible_column_ids ?? row.visibleColumnIds)
        ? (row.visible_column_ids ?? row.visibleColumnIds) as string[]
        : [],
      columnWidths: this.asRecord(row.column_widths ?? row.columnWidths) as Record<string, number>,
      rowHeight: this.asNumber(row.row_height ?? row.rowHeight, 44),
      settings: this.asRecord(row.settings ?? (row as Record<string, unknown>).settings) as BoardView["settings"],
      personalOwnerUserId: this.asString(row.personal_owner_user_id ?? row.personalOwnerUserId) || null,
      sharedWith: Array.isArray(row.shared_with ?? row.sharedWith)
        ? (row.shared_with ?? row.sharedWith) as BoardView["sharedWith"]
        : ["owner", "editor", "viewer"],
      isDefault: this.asBoolean(row.is_default ?? row.isDefault),
      order: this.asNumber(row.sort_order ?? row.order),
      createdAt: this.asString(row.created_at ?? row.createdAt),
      updatedAt: this.asString(row.updated_at ?? row.updatedAt),
    };
  }

  protected toDatabase(entity: Partial<BoardView> | Record<string, unknown>): Record<string, unknown> {
    const e = entity as Partial<BoardView>;
    return {
      ...(e.id !== undefined ? { id: e.id } : {}),
      ...(e.boardId !== undefined ? { board_id: e.boardId } : {}),
      ...(e.organizationId !== undefined ? { organization_id: e.organizationId } : {}),
      ...(e.workspaceId !== undefined ? { workspace_id: e.workspaceId } : {}),
      ...(e.name !== undefined ? { name: e.name } : {}),
      ...(e.description !== undefined ? { description: e.description } : {}),
      ...(e.type !== undefined ? { type: e.type } : {}),
      ...(e.visibility !== undefined ? { visibility: e.visibility } : {}),
      ...(e.filters !== undefined ? { filters: e.filters } : {}),
      ...(e.sorting !== undefined ? { sorting: e.sorting } : {}),
      ...(e.grouping !== undefined ? { grouping: e.grouping } : {}),
      ...(e.visibleColumnIds !== undefined ? { visible_column_ids: e.visibleColumnIds } : {}),
      ...(e.columnWidths !== undefined ? { column_widths: e.columnWidths } : {}),
      ...(e.rowHeight !== undefined ? { row_height: e.rowHeight } : {}),
      ...(e.settings !== undefined ? { settings: e.settings } : {}),
      ...(e.personalOwnerUserId !== undefined
        ? { personal_owner_user_id: e.personalOwnerUserId }
        : {}),
      ...(e.sharedWith !== undefined ? { shared_with: e.sharedWith } : {}),
      ...(e.isDefault !== undefined ? { is_default: e.isDefault } : {}),
      ...(e.order !== undefined ? { sort_order: e.order } : {}),
    };
  }

  // ── View-specific queries ──────────────────────────────

  async findByBoard(
    boardId: string,
    options?: RepositoryOptions,
  ): Promise<ApiResponse<BoardView[]>> {
    return this.findMany({ board_id: boardId }, { column: "sort_order", ascending: true }, options);
  }

  async findDefaultByBoard(
    boardId: string,
    options?: RepositoryOptions,
  ): Promise<ApiResponse<BoardView | null>> {
    const client = await this.getClient(options);

    const { data, error } = await client
      .from(this.tableName)
      .select("*")
      .eq("board_id", boardId)
      .eq("is_default", true)
      .maybeSingle();

    if (error) {
      return { data: null, error: error.message, status: 500 };
    }

    if (!data) {
      return { data: null, error: null, status: 200 };
    }

    return { data: this.fromDatabase(data as DatabaseRow), error: null, status: 200 };
  }

  async setDefault(
    viewId: string,
    boardId: string,
    options?: RepositoryOptions,
  ): Promise<ApiResponse<null>> {
    const client = await this.getClient(options);
    const now = new Date().toISOString();

    // Unset all defaults for this board
    const { error: clearError } = await client
      .from(this.tableName)
      .update({ is_default: false, updated_at: now })
      .eq("board_id", boardId)
      .eq("is_default", true);

    if (clearError) {
      return { data: null, error: clearError.message, status: 500 };
    }

    // Set the new default
    const { error: setError } = await client
      .from(this.tableName)
      .update({ is_default: true, updated_at: now })
      .eq("id", viewId);

    if (setError) {
      return { data: null, error: setError.message, status: 500 };
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

  private asRecord(
    value: unknown,
    fallback: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : fallback;
  }
}

