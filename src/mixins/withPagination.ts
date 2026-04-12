/**
 * @module withPagination
 *
 * Adds a `paginate()` method to any store. Wraps the store (same pattern
 * as withCache) — all original methods are passed through.
 *
 * If the underlying store has soft delete enabled (i.e., exposes
 * `findWithDeleted` and `countWithDeleted`), a `paginateWithDeleted`
 * method is also added.
 *
 * @example
 * import { withPagination } from 'storium'
 *
 * const paginatedUsers = withPagination(users)
 *
 * const result = await paginatedUsers.paginate(
 *   { status: 'active' },
 *   { page: 2, pageSize: 25 }
 * )
 * // { data: [...], meta: { page: 2, pageSize: 25, total: 142, totalPages: 6 } }
 */

import { StoreError } from '../errors'
import type { QueryOptions } from '../types'

type PaginateOpts = QueryOptions & {
  page: number
  pageSize?: number
}

type PaginateResult<T = any> = {
  data: T[]
  meta: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

type PaginationDefaults = {
  pageSize?: number
}

const DEFAULT_PAGE_SIZE = 25

/**
 * Shared pagination logic used by both `paginate` and `paginateWithDeleted`.
 */
const buildPaginate = (
  store: Record<string, any>,
  defaultPageSize: number,
  findFn: 'find' | 'findWithDeleted',
  countFn: 'count' | 'countWithDeleted'
) => {
  return async (
    filters: Record<string, any>,
    opts: PaginateOpts
  ): Promise<PaginateResult> => {
    const { page, pageSize: rawPageSize, ...restOpts } = opts
    const pageSize = rawPageSize ?? defaultPageSize

    if (page < 1) {
      throw new StoreError('page must be >= 1')
    }
    if (pageSize < 1) {
      throw new StoreError('pageSize must be >= 1')
    }

    const sharedOpts: Record<string, any> = {}
    if (restOpts.where) sharedOpts.where = restOpts.where
    if (restOpts.tx) sharedOpts.tx = restOpts.tx

    const hasFilters = Object.keys(filters).length > 0
    const queryOpts = {
      ...sharedOpts,
      limit: pageSize,
      offset: (page - 1) * pageSize,
      orderBy: restOpts.orderBy,
    }

    const [total, data] = await Promise.all([
      store[countFn](hasFilters ? filters : {}, sharedOpts),
      hasFilters
        ? store[findFn](filters, queryOpts)
        : findFn === 'find'
          ? store.findAll(queryOpts)
          : store[findFn]({}, queryOpts),
    ])

    const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize)

    return {
      data,
      meta: { page, pageSize, total, totalPages },
    }
  }
}

export const withPagination = <T extends Record<string, any>>(
  store: T,
  defaults?: PaginationDefaults
): T & {
  paginate: (filters: Record<string, any>, opts: PaginateOpts) => Promise<PaginateResult>
  paginateWithDeleted?: (filters: Record<string, any>, opts: PaginateOpts) => Promise<PaginateResult>
} => {
  const defaultPageSize = defaults?.pageSize ?? DEFAULT_PAGE_SIZE

  const paginate = buildPaginate(store, defaultPageSize, 'find', 'count')

  const result: Record<string, any> = { ...store, paginate }

  // Add paginateWithDeleted only for soft-delete stores
  if (typeof store.findWithDeleted === 'function' && typeof store.countWithDeleted === 'function') {
    result.paginateWithDeleted = buildPaginate(store, defaultPageSize, 'findWithDeleted', 'countWithDeleted')
  }

  return result as any
}
