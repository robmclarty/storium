/**
 * Storium v1 — Seed Runner
 *
 * Provides `defineSeed()` for authoring seed files and a runner that
 * executes them in alphabetical order. Seeds receive a context with
 * the database instance so they can use repositories directly.
 *
 * @example
 * // seeds/001_users.ts
 * import { defineSeed } from 'storium/migrate'
 *
 * export default defineSeed(async ({ drizzle }) => {
 *   // Use raw Drizzle or import your stores
 *   await drizzle.execute(sql`INSERT INTO users (name, email) VALUES ('Admin', 'admin@example.com')`)
 * })
 */

import path from 'node:path'
import { glob } from 'glob'
import { ConfigError } from '../core/errors'

// --------------------------------------------------------------- Types --

/** Context passed to each seed function. */
export type SeedContext = {
  /** The raw Drizzle database instance. */
  drizzle: any
}

/** A seed function receives the seed context. */
export type SeedFn = (ctx: SeedContext) => Promise<void>

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
 * export default defineSeed(async ({ drizzle }) => {
 *   // seed logic here
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

/**
 * Run all seed files in a directory.
 * Seeds are executed in alphabetical filename order.
 *
 * @param seedsDir - Path to the seeds directory
 * @param db - The Drizzle database instance
 * @returns Summary of seeds run
 */
export const runSeeds = async (
  seedsDir: string,
  db: any
): Promise<{ success: boolean; message: string; count: number }> => {
  if (!seedsDir) {
    throw new ConfigError(
      'Seeds directory is required. Pass a seeds directory path, or set `seeds` in your drizzle.config.ts.'
    )
  }

  const pattern = path.join(seedsDir, '**/*.{ts,js,mjs}')
  const files = await glob(pattern, { cwd: process.cwd(), absolute: true })

  // Sort alphabetically so naming convention (001_, 002_) controls order
  const sorted = files.toSorted((a, b) => path.basename(a).localeCompare(path.basename(b)))

  if (sorted.length === 0) {
    return { success: true, message: 'No seed files found.', count: 0 }
  }

  const ctx: SeedContext = { drizzle: db }
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
