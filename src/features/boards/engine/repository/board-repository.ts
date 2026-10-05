/**
 * Board Repository
 *
 * Database access layer for boards.
 * Maps between TypeScript BoardDefinition and database snake_case rows.
 */

import "server-only";

import { BaseRepository, type DatabaseRow, type RepositoryOptions } from "./base-repository";
import type { ApiResponse } from "@/types";
import type { BoardDefinition } from "../types";

export class BoardRepository extends BaseRepository<BoardDefinition> {
  protected tableName = "boards";
  protected primaryKey = "id";

  protected fromDatabase(row: DatabaseRow): BoardDefinition {
    return {
      id: this.asString(row.id),
      organizationId: this.asString(row.organization_id ?? row.organizationId),
      workspaceId: this.asString(row.workspace_id ?? row.workspaceId),
      slug: this.asString(row.slug, this.asString(row.id)),
      name: this.asString(row.name, this.asString(row.slug, this.asString(row.id))),
      description: this.asString(row.description),
      templateId: this.asString(row.template_id ?? row.templateId) || undefined,
      icon: undefined,
      favorite: this.asBoolean(row.favorite),
      pinned: this.asBoolean(row.pinned),
      visibility: this.asString(row.visibility, "workspace") as BoardDefinition["visibility"],
      status: this.asString(row.status, "active") as BoardDefinition["status"],
      sharedWith: this.asStringArray(row.shared_with ?? row.sharedWith, ["owner", "editor", "viewer"]) as BoardDefinition["sharedWith"],
      isRestricted: this.asBoolean(row.is_restricted),
      primaryColumnLabel: this.asString(row.primary_column_label ?? row.primaryColumnLabel) || undefined,
      createdAt: this.asString(row.created_at ?? row.createdAt),
      updatedAt: this.asString(row.updated_at ?? row.updatedAt),
    };
  }

  protected toDatabase(entity: Partial<BoardDefinition> | Record<string, unknown>): Record<string, unknown> {
    const e = entity as Partial<BoardDefinition>;
    return {
      ...(e.id !== undefined ? { id: e.id } : {}),
      ...(e.organizationId !== undefined ? { organization_id: e.organizationId } : {}),
      ...(e.workspaceId !== undefined ? { workspace_id: e.workspaceId } : {}),
      ...(e.slug !== undefined ? { slug: e.slug } : {}),
      ...(e.name !== undefined ? { name: e.name } : {}),
      ...(e.description !== undefined ? { description: e.description } : {}),
      ...(e.templateId !== undefined ? { template_id: e.templateId } : {}),
      ...(e.favorite !== undefined ? { favorite: e.favorite } : {}),
      ...(e.pinned !== undefined ? { pinned: e.pinned } : {}),
      ...(e.visibility !== undefined ? { visibility: e.visibility } : {}),
      ...(e.status !== undefined ? { status: e.status } : {}),
      ...(e.sharedWith !== undefined ? { shared_with: e.sharedWith } : {}),
      ...(e.isRestricted !== undefined ? { is_restricted: e.isRestricted } : {}),
      ...(e.primaryColumnLabel !== undefined ? { primary_column_label: e.primaryColumnLabel } : {}),
    };
  }

  // ── Board-specific queries ──────────────────────────────

  async findBySlug(slug: string, options?: RepositoryOptions): Promise<ApiResponse<BoardDefinition>> {
    const client = await this.getClient(options);

    const { data, error } = await client
      .from(this.tableName)
      .select("*")
      .eq("slug", slug)
      .maybeSingle();

    if (error) {
      return { data: null, error: error.message, status: 500 };
    }

    if (!data) {
      return { data: null, error: "Board not found", status: 404 };
    }

    return { data: this.fromDatabase(data as DatabaseRow), error: null, status: 200 };
  }

  async findByWorkspace(
    workspaceId: string,
    options?: RepositoryOptions,
  ): Promise<ApiResponse<BoardDefinition[]>> {
    return this.findMany({ workspace_id: workspaceId }, { column: "name", ascending: true }, options);
  }

  async updateFavorite(
    id: string,
    favorite: boolean,
    options?: RepositoryOptions,
  ): Promise<ApiResponse<BoardDefinition>> {
    return this.update(id, { favorite } as Partial<BoardDefinition>, options);
  }

  async duplicate(
    sourceId: string,
    newId: string,
    newSlug: string,
    newName: string,
    options?: RepositoryOptions,
  ): Promise<ApiResponse<BoardDefinition>> {
    // First fetch the source
    const source = await this.findById(sourceId, options);
    if (source.error || !source.data) {
      return source as ApiResponse<BoardDefinition>;
    }

    // Create duplicate with new identity
    return this.create(
      {
        id: newId,
        organizationId: source.data.organizationId,
        workspaceId: source.data.workspaceId,
        slug: newSlug,
        name: newName,
        description: source.data.description,
        favorite: false,
        pinned: false,
        visibility: source.data.visibility,
        status: "active",
        sharedWith: source.data.sharedWith,
      },
      options,
    );
  }

  // ── Type coercion helpers ──────────────────────────────

  private asString(value: unknown, fallback = ""): string {
    return typeof value === "string" && value.length > 0 ? value : fallback;
  }

  private asBoolean(value: unknown, fallback = false): boolean {
    return typeof value === "boolean" ? value : fallback;
  }

  private asStringArray(value: unknown, fallback: string[] = []): string[] {
    return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : fallback;
  }
}

