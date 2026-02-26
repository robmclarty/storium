/**
 * Storium v1 — Migration Commands
 *
 * Programmatic wrappers around drizzle-kit for schema diffing and migration.
 * These are used by the CLI and can be called directly for programmatic
 * migration workflows.
 *
 * Storium wraps drizzle-kit rather than reimplementing migration logic.
 * The bridge: defineStore/defineTable produce real Drizzle table objects
 * that drizzle-kit can diff against the current database state.
 *
 * The config object passed to these functions IS a drizzle-kit config —
 * storium-specific keys (assertions, pool, seeds) are simply ignored by
 * drizzle-kit.
 *
 * @example
 * import { generate, migrate, push, status } from 'storium/migrate'
 * import config from './drizzle.config'
 *
 * await generate(config)   // Diff → create migration SQL
 * await migrate(config)    // Apply pending migrations
 * await push(config)       // Push schema directly (dev only)
 * await status(config)     // Show pending migrations
 */

import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

// --------------------------------------------------------------- Types --

type MigrationResult = {
  success: boolean
  message: string
}

// ------------------------------------------------------------ Helpers --

/**
 * Dynamically load drizzle-kit and execute a command.
 * The config is passed straight through — it IS drizzle-kit format.
 */
const runDrizzleKit = async (
  command: string,
  config: any
): Promise<MigrationResult> => {
  try {
    const drizzleKit = require('drizzle-kit')

    switch (command) {
      case 'generate':
        await drizzleKit.generate(config)
        return { success: true, message: 'Migration file generated successfully.' }

      case 'migrate':
        await drizzleKit.migrate(config)
        return { success: true, message: 'Migrations applied successfully.' }

      case 'push':
        await drizzleKit.push(config)
        return { success: true, message: 'Schema pushed to database successfully.' }

      default:
        return { success: false, message: `Unknown command: ${command}` }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, message: `Migration ${command} failed: ${message}` }
  }
}

// --------------------------------------------------------- Public API --

/**
 * Generate a new migration file by diffing current schemas against the
 * last migration state.
 *
 * Equivalent to `npx storium generate` or `npx drizzle-kit generate`.
 */
export const generate = async (config: any): Promise<MigrationResult> =>
  runDrizzleKit('generate', config)

/**
 * Apply all pending migrations to the database.
 *
 * Equivalent to `npx storium migrate` or `npx drizzle-kit migrate`.
 */
export const migrate = async (config: any): Promise<MigrationResult> =>
  runDrizzleKit('migrate', config)

/**
 * Push the current schema directly to the database without creating
 * migration files. Useful for development only — not for production.
 *
 * Equivalent to `npx storium push` or `npx drizzle-kit push`.
 */
export const push = async (config: any): Promise<MigrationResult> =>
  runDrizzleKit('push', config)

/**
 * Check for pending migrations. Returns info about migration state.
 *
 * Equivalent to `npx storium status`.
 */
export const status = async (config: any): Promise<MigrationResult> => {
  try {
    const drizzleKit = require('drizzle-kit')

    if (typeof drizzleKit.check === 'function') {
      const result = await drizzleKit.check(config)
      return { success: true, message: result?.message ?? 'Migration status checked.' }
    }

    return {
      success: true,
      message: `Migrations directory: ${config.out ?? './migrations'}\nSchema: ${JSON.stringify(config.schema)}`,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, message: `Status check failed: ${message}` }
  }
}
