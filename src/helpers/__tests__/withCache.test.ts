import { describe, it, expect, vi, beforeEach } from 'vitest'
import { withCache } from '../withCache'
import type { CacheAdapter } from '../../core/types'

const createMockCache = (): CacheAdapter & { store: Map<string, string> } => {
  const store = new Map<string, string>()
  return {
    store,
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => { store.set(key, value) }),
    del: vi.fn(async (key: string) => { store.delete(key) }),
    delPattern: vi.fn(async (pattern: string) => {
      const prefix = pattern.replace('*', '')
      for (const key of store.keys()) {
        if (key.startsWith(prefix)) store.delete(key)
      }
    }),
  }
}

const createMockStore = () => ({
  name: 'users',
  findById: vi.fn(async (id: string) => ({ id, email: `${id}@test.com` })),
  findByEmail: vi.fn(async (email: string) => ({ id: '1', email })),
  create: vi.fn(async (input: any) => ({ id: '1', ...input })),
  update: vi.fn(async (id: string, input: any) => ({ id, ...input })),
  destroy: vi.fn(async () => {}),
  destroyAll: vi.fn(async () => 1),
})

describe('withCache', () => {
  let cache: ReturnType<typeof createMockCache>
  let store: ReturnType<typeof createMockStore>
  let cached: ReturnType<typeof createMockStore>

  beforeEach(() => {
    cache = createMockCache()
    store = createMockStore()
    cached = withCache(store, cache, {
      findById: { ttl: 300, key: (id: string) => `users:${id}` },
    })
  })

  describe('cache-aside reads', () => {
    it('calls the original on cache miss and stores the result', async () => {
      const result = await cached.findById('123')
      expect(result).toEqual({ id: '123', email: '123@test.com' })
      expect(store.findById).toHaveBeenCalledTimes(1)
      expect(cache.set).toHaveBeenCalledWith('users:123', JSON.stringify(result), 300)
    })

    it('returns cached value on cache hit without calling original', async () => {
      await cached.findById('123')
      store.findById.mockClear()

      const result = await cached.findById('123')
      expect(result).toEqual({ id: '123', email: '123@test.com' })
      expect(store.findById).not.toHaveBeenCalled()
    })
  })

  describe('write invalidation', () => {
    it('invalidates cache entries on create', async () => {
      await cached.findById('123') // populate cache
      expect(cache.store.size).toBe(1)

      await cached.create({ email: 'new@test.com' })
      expect(cache.delPattern).toHaveBeenCalledWith('users:*')
      expect(cache.store.size).toBe(0)
    })

    it('invalidates cache entries on update', async () => {
      await cached.findById('123')
      await cached.update('123', { email: 'updated@test.com' })
      expect(cache.delPattern).toHaveBeenCalledWith('users:*')
    })

    it('invalidates cache entries on destroy', async () => {
      await cached.findById('123')
      await cached.destroy('123')
      expect(cache.delPattern).toHaveBeenCalledWith('users:*')
    })

    it('invalidates cache entries on destroyAll', async () => {
      await cached.findById('123')
      await cached.destroyAll({ active: false })
      expect(cache.delPattern).toHaveBeenCalledWith('users:*')
    })
  })

  describe('passthrough', () => {
    it('passes through uncached methods unchanged', async () => {
      const result = await cached.findByEmail('test@test.com')
      expect(result).toEqual({ id: '1', email: 'test@test.com' })
      expect(store.findByEmail).toHaveBeenCalledTimes(1)
      // Not cached — no set call for this method
      expect(cache.set).not.toHaveBeenCalled()
    })
  })

  describe('corrupted cache', () => {
    it('falls back to origin on corrupted cache entry', async () => {
      cache.store.set('users:123', 'not-json{{{')
      const result = await cached.findById('123')
      expect(result).toEqual({ id: '123', email: '123@test.com' })
      expect(cache.del).toHaveBeenCalledWith('users:123')
    })
  })
})
