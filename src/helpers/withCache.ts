/**
 * @module withCache (EXPERIMENTAL)
 *
 * Cache-aside wrapper for repositories/stores. Wraps specified read methods
 * with caching logic and auto-invalidates on write operations (create, update,
 * destroy, destroyAll).
 *
 * Returns a new object with the same interface — cached reads, invalidating
 * writes, and all other methods passed through unchanged.
 *
 * **Experimental:** This API may change in future releases. Known limitations:
 *
 * - **Invalidation assumes a key prefix convention.** Write operations call
 *   `delPattern(\`${tableName}:*\`)` to clear cache entries. This only works
 *   if your cache keys start with the table name (e.g., `users:123`). Keys
 *   that don't follow this convention will not be invalidated on writes.
 *
 * - **No per-key invalidation.** All cache entries matching the table prefix
 *   are cleared on any write, even if only one row changed. This is simple
 *   but may cause unnecessary cache misses under high write volume.
 *
 * - **`delPattern` must be implemented by the adapter.** Not all cache backends
 *   support wildcard deletion natively (e.g., plain Redis `DEL` does not).
 *   Your `CacheAdapter.delPattern` implementation must handle this.
 *
 * @example
 * import { withCache } from 'storium'
 *
 * const cachedUsers = withCache(users, redisAdapter, {
 *   findById:    { ttl: 300, key: (id) => `users:${id}` },
 *   findByEmail: { ttl: 300, key: (email) => `users:email:${email}` },
 * })
 *
 * // Reads hit cache first
 * await cachedUsers.findById('123')
 *
 * // Writes auto-invalidate all configured cache keys
 * await cachedUsers.update('123', { name: 'Bob' })
 */

import type { CacheAdapter, CacheMethodConfig } from '../core/types'

// --------------------------------------------------------------- Types --

type CacheConfig = Record<string, CacheMethodConfig>

// ------------------------------------------------------------ Helpers --

/**
 * Wrap a read method with cache-aside logic:
 * 1. Build the cache key from args
 * 2. Check cache — return on hit
 * 3. On miss, call the original method
 * 4. Store the result in cache with TTL
 * 5. Return the result
 */
const wrapWithCache = (
  originalFn: (...args: any[]) => Promise<any>,
  cache: CacheAdapter,
  config: CacheMethodConfig
) => {
  return async (...args: any[]) => {
    const cacheKey = config.key(...args)

    // Check cache
    const cached = await cache.get(cacheKey)
    if (cached !== null) {
      try {
        return JSON.parse(cached)
      } catch {
        // Corrupted cache entry — fall through to origin
        await cache.del(cacheKey)
      }
    }

    // Cache miss — call origin
    const result = await originalFn(...args)

    // Store in cache (don't cache null/undefined results)
    if (result !== null && result !== undefined) {
      await cache.set(cacheKey, JSON.stringify(result), config.ttl)
    }

    return result
  }
}

/**
 * Wrap a write method to invalidate all cache entries after the operation.
 * Uses `delPattern` with a wildcard to clear related entries.
 */
const wrapWithInvalidation = (
  originalFn: (...args: any[]) => Promise<any>,
  cache: CacheAdapter,
  tableName: string
) => {
  return async (...args: any[]) => {
    const result = await originalFn(...args)

    // Invalidate all cache entries for this table
    // Convention: all keys for a table share a common prefix
    await cache.delPattern(`${tableName}:*`)

    return result
  }
}

// --------------------------------------------------------- Public API --

/**
 * Wrap a store or repository with cache-aside logic.
 *
 * Specified read methods get cache-aside behavior. Write methods (create,
 * update, destroy, destroyAll) auto-invalidate all configured cache entries.
 *
 * **Experimental** — see module-level docs for known limitations.
 *
 * @param store - The store or repository to wrap
 * @param cache - A CacheAdapter implementation (Redis, Memcached, etc.)
 * @param config - Map of method names to cache configuration (TTL + key builder)
 * @returns A new object with the same interface, cached reads + invalidating writes
 */
export const withCache = <T extends Record<string, any>>(
  store: T,
  cache: CacheAdapter,
  config: CacheConfig
): T => {
  const tableName = store.name ?? 'unknown'
  const result = { ...store }

  // Wrap configured read methods with cache-aside
  for (const [methodName, methodConfig] of Object.entries(config)) {
    const original = store[methodName]
    if (typeof original !== 'function') continue

    ;(result as any)[methodName] = wrapWithCache(
      original.bind(store),
      cache,
      methodConfig
    )
  }

  // Wrap write methods with invalidation
  const writeMethods = ['create', 'update', 'destroy', 'destroyAll']

  for (const method of writeMethods) {
    const original = store[method]
    if (typeof original !== 'function') continue

    ;(result as any)[method] = wrapWithInvalidation(
      original.bind(store),
      cache,
      tableName
    )
  }

  return result as T
}
