/**
 * Metadata Cache Types
 *
 * The Metadata Cache stores frequently-read but infrequently-written
 * metadata (boards, groups, columns, views, permissions) to reduce
 * repeated database reads.
 *
 * ── Cache Strategy ─────────────────────────────────────────
 * - Write-through: Cached data is updated on every mutation
 * - TTL-based expiry: Entries expire after configurable TTL
 * - Invalidation on mutation: Related cache entries are cleared
 * ───────────────────────────────────────────────────────────
 */

// ── Cache Entry ─────────────────────────────────────────────

export interface CacheEntry<T> {
  /** The cached data */
  data: T;

  /** When this entry was cached */
  cachedAt: string;

  /** When this entry expires */
  expiresAt: string;

  /** Cache entry version (incremented on each update) */
  version: number;
}

// ── Cache Key Namespace ─────────────────────────────────────

export type CacheNamespace =
  | "board"
  | "group"
  | "column"
  | "view"
  | "record"
  | "permission"
  | "dependencies"
  | "relationship"
  | "derivedValue"
  | "dependencyGraph";

// ── Cache Key ───────────────────────────────────────────────

export interface CacheKey {
  namespace: CacheNamespace;
  scopedBy: Record<string, string>;
}

// ── Cache Statistics ────────────────────────────────────────

export interface CacheStats {
  /** Total number of entries in cache */
  totalEntries: number;

  /** Number of active (non-expired) entries */
  activeEntries: number;

  /** Number of expired entries */
  expiredEntries: number;

  /** Number of cache hits */
  hits: number;

  /** Number of cache misses */
  misses: number;

  /** Hit rate (0-1) */
  hitRate: number;
}

// ── Cache Configuration ─────────────────────────────────────

export interface CacheConfig {
  /** Default TTL in milliseconds (default: 5 minutes) */
  defaultTtlMs: number;

  /** Maximum number of entries (default: 1000) */
  maxEntries: number;

  /** Whether to enable cache logging */
  enableLogging: boolean;

  /** Namespace-specific TTL overrides (ms) */
  namespaceTtls: Partial<Record<CacheNamespace, number>>;
}

// ── Cache Interface ─────────────────────────────────────────

export interface MetadataCache {
  /** Get a cached value */
  get<T>(namespace: CacheNamespace, key: string): T | undefined;

  /** Set a cached value */
  set<T>(
    namespace: CacheNamespace,
    key: string,
    data: T,
    ttlMs?: number,
  ): void;

  /** Remove a cached entry */
  invalidate(namespace: CacheNamespace, key: string): void;

  /** Invalidate all entries in a namespace */
  invalidateNamespace(namespace: CacheNamespace): void;

  /** Invalidate all entries */
  clear(): void;

  /** Get cache statistics */
  getStats(): CacheStats;

  /** Update cache configuration at runtime */
  updateConfig(config: Partial<CacheConfig>): void;
}

