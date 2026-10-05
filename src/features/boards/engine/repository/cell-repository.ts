/**
 * Cell Value Repository
 *
 * Database access layer for cell values (EAV pattern).
 * Supports single and bulk cell value operations.
 */

import "server-only";

import { BaseRepository, type DatabaseRow, type RepositoryOptions } from "./base-repository";
import type { ApiResponse } from "@/types";
import type { CellValue, ColumnValue } from "../types";

export class CellRepository extends BaseRepository<CellValue> {
  protected tableName = "cell_values";
  protected primaryKey = "id";

  protected fromDatabase(row: DatabaseRow): CellValue {
    return {
      id: this.asString(row.id),
      organizationId: this.asString(row.organization_id ?? row.organizationId),
      workspaceId: this.asString(row.workspace_id ?? row.workspaceId),
      boardId: this.asString(row.board_id ?? row.boardId),
      recordId: this.asString(row.record_id ?? row.recordId),
      columnId: this.asString(row.column_id ?? row.columnId),
      value: (row.value ?? row.value_json ?? null) as ColumnValue,
      valueText: this.asString(row.value_text ?? row.valueText),
      updatedAt: this.asString(row.updated_at ?? row.updatedAt),
      version: this.asNumber(row.version, 1),
    };
  }

  protected toDatabase(entity: Partial<CellValue> | Record<string, unknown>): Record<string, unknown> {
    const e = entity as Partial<CellValue>;
    return {
      ...(e.id !== undefined ? { id: e.id } : {}),
      ...(e.organizationId !== undefined ? { organization_id: e.organizationId } : {}),
      ...(e.workspaceId !== undefined ? { workspace_id: e.workspaceId } : {}),
      ...(e.boardId !== undefined ? { board_id: e.boardId } : {}),
      ...(e.recordId !== undefined ? { record_id: e.recordId } : {}),
      ...(e.columnId !== undefined ? { column_id: e.columnId } : {}),
      ...(e.value !== undefined ? { value: e.value } : {}),
      ...(e.valueText !== undefined ? { value_text: e.valueText } : {}),
      ...(e.version !== undefined ? { version: e.version } : {}),
    };
  }

  // ── Cell-specific queries ──────────────────────────────

  async findByRecord(
    recordId: string,
    options?: RepositoryOptions,
  ): Promise<ApiResponse<CellValue[]>> {
    return this.findMany({ record_id: recordId }, undefined, options);
  }

  async findByColumn(
    boardId: string,
    columnId: string,
    options?: RepositoryOptions,
  ): Promise<ApiResponse<CellValue[]>> {
    const client = await this.getClient(options);

    const { data, error } = await client
      .from(this.tableName)
      .select("*")
      .eq("board_id", boardId)
      .eq("column_id", columnId);

    if (error) {
      return { data: null, error: error.message, status: 500 };
    }

    return {
      data: (data ?? []).map((row) => this.fromDatabase(row as DatabaseRow)),
      error: null,
      status: 200,
    };
  }

  async findByRecordAndColumn(
    recordId: string,
    columnId: string,
    options?: RepositoryOptions,
  ): Promise<ApiResponse<CellValue | null>> {
    const client = await this.getClient(options);

    const { data, error } = await client
      .from(this.tableName)
      .select("*")
      .eq("record_id", recordId)
      .eq("column_id", columnId)
      .maybeSingle();

    if (error) {
      return { data: null, error: error.message, status: 500 };
    }

    if (!data) {
      return { data: null, error: null, status: 200 };
    }

    return { data: this.fromDatabase(data as DatabaseRow), error: null, status: 200 };
  }

  async bulkUpsert(
    cells: Array<{
      id: string;
      organizationId: string;
      workspaceId: string;
      boardId: string;
      recordId: string;
      columnId: string;
      value: ColumnValue;
      valueText: string;
    }>,
    options?: RepositoryOptions,
  ): Promise<ApiResponse<null>> {
    const client = await this.getClient(options);
    const now = new Date().toISOString();

    const payload = cells.map((cell) => ({
      id: cell.id,
      organization_id: cell.organizationId,
      workspace_id: cell.workspaceId,
      board_id: cell.boardId,
      record_id: cell.recordId,
      column_id: cell.columnId,
      value: cell.value,
      value_text: cell.valueText,
      updated_at: now,
    }));

    const { error } = await client.from(this.tableName).upsert(payload);

    if (error) {
      return { data: null, error: error.message, status: 500 };
    }

    return { data: null, error: null, status: 200 };
  }

  async clearColumn(
    boardId: string,
    columnId: string,
    options?: RepositoryOptions,
  ): Promise<ApiResponse<null>> {
    const client = await this.getClient(options);

    const { error } = await client
      .from(this.tableName)
      .delete()
      .eq("board_id", boardId)
      .eq("column_id", columnId);

    if (error) {
      return { data: null, error: error.message, status: 500 };
    }

    return { data: null, error: null, status: 200 };
  }

  async clearRecord(
    recordId: string,
    options?: RepositoryOptions,
  ): Promise<ApiResponse<null>> {
    const client = await this.getClient(options);

    const { error } = await client
      .from(this.tableName)
      .delete()
      .eq("record_id", recordId);

    if (error) {
      return { data: null, error: error.message, status: 500 };
    }

    return { data: null, error: null, status: 200 };
  }

  // ── Helpers ────────────────────────────────────────────

  private asString(value: unknown, fallback = ""): string {
    return typeof value === "string" && value.length > 0 ? value : fallback;
  }

  private asNumber(value: unknown, fallback = 0): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
  }

  async upsert(
    data: (Omit<CellValue, "id" | "createdAt" | "updatedAt"> & { id: string }) | (Omit<CellValue, "updatedAt"> & { id: string }),
    options?: RepositoryOptions,
  ): Promise<ApiResponse<CellValue>> {
    const client = await this.getClient(options);
    const now = new Date().toISOString();
    const dbData = this.toDatabase(data as Record<string, unknown>);
    const payload = {
      ...dbData,
      updated_at: now,
    };

    const { data: row, error } = await client
      .from(this.tableName)
      .upsert(payload)
      .select()
      .single();

    if (error) {
      return { data: null, error: error.message, status: 500 };
    }

    return { data: this.fromDatabase(row as DatabaseRow), error: null, status: 200 };
  }

  async upsertMany(
    items: Array<Record<string, unknown>>,
    options?: RepositoryOptions,
  ): Promise<ApiResponse<null>> {
    const client = await this.getClient(options);
    const now = new Date().toISOString();

    const payload = items.map((item) => ({
      ...item,
      updated_at: now,
    }));

    const { error } = await client.from(this.tableName).upsert(payload);

    if (error) {
      return { data: null, error: error.message, status: 500 };
    }

    return { data: null, error: null, status: 200 };
  }
}

