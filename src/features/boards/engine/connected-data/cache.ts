/**
 * Connected Data — Cache Layer
 *
 * Relationship + derived value caching via the existing MetadataCache.
 * No second caching system is introduced.
 *
 * ── Cache Strategy ──────────────────────────────────────────
 * - Relationships:    Cached by board ID, invalidated on create/delete/update
 * - Derived values:   Cached by (record_id, column_id), TTL-based expiry
 * - Dependency graph: Cached by board ID, rebuilt on column config change
 * ────────────────────────────────────────────────────────────
 */

import "server-only";

import { metadataCache } from "../cache/metadata-cache";
import type {
  Relationship,
  DependencyGraphNode,
  DerivedValue,
} from "./types";
import type { ColumnValue } from "../types";

// ── Relationship Cache ──────────────────────────────────────

export const RelationshipCache = {
  /**
   * Get cached relationships for a board.
   */
  getByBoard(boardId: string): Relationship[] | undefined {
    return metadataCache.get<Relationship[]>("relationship", boardId);
  },

  /**
   * Cache relationships for a board.
   */
  setByBoard(boardId: string, relationships: Relationship[]): void {
    metadataCache.set("relationship", boardId, relationships, 60_000); // 1 minute
  },

  /**
   * Invalidate relationship cache for a board.
   */
  invalidateByBoard(boardId: string): void {
    metadataCache.invalidate("relationship", boardId);
  },

  /**
   * Invalidate relationship cache for a specific source record.
   */
  invalidateBySource(
    sourceBoardId: string,
    sourceRecordId: string,
    sourceColumnId: string,
  ): void {
    const cacheKey = `${sourceBoardId}:${sourceRecordId}:${sourceColumnId}`;
    metadataCache.invalidate("relationship", cacheKey);
    metadataCache.invalidate("relationship", sourceBoardId);
  },
};

// ── Derived Value Cache ─────────────────────────────────────

export const DerivedValueCache = {
  /**
   * Get a cached derived value for a record's derived column.
   */
  get(recordId: string, columnId: string): ColumnValue | undefined {
    const cacheKey = `${recordId}:${columnId}`;
    const entry = metadataCache.get<DerivedValue>("derivedValue", cacheKey);
    if (!entry) return undefined;
    return entry.value;
  },

  /**
   * Cache a derived value for a record's derived column.
   */
  set(recordId: string, columnId: string, value: ColumnValue): void {
    const cacheKey = `${recordId}:${columnId}`;
    const entry: DerivedValue = {
      id: cacheKey,
      organizationId: "",
      workspaceId: "",
      boardId: "",
      recordId,
      columnId,
      value,
      valueText: typeof value === "string" ? value : JSON.stringify(value),
      version: 1,
      computedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    metadataCache.set("derivedValue", cacheKey, entry, 30_000); // 30 seconds
  },

  /**
   * Invalidate a cached derived value.
   */
  invalidate(recordId: string, columnId: string): void {
    const cacheKey = `${recordId}:${columnId}`;
    metadataCache.invalidate("derivedValue", cacheKey);
  },

  /**
   * Invalidate ALL derived values for a board.
   * Used when the dependency graph changes.
   */
  invalidateByBoard(boardId: string): void {
    metadataCache.invalidateNamespace("derivedValue");
  },

  /**
   * Invalidate ALL derived values that depend on a specific column.
   * Called when a source column value changes.
   */
  invalidateByDependency(columnId: string): void {
    // In practice, we'd traverse the dependency graph and invalidate
    // only the affected entries. For now, full namespace clear is safe.
    metadataCache.invalidateNamespace("derivedValue");
  },
};

// ── Dependency Graph Cache ──────────────────────────────────

export const DependencyGraphCache = {
  /**
   * Get cached dependency graph for a board.
   */
  getByBoard(boardId: string): Map<string, DependencyGraphNode> | undefined {
    return metadataCache.get<Map<string, DependencyGraphNode>>(
      "dependencyGraph",
      boardId,
    );
  },

  /**
   * Cache the dependency graph for a board.
   */
  setByBoard(boardId: string, graph: Map<string, DependencyGraphNode>): void {
    metadataCache.set("dependencyGraph", boardId, graph, 5 * 60_000); // 5 minutes
  },

  /**
   * Invalidate dependency graph for a board.
   * Called when any derived column config changes.
   */
  invalidateByBoard(boardId: string): void {
    metadataCache.invalidate("dependencyGraph", boardId);
  },
};

