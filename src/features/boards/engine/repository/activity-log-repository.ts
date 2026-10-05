/**
 * Activity Log Repository
 *
 * Generic entity-based activity logging.
 * Every CRUD mutation generates an activity log entry via lifecycle hooks.
 * The repository supports querying logs by entity, actor, scope, and time range.
 */

import { BaseRepository, type DatabaseRow, type RepositoryOptions } from "./base-repository";
import type { ApiResponse } from "@/types";
import type { ActivityLogEntry } from "../types";

export class ActivityLogRepository extends BaseRepository<ActivityLogEntry> {
  protected tableName = "activity_logs";
  protected primaryKey = "id";

  protected fromDatabase(row: DatabaseRow): ActivityLogEntry {
    return {
      id: this.asString(row.id),
      organizationId: this.asString(row.organization_id ?? row.organizationId),
      workspaceId: this.asString(row.workspace_id ?? row.workspaceId),
      boardId: this.asString(row.board_id ?? row.boardId) || undefined,
      recordId: this.asString(row.record_id ?? row.recordId) || undefined,
      actorUserId: this.asString(row.actor_user_id ?? row.actorUserId),
      action: this.asString(row.action),
      payload: typeof row.payload === "object" && row.payload !== null
        ? (row.payload as Record<string, unknown>)
        : {},
      createdAt: this.asString(row.created_at ?? row.createdAt),
    };
  }

  protected toDatabase(entity: Partial<ActivityLogEntry> | Record<string, unknown>): Record<string, unknown> {
    const e = entity as Partial<ActivityLogEntry>;
    return {
      ...(e.id !== undefined ? { id: e.id } : {}),
      ...(e.organizationId !== undefined ? { organization_id: e.organizationId } : {}),
      ...(e.workspaceId !== undefined ? { workspace_id: e.workspaceId } : {}),
      ...(e.boardId !== undefined ? { board_id: e.boardId } : {}),
      ...(e.recordId !== undefined ? { record_id: e.recordId } : {}),
      ...(e.actorUserId !== undefined ? { actor_user_id: e.actorUserId } : {}),
      ...(e.action !== undefined ? { action: e.action } : {}),
      ...(e.payload !== undefined ? { payload: e.payload } : {}),
    };
  }

  // ── Activity Log-specific queries ──────────────────────

  async findByBoard(
    boardId: string,
    limit = 50,
    options?: RepositoryOptions,
  ): Promise<ApiResponse<ActivityLogEntry[]>> {
    const client = await this.getClient(options);

    const { data, error } = await client
      .from(this.tableName)
      .select("*")
      .eq("board_id", boardId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return { data: null, error: error.message, status: 500 };
    }

    return {
      data: (data ?? []).map((row) => this.fromDatabase(row as DatabaseRow)),
      error: null,
      status: 200,
    };
  }

  async findByWorkspace(
    workspaceId: string,
    limit = 50,
    options?: RepositoryOptions,
  ): Promise<ApiResponse<ActivityLogEntry[]>> {
    return this.findMany(
      { workspace_id: workspaceId },
      { column: "created_at", ascending: false },
      options,
    );
  }

  async findByActor(
    actorUserId: string,
    limit = 50,
    options?: RepositoryOptions,
  ): Promise<ApiResponse<ActivityLogEntry[]>> {
    return this.findMany(
      { actor_user_id: actorUserId },
      { column: "created_at", ascending: false },
      options,
    );
  }

  // ── Helpers ────────────────────────────────────────────

  private asString(value: unknown, fallback = ""): string {
    return typeof value === "string" && value.length > 0 ? value : fallback;
  }
}

