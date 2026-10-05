/**
 * Record Repository
 *
 * Database access layer for board records.
 * Supports soft-delete, bulk operations, and group-based queries.
 */

import "server-only";

import { BaseRepository, type DatabaseRow, type RepositoryOptions } from "./base-repository";
import type { ApiResponse } from "@/types";
import type { BoardRecord } from "../types";

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  hasMore: boolean;
}

export class RecordRepository extends BaseRepository<BoardRecord> {
  protected tableName = "records";
  protected primaryKey = "id";

  protected fromDatabase(row: DatabaseRow): BoardRecord {
    return {
      id: this.asString(row.id),
      organizationId: this.asString(row.organization_id ?? row.organizationId),
      workspaceId: this.asString(row.workspace_id ?? row.workspaceId),
      boardId: this.asString(row.board_id ?? row.boardId),
      groupId: this.asString(row.group_id ?? row.groupId) || null,
      title: this.asString(row.title, this.asString(row.name, "Untitled")),
      status: this.asString(row.status, "active") as BoardRecord["status"],
      version: this.asNumber(row.version, 1),
      archivedAt: this.asString(row.archived_at ?? row.archivedAt) || null,
      createdAt: this.asString(row.created_at ?? row.createdAt),
      updatedAt: this.asString(row.updated_at ?? row.updatedAt),
    };
  }

  protected toDatabase(entity: Partial<BoardRecord> | Record<string, unknown>): Record<string, unknown> {
    const e = entity as Partial<BoardRecord>;
    return {
      ...(e.id !== undefined ? { id: e.id } : {}),
      ...(e.organizationId !== undefined ? { organization_id: e.organizationId } : {}),
      ...(e.workspaceId !== undefined ? { workspace_id: e.workspaceId } : {}),
      ...(e.boardId !== undefined ? { board_id: e.boardId } : {}),
      ...(e.groupId !== undefined ? { group_id: e.groupId } : {}),
      ...(e.title !== undefined ? { title: e.title } : {}),
      ...(e.status !== undefined ? { status: e.status } : {}),
      ...(e.version !== undefined ? { version: e.version } : {}),
      ...(e.archivedAt !== undefined ? { archived_at: e.archivedAt } : {}),
    };
  }

  // ── Record-specific queries ────────────────────────────

  async findByBoard(
    boardId: string,
    options?: RepositoryOptions,
  ): Promise<ApiResponse<BoardRecord[]>> {
    return this.findMany({ board_id: boardId }, { column: "created_at", ascending: true }, options);
  }

  async findByBoardPaginated(
    boardId: string,
    limit: number,
    offset: number,
    options?: RepositoryOptions,
  ): Promise<ApiResponse<PaginatedResult<BoardRecord>>> {
    const client = await this.getClient(options);

    const [{ data: rows, error: queryError }, { count: totalRaw, error: countError }] =
      await Promise.all([
        client
          .from(this.tableName)
          .select("*")
          .eq("board_id", boardId)
          .order("created_at", { ascending: true })
          .range(offset, offset + limit - 1),
        client
          .from(this.tableName)
          .select("*", { count: "exact", head: true })
          .eq("board_id", boardId),
      ]);

    if (queryError) {
      return { data: null, error: queryError.message, status: 500 };
    }
    if (countError) {
      return { data: null, error: countError.message, status: 500 };
    }

    const total = totalRaw ?? 0;
    const data = (rows ?? []).map((row) => this.fromDatabase(row as DatabaseRow));

    return {
      data: {
        data,
        total,
        hasMore: offset + data.length < total,
      },
      error: null,
      status: 200,
    };
  }

  async findByGroup(
    groupId: string,
    options?: RepositoryOptions,
  ): Promise<ApiResponse<BoardRecord[]>> {
    return this.findMany({ group_id: groupId }, { column: "sort_order", ascending: true }, options);
  }

  async findByBoardArchived(
    boardId: string,
    options?: RepositoryOptions,
  ): Promise<ApiResponse<BoardRecord[]>> {
    const client = await this.getClient(options);

    const { data, error } = await client
      .from(this.tableName)
      .select("*")
      .eq("board_id", boardId)
      .eq("status", "archived")
      .order("archived_at", { ascending: false });

    if (error) {
      return { data: null, error: error.message, status: 500 };
    }

    return {
      data: (data ?? []).map((row) => this.fromDatabase(row as DatabaseRow)),
      error: null,
      status: 200,
    };
  }

  async search(
    boardId: string,
    query: string,
    limit = 20,
    options?: RepositoryOptions,
  ): Promise<ApiResponse<BoardRecord[]>> {
    const client = await this.getClient(options);
    const sanitized = query.replace(/'/g, "''");

    const { data, error } = await client
      .from(this.tableName)
      .select("*")
      .eq("board_id", boardId)
      .or(`title.ilike.%${sanitized}%,name.ilike.%${sanitized}%`)
      .order("created_at", { ascending: true })
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

  async moveToGroup(
    recordId: string,
    targetGroupId: string,
    options?: RepositoryOptions,
  ): Promise<ApiResponse<BoardRecord>> {
    return this.update(
      recordId,
      { groupId: targetGroupId } as Partial<BoardRecord>,
      options,
    );
  }

  async bulkUpdate(
    recordIds: string[],
    updates: Partial<Omit<BoardRecord, "id" | "createdAt">>,
    options?: RepositoryOptions,
  ): Promise<ApiResponse<null>> {
    const client = await this.getClient(options);
    const now = new Date().toISOString();
    const dbUpdates = this.toDatabase(updates as Record<string, unknown>);

    const payload = recordIds.map((id) => ({
      id,
      ...dbUpdates,
      updated_at: now,
      version_increment: true,
    }));

    const { error } = await client.from(this.tableName).upsert(payload);

    if (error) {
      return { data: null, error: error.message, status: 500 };
    }

    return { data: null, error: null, status: 200 };
  }

  async bulkDelete(
    recordIds: string[],
    permanent: boolean,
    options?: RepositoryOptions,
  ): Promise<ApiResponse<null>> {
    const client = await this.getClient(options);

    if (permanent) {
      const { error } = await client
        .from(this.tableName)
        .delete()
        .in("id", recordIds);

      if (error) {
        return { data: null, error: error.message, status: 500 };
      }
    } else {
      const now = new Date().toISOString();
      const { error } = await client
        .from(this.tableName)
        .update({ status: "archived", archived_at: now, updated_at: now })
        .in("id", recordIds);

      if (error) {
        return { data: null, error: error.message, status: 500 };
      }
    }

    return { data: null, error: null, status: 200 };
  }

  async bulkUpsert(
    records: BoardRecord[],
    options?: RepositoryOptions,
  ): Promise<ApiResponse<BoardRecord[]>> {
    const client = await this.getClient(options);
    const now = new Date().toISOString();
    const payload = records.map((r) => ({
      ...this.toDatabase(r),
      created_at: r.createdAt ?? now,
      updated_at: r.updatedAt ?? now,
    }));

    const { error } = await client.from(this.tableName).upsert(payload);
    if (error) {
      return { data: null, error: error.message, status: 500 };
    }

    return { data: records, error: null, status: 201 };
  }

  private asString(value: unknown, fallback = ""): string {
    return typeof value === "string" && value.length > 0 ? value : fallback;
  }

  private asNumber(value: unknown, fallback = 0): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
  }
}

