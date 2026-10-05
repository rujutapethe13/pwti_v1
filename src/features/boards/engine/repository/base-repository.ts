/**
 * Base Repository
 *
 * Generic CRUD base class for all entity repositories.
 * Provides soft-delete support, transaction chaining, and
 * standardized Supabase query patterns.
 *
 * Every entity repository extends this class.
 */

import { createServiceClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { ApiResponse } from "@/types";

// ── Database Row Types ─────────────────────────────────────

export type DatabaseRow = Record<string, unknown>;

export interface RepositoryOptions {
  /** Reuse an existing Supabase client (for transactions) */
  client?: SupabaseClient;
}

// ── Base Repository ─────────────────────────────────────────

export abstract class BaseRepository<T extends { id: string }> {
  protected abstract tableName: string;
  protected abstract primaryKey: string;

  /**
   * Get a Supabase client — either an existing one (for transactions)
   * or a fresh server client.
   */
  protected async getClient(options?: RepositoryOptions): Promise<SupabaseClient> {
    return options?.client ?? (await createServiceClient());
  }

  // ── Create ──────────────────────────────────────────────

  async create(
    data: (Omit<T, "id" | "createdAt" | "updatedAt"> & { id: string }) | (Omit<T, "updatedAt"> & { id: string }),
    options?: RepositoryOptions,
  ): Promise<ApiResponse<T>> {
    const client = await this.getClient(options);
    const now = new Date().toISOString();
    const dbData = this.toDatabase(data as Record<string, unknown>);
    const payload = {
      ...dbData,
      created_at: dbData.created_at ?? now,
      updated_at: now,
    };

    const { data: row, error } = await client
      .from(this.tableName)
      .insert(payload)
      .select()
      .single();

    if (error) {
      return { data: null, error: error.message, status: 500 };
    }

    return { data: this.fromDatabase(row as DatabaseRow), error: null, status: 201 };
  }

  // ── Read ────────────────────────────────────────────────

  async findById(id: string, options?: RepositoryOptions): Promise<ApiResponse<T>> {
    const client = await this.getClient(options);

    const { data, error } = await client
      .from(this.tableName)
      .select("*")
      .eq(this.primaryKey, id)
      .maybeSingle();

    if (error) {
      return { data: null, error: error.message, status: 500 };
    }

    if (!data) {
      return { data: null, error: `${this.tableName} not found`, status: 404 };
    }

    return { data: this.fromDatabase(data as DatabaseRow), error: null, status: 200 };
  }

  async findMany(
    filters: Record<string, unknown> = {},
    order?: { column: string; ascending: boolean },
    options?: RepositoryOptions,
  ): Promise<ApiResponse<T[]>> {
    const client = await this.getClient(options);

    let query = client.from(this.tableName).select("*");

    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null) {
        query = query.eq(key, value as string | number | boolean);
      }
    }

    if (order) {
      query = query.order(order.column, { ascending: order.ascending });
    }

    const { data: rows, error } = await query;

    if (error) {
      return { data: null, error: error.message, status: 500 };
    }

    return {
      data: (rows ?? []).map((row) => this.fromDatabase(row as DatabaseRow)),
      error: null,
      status: 200,
    };
  }

  // ── Update ──────────────────────────────────────────────

  async update(
    id: string,
    data: Partial<Omit<T, "id" | "createdAt" | "updatedAt">>,
    options?: RepositoryOptions,
  ): Promise<ApiResponse<T>> {
    const client = await this.getClient(options);
    const now = new Date().toISOString();
    const payload = {
      ...this.toDatabase(data as Record<string, unknown>),
      updated_at: now,
    };

    const { data: row, error } = await client
      .from(this.tableName)
      .update(payload)
      .eq(this.primaryKey, id)
      .select()
      .single();

    if (error) {
      return { data: null, error: error.message, status: 500 };
    }

    return { data: this.fromDatabase(row as DatabaseRow), error: null, status: 200 };
  }

  // ── Soft Delete ─────────────────────────────────────────

  async softDelete(id: string, options?: RepositoryOptions): Promise<ApiResponse<T>> {
    const client = await this.getClient(options);
    const now = new Date().toISOString();

    const { data: row, error } = await client
      .from(this.tableName)
      .update({ status: "archived", archived_at: now, updated_at: now })
      .eq(this.primaryKey, id)
      .select()
      .single();

    if (error) {
      return { data: null, error: error.message, status: 500 };
    }

    return { data: this.fromDatabase(row as DatabaseRow), error: null, status: 200 };
  }

  // ── Hard Delete ─────────────────────────────────────────

  async hardDelete(id: string, options?: RepositoryOptions): Promise<ApiResponse<null>> {
    const client = await this.getClient(options);

    const { error } = await client
      .from(this.tableName)
      .delete()
      .eq(this.primaryKey, id);

    if (error) {
      return { data: null, error: error.message, status: 500 };
    }

    return { data: null, error: null, status: 200 };
  }

  // ── Count ───────────────────────────────────────────────

  async count(
    filters: Record<string, unknown> = {},
    options?: RepositoryOptions,
  ): Promise<ApiResponse<number>> {
    const client = await this.getClient(options);

    let query = client.from(this.tableName).select("*", { count: "exact", head: true });

    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null) {
        query = query.eq(key, value as string | number | boolean);
      }
    }

    const { count, error } = await query;

    if (error) {
      return { data: null, error: error.message, status: 500 };
    }

    return { data: count ?? 0, error: null, status: 200 };
  }

  // ── Upsert ───────────────────────────────────────────────

  async upsert(
    data: (Omit<T, "id" | "createdAt" | "updatedAt"> & { id: string }) | (Omit<T, "updatedAt"> & { id: string }),
    options?: RepositoryOptions,
  ): Promise<ApiResponse<T>> {
    const client = await this.getClient(options);
    const now = new Date().toISOString();
    const dbData = this.toDatabase(data as Record<string, unknown>);
    const payload = {
      ...dbData,
      ...(dbData.created_at ? {} : { created_at: now }),
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

  // ── Batch Upsert ────────────────────────────────────────

  async upsertMany(
    items: Array<Record<string, unknown>>,
    options?: RepositoryOptions,
  ): Promise<ApiResponse<null>> {
    const client = await this.getClient(options);
    const now = new Date().toISOString();

    const payload = items.map((item) => ({
      ...item,
      updated_at: now,
      ...(item.created_at ? {} : { created_at: now }),
    }));

    const { error } = await client.from(this.tableName).upsert(payload);

    if (error) {
      return { data: null, error: error.message, status: 500 };
    }

    return { data: null, error: null, status: 200 };
  }

  // ── Abstract Mappers ────────────────────────────────────

  /** Convert database snake_case row to TypeScript camelCase entity */
  protected abstract fromDatabase(row: DatabaseRow): T;

  /** Convert TypeScript camelCase entity to database snake_case row */
  protected abstract toDatabase(entity: Partial<T> | Record<string, unknown>): Record<string, unknown>;
}

