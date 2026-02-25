/**
 * Storium v1 — withTransaction
 *
 * Explicit scoped transaction helper. Wraps a sequence of operations in a
 * database transaction that auto-commits on success and auto-rollbacks on error.
 *
 * Repository methods accept `{ tx }` in their options to participate in the
 * transaction. This keeps transactions explicit at the call site — no ambient
 * context, no decorators, no magic.
 *
 * @example
 * const result = await db.withTransaction(async (tx) => {
 *   const user = await users.create({ name: 'Alice' }, { tx })
 *   const team = await teams.create({ name: 'Alpha', owner_id: user.id }, { tx })
 *   return { user, team }
 * })
 */

/**
 * Create a `withTransaction` function bound to a Drizzle database instance.
 *
 * @param db - The Drizzle database instance
 * @returns A function that executes a callback within a transaction
 */
export const createWithTransaction = (db: any) => {
  /**
   * Execute a callback within a database transaction.
   *
   * @param fn - Async function receiving the transaction object `tx`.
   *             Pass `tx` to repository operations via `{ tx }` in options.
   * @returns The return value of the callback
   * @throws Re-throws any error from the callback after rolling back
   */
  return async <T>(fn: (tx: any) => Promise<T>): Promise<T> => {
    return db.transaction(fn)
  }
}
