/**
 * Metadata Cache
 *
 * In-memory cache for frequently-read metadata (boards, groups, columns,
 * views, permissions). Reduces repeated database reads and improves
 * read performance for the Query Service and UI.
 *
 * ── Cache Strategy ─────────────────────────────────────────
 * - Write-through: Services update cache on every mutation
 * - TTL-based expiry: Configurable per namespace
 * - Invalidation: Related entries cleared on mutation
 * ───────────────────────────────────────────────────────────
 */

import type {
  CacheConfig,
  CacheEntry,
  CacheNamespace,
  CacheStats,
  MetadataCache,
} from "./cache-types";

const DEFAULT_CONFIG: CacheConfig = {
  defaultTtlMs: 5 * 60 * 1000, // 5 minutes
  maxEntries: 1000,
  enableLogging: false,
  namespaceTtls: {
    board: 10 * 60 * 1000, // 10 minutes (rarely changes)
    group: 5 * 60 * 1000,
    column: 5 * 60 * 1000,
    view: 5 * 60 * 1000,
    record: 2 * 60 * 1000, // 2 minutes (changes frequently)
    permission: 10 * 60 * 1000,
    dependencies: 5 * 60 * 1000,
  },
};

class DefaultMetadataCache implements MetadataCache {
  private cache = new Map<string, CacheEntry<unknown>>();
  private config: CacheConfig = { ...DEFAULT_CONFIG };
  private hits = 0;
  private misses = 0;

  get<T>(namespace: CacheNamespace, key: string): T | undefined {
    const fullKey = this.buildKey(namespace, key);
    const entry = this.cache.get(fullKey);

    if (!entry) {
      this.misses++;
      return undefined;
    }

    if (Date.now() > new Date(entry.expiresAt).getTime()) {
      this.cache.delete(fullKey);
      this.misses++;
      return undefined;
    }

    this.hits++;
    return entry.data as T;
  }

  set<T>(namespace: CacheNamespace, key: string, data: T, ttlMs?: number): void {
    // Evict if at capacity
    if (this.cache.size >= this.config.maxEntries) {
      this.evictLRU();
    }

    const ttl = ttlMs ?? this.config.namespaceTtls[namespace] ?? this.config.defaultTtlMs;
    const now = Date.now();
    const fullKey = this.buildKey(namespace, key);

    this.cache.set(fullKey, {
      data,
      cachedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + ttl).toISOString(),
      version: 1,
    });

    if (this.config.enableLogging) {
      console.debug(`[MetadataCache] SET ${fullKey} (TTL: ${ttl}ms)`);
    }
  }

  invalidate(namespace: CacheNamespace, key: string): void {
    const fullKey = this.buildKey(namespace, key);
    this.cache.delete(fullKey);

    if (this.config.enableLogging) {
      console.debug(`[MetadataCache] INVALIDATE ${fullKey}`);
    }
  }

  invalidateNamespace(namespace: CacheNamespace): void {
    const prefix = `${namespace}:`;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }

    if (this.config.enableLogging) {
      console.debug(`[MetadataCache] INVALIDATE NAMESPACE ${namespace}`);
    }
  }

  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  getStats(): CacheStats {
    const now = Date.now();
    let active = 0;
    let expired = 0;

    for (const entry of this.cache.values()) {
      if (now > new Date(entry.expiresAt).getTime()) {
        expired++;
      } else {
        active++;
      }
    }

    const total = this.hits + this.misses;

    return {
      totalEntries: this.cache.size,
      activeEntries: active,
      expiredEntries: expired,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
    };
  }

  updateConfig(config: Partial<CacheConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // ── Private Helpers ─────────────────────────────────────

  private buildKey(namespace: CacheNamespace, key: string): string {
    return `${namespace}:${key}`;
  }

  private evictLRU(): void {
    let oldestKey: string | undefined;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      const cachedAt = new Date(entry.cachedAt).getTime();
      if (cachedAt < oldestTime) {
        oldestTime = cachedAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);

      if (this.config.enableLogging) {
        console.debug(`[MetadataCache] EVICT LRU ${oldestKey}`);
      }
    }
  }
}

// Singleton instance
export const metadataCache: MetadataCache = new DefaultMetadataCache();

