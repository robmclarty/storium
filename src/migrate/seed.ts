/**
 * @module seed
 *
 * Provides `defineSeed()` for authoring seed files and a runner that
 * executes them in alphabetical order. Seeds receive a context with
 * auto-discovered stores so they can use CRUD operations directly.
 *
 * @example
 * // seeds/001_users.ts
 * import { defineSeed } from 'storium/migrate'
 *
 * export default defineSeed(async (db) => {
 *   const { users, posts } = db.stores
 *
 *   const alice = await users.create({ email: 'alice@example.com', name: 'Alice' })
 *   await posts.create({ title: 'Hello', author_id: alice.id })
 * })
 */

import path from 'node:path'
import { glob } from 'glob'
import { hasMeta } from '../core/defineTable'
import { isStoreDefinition } from '../core/defineStore'
import { loadConfig } from '../core/configLoader'
import type { StoriumInstance, ConnectConfig, Dialect, TableDef } from '../core/types'

// --------------------------------------------------------------- Types --

/**
 * Context passed to each seed function. Provides auto-discovered stores,
 * raw Drizzle access, and the full StoriumInstance for advanced use.
 */
export type SeedContext = {
  /** Auto-discovered live stores, keyed by table name. */
  stores: Record<string, any>
  /** The raw Drizzle database instance. */
  drizzle: any
  /** The active dialect. */
  dialect: Dialect
  /** Scoped transaction helper. */
  transaction: StoriumInstance['transaction']
  /** Full StoriumInstance for advanced use (manual register, defineTable, etc). */
  instance: StoriumInstance
}

/** A seed function receives the seed context. */
export type SeedFn = (db: SeedContext) => Promise<void>

/** A seed module's default export shape. */
export type SeedModule = {
  __isSeed: true
  run: SeedFn
}

// --------------------------------------------------------- Public API --

/**
 * Define a seed function. Wraps the function with metadata so the runner
 * can identify it as a valid seed module.
 *
 * @param fn - The seed function
 * @returns A seed module object
 *
 * @example
 * export default defineSeed(async (db) => {
 *   const { users } = db.stores
 *   await users.create({ email: 'alice@example.com', name: 'Alice' })
 * })
 */
export const defineSeed = (fn: SeedFn): SeedModule => ({
  __isSeed: true,
  run: fn,
})

/**
 * Check if a value is a valid seed module.
 */
const isSeedModule = (value: any): value is SeedModule =>
  value !== null &&
  typeof value === 'object' &&
  value.__isSeed === true &&
  typeof value.run === 'function'

// -------------------------------------------------------- Discovery --

/**
 * Import files matching glob patterns and extract exports that pass a predicate.
 */
const importAndCollect = async <T>(
  patterns: string | string[],
  predicate: (value: any) => value is T
): Promise<T[]> => {
  const globs = Array.isArray(patterns) ? patterns : [patterns]
  const files: string[] = []

  for (const pattern of globs) {
    const matches = await glob(pattern, { cwd: process.cwd(), absolute: true })
    files.push(...matches)
  }

  const uniqueFiles = [...new Set(files)]
  const results: T[] = []

  for (const filePath of uniqueFiles) {
    try {
      const mod = await import(filePath)
      for (const exportValue of Object.values(mod)) {
        if (predicate(exportValue as any)) {
          results.push(exportValue as T)
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.warn(
        `[storium] Warning: Failed to import '${filePath}': ${message}`
      )
    }
  }

  return results
}

/**
 * Auto-discover stores from config globs.
 *
 * Phase 1: Load StoreDefinitions from `config.stores` glob (full custom queries).
 * Phase 2: Load TableDefs from `config.schema` glob (CRUD-only fallback).
 *
 * Stores from phase 1 take priority (by table name) over phase 2.
 */
const discoverStores = async (
  db: StoriumInstance,
  config?: ConnectConfig
): Promise<Record<string, any>> => {
  const liveStores: Record<string, any> = {}
  const coveredTables = new Set<string>()

  // Phase 1: StoreDefinitions (full custom queries)
  if (config?.stores) {
    const storeDefs = await importAndCollect(config.stores, isStoreDefinition)

    for (const def of storeDefs) {
      const name = def.name
      if (!coveredTables.has(name)) {
        const registered = db.register({ [name]: def })
        liveStores[name] = registered[name]
        coveredTables.add(name)
      }
    }
  }

  // Phase 2: TableDefs (CRUD-only fallback)
  if (config?.schema) {
    const tableDefs = await importAndCollect(
      config.schema,
      hasMeta as (value: any) => value is TableDef
    )

    for (const tableDef of tableDefs) {
      const name = (tableDef as any).storium.name
      if (!coveredTables.has(name)) {
        liveStores[name] = db.defineStore(tableDef)
        coveredTables.add(name)
      }
    }
  }

  return liveStores
}

// ----------------------------------------------------------- Runner --

/**
 * Run all seed files in a directory.
 * Seeds are executed in alphabetical filename order.
 *
 * Auto-loads config from `drizzle.config.ts` for seeds directory path
 * and store/schema discovery. Pass an optional config to override.
 *
 * @param db - A StoriumInstance (from connect())
 * @param config - Optional config override (default: auto-loads drizzle.config.ts)
 * @returns Summary of seeds run
 */
export const seed = async (
  db: StoriumInstance,
  config?: ConnectConfig
): Promise<{ success: boolean; message: string; count: number }> => {
  const cfg = config ?? await loadConfig()
  const seedsDir = cfg.seeds ?? './seeds'

  // Auto-discover stores from config globs
  const stores = await discoverStores(db, cfg)

  // Build the seed context
  const ctx: SeedContext = {
    stores,
    drizzle: db.drizzle,
    dialect: db.dialect,
    transaction: db.transaction,
    instance: db,
  }

  const pattern = path.join(seedsDir, '**/*.{ts,js,mjs}')
  const files = await glob(pattern, { cwd: process.cwd(), absolute: true })

  // Sort alphabetically so naming convention (001_, 002_) controls order
  const sorted = files.toSorted((a, b) => path.basename(a).localeCompare(path.basename(b)))

  if (sorted.length === 0) {
    return { success: true, message: 'No seed files found.', count: 0 }
  }

  let count = 0

  for (const filePath of sorted) {
    const fileName = path.basename(filePath)

    try {
      const mod = await import(filePath)
      const seedModule = mod.default ?? mod

      if (!isSeedModule(seedModule)) {
        console.warn(
          `[storium] Skipping '${fileName}': not a valid seed module. ` +
          `Use defineSeed() to create seed files.`
        )
        continue
      }

      console.log(`[storium] Running seed: ${fileName}`)
      await seedModule.run(ctx)
      count++
      console.log(`[storium] ✓ ${fileName}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[storium] ✗ ${fileName}: ${message}`)
      return {
        success: false,
        message: `Seed '${fileName}' failed: ${message}`,
        count,
      }
    }
  }

  return {
    success: true,
    message: `${count} seed(s) applied successfully.`,
    count,
  }
}
