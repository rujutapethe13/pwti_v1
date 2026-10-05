/**
 * Dashboard Repository
 *
 * Database access layer for Dashboard entities.
 * Follows the same pattern as BoardRepository/ViewRepository
 * in the existing metadata engine.
 *
 * [ASSUMPTION] This assumes a `dashboards` table exists in Supabase
 * with columns: id, workspace_id, name, description, icon, color,
 * layout (jsonb), settings (jsonb), is_default, is_favorite,
 * created_at, updated_at.
 *
 * If the table doesn't exist yet, this code is ready for the migration
 * that creates it.
 */

import "server-only";

import { BaseRepository, type DatabaseRow, type RepositoryOptions } from
  "../../boards/engine/repository/base-repository";
import type { ApiResponse } from "@/types";
import type { Dashboard, DashboardLayout, DashboardSettings } from "./types";

export class DashboardRepository extends BaseRepository<Dashboard> {
  protected tableName = "dashboards";
  protected primaryKey = "id";

  protected fromDatabase(row: DatabaseRow): Dashboard {
    return {
      id: this.asString(row.id),
      workspaceId: this.asString(row.workspace_id ?? row.workspaceId),
      name: this.asString(row.name),
      description: this.asString(row.description) || undefined,
      icon: this.asString(row.icon) || undefined,
      color: this.asString(row.color) || undefined,
      layout: this.asLayout(row.layout ?? row.layout),
      settings: this.asSettings(row.settings),
      isDefault: this.asBoolean(row.is_default ?? row.isDefault),
      isFavorite: this.asBoolean(row.is_favorite ?? row.isFavorite),
      createdAt: this.asString(row.created_at ?? row.createdAt),
      updatedAt: this.asString(row.updated_at ?? row.updatedAt),
    };
  }

  protected toDatabase(entity: Partial<Dashboard> | Record<string, unknown>): Record<string, unknown> {
    const e = entity as Partial<Dashboard>;
    return {
      ...(e.id !== undefined ? { id: e.id } : {}),
      ...(e.workspaceId !== undefined ? { workspace_id: e.workspaceId } : {}),
      ...(e.name !== undefined ? { name: e.name } : {}),
      ...(e.description !== undefined ? { description: e.description } : {}),
      ...(e.icon !== undefined ? { icon: e.icon } : {}),
      ...(e.color !== undefined ? { color: e.color } : {}),
      ...(e.layout !== undefined ? { layout: e.layout } : {}),
      ...(e.settings !== undefined ? { settings: e.settings } : {}),
      ...(e.isDefault !== undefined ? { is_default: e.isDefault } : {}),
      ...(e.isFavorite !== undefined ? { is_favorite: e.isFavorite } : {}),
    };
  }

  // ── Dashboard-specific queries ─────────────────────────

  async findByWorkspace(
    workspaceId: string,
    options?: RepositoryOptions,
  ): Promise<ApiResponse<Dashboard[]>> {
    return this.findMany(
      { workspace_id: workspaceId },
      { column: "created_at", ascending: false },
      options,
    );
  }

  async findDefault(
    workspaceId: string,
    options?: RepositoryOptions,
  ): Promise<ApiResponse<Dashboard | null>> {
    const client = await this.getClient(options);

    const { data, error } = await client
      .from(this.tableName)
      .select("*")
      .eq("workspace_id", workspaceId)
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

  async toggleFavorite(
    id: string,
    isFavorite: boolean,
    options?: RepositoryOptions,
  ): Promise<ApiResponse<Dashboard>> {
    return this.update(id, { isFavorite } as Partial<Dashboard>, options);
  }

  // ── Layout helpers ─────────────────────────────────────

  async updateLayout(
    id: string,
    layout: DashboardLayout,
    options?: RepositoryOptions,
  ): Promise<ApiResponse<Dashboard>> {
    return this.update(id, { layout } as Partial<Dashboard>, options);
  }

  async updateSettings(
    id: string,
    settings: Partial<DashboardSettings>,
    options?: RepositoryOptions,
  ): Promise<ApiResponse<Dashboard>> {
    // Merge with existing settings
    const existing = await this.findById(id, options);
    const merged: DashboardSettings = {
      ...(existing.data?.settings ?? this.defaultSettings()),
      ...settings,
    };
    return this.update(id, { settings: merged } as Partial<Dashboard>, options);
  }

  // ── Defaults ───────────────────────────────────────────

  defaultSettings(): DashboardSettings {
    return {
      defaultDateRange: "last_30_days",
      refreshInterval: 0,
      globalFilters: [],
    };
  }

  defaultLayout(): DashboardLayout {
    return { lg: [], md: [], sm: [] };
  }

  // ── Helpers ────────────────────────────────────────────

  private asString(value: unknown, fallback = ""): string {
    return typeof value === "string" && value.length > 0 ? value : fallback;
  }

  private asBoolean(value: unknown, fallback = false): boolean {
    return typeof value === "boolean" ? value : fallback;
  }

  private asLayout(value: unknown): DashboardLayout {
    if (!value || typeof value !== "object") return this.defaultLayout();
    const v = value as Record<string, unknown>;
    return {
      lg: Array.isArray(v.lg) ? v.lg : [],
      md: Array.isArray(v.md) ? v.md : [],
      sm: Array.isArray(v.sm) ? v.sm : [],
    };
  }

  private asSettings(value: unknown): DashboardSettings {
    if (!value || typeof value !== "object") return this.defaultSettings();
    return { ...this.defaultSettings(), ...(value as Record<string, unknown>) } as DashboardSettings;
  }
}
