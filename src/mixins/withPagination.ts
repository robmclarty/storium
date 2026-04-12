/**
 * @module withPagination
 *
 * Adds a `paginate()` method to any store. Wraps the store (same pattern
 * as withCache) — all original methods are passed through.
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

type PaginateOpts = {
  page: number
  pageSize?: number
  orderBy?: any
  where?: (table: any) => any
  tx?: any
  includeHidden?: boolean
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

export const withPagination = <T extends Record<string, any>>(
  store: T,
  defaults?: PaginationDefaults
): T & { paginate: (filters: Record<string, any>, opts: PaginateOpts) => Promise<PaginateResult> } => {
  const defaultPageSize = defaults?.pageSize ?? DEFAULT_PAGE_SIZE

  const paginate = async (
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
    if (restOpts.includeHidden) sharedOpts.includeHidden = restOpts.includeHidden

    const hasFilters = Object.keys(filters).length > 0

    const [total, data] = await Promise.all([
      hasFilters
        ? store.count(filters, sharedOpts)
        : store.count({}, sharedOpts),
      hasFilters
        ? store.find(filters, {
            ...sharedOpts,
            limit: pageSize,
            offset: (page - 1) * pageSize,
            orderBy: restOpts.orderBy,
          })
        : store.findAll({
            ...sharedOpts,
            limit: pageSize,
            offset: (page - 1) * pageSize,
            orderBy: restOpts.orderBy,
          }),
    ])

    const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize)

    return {
      data,
      meta: { page, pageSize, total, totalPages },
    }
  }

  return { ...store, paginate }
}
