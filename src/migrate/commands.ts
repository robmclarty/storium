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
 * @example
 * import { generate, migrate, push, status } from 'storium/migrate'
 *
 * await generate(config)   // Diff → create migration SQL
 * await migrate(config)    // Apply pending migrations
 * await push(config)       // Push schema directly (dev only)
 * await status(config)     // Show pending migrations
 */

import path from 'path'
import type { StoriumConfig } from '../core/types'
import { ConfigError } from '../core/errors'

// --------------------------------------------------------------- Types --

type MigrationResult = {
  success: boolean
  message: string
}

// ------------------------------------------------------------ Helpers --

/**
 * Build the drizzle-kit config object from Storium config.
 */
const buildDrizzleKitConfig = (config: StoriumConfig) => {
  const url = config.connection?.url ?? config.url

  if (!url) {
    throw new ConfigError(
      'Database connection URL is required for migrations. ' +
      'Set `connection.url` or `url` in your config.'
    )
  }

  if (!config.schema) {
    throw new ConfigError(
      'Schema file path(s) are required for migrations. ' +
      'Set `schema` in your config (string or array of globs).'
    )
  }

  const dialectMap: Record<string, string> = {
    postgresql: 'postgresql',
    mysql: 'mysql',
    sqlite: 'sqlite',
  }

  return {
    dialect: dialectMap[config.dialect] ?? config.dialect,
    schema: config.schema,
    out: config.migrations?.directory ?? './migrations',
    dbCredentials: {
      url,
    },
  }
}

/**
 * Dynamically load drizzle-kit and execute a command.
 */
const runDrizzleKit = async (
  command: string,
  config: StoriumConfig
): Promise<MigrationResult> => {
  const drizzleConfig = buildDrizzleKitConfig(config)

  try {
    // drizzle-kit provides a programmatic API
    const drizzleKit = require('drizzle-kit')

    switch (command) {
      case 'generate':
        await drizzleKit.generate(drizzleConfig)
        return { success: true, message: 'Migration file generated successfully.' }

      case 'migrate':
        await drizzleKit.migrate(drizzleConfig)
        return { success: true, message: 'Migrations applied successfully.' }

      case 'push':
        await drizzleKit.push(drizzleConfig)
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
export const generate = async (config: StoriumConfig): Promise<MigrationResult> =>
  runDrizzleKit('generate', config)

/**
 * Apply all pending migrations to the database.
 *
 * Equivalent to `npx storium migrate` or `npx drizzle-kit migrate`.
 */
export const migrate = async (config: StoriumConfig): Promise<MigrationResult> =>
  runDrizzleKit('migrate', config)

/**
 * Push the current schema directly to the database without creating
 * migration files. Useful for development only — not for production.
 *
 * Equivalent to `npx storium push` or `npx drizzle-kit push`.
 */
export const push = async (config: StoriumConfig): Promise<MigrationResult> =>
  runDrizzleKit('push', config)

/**
 * Check for pending migrations. Returns info about migration state.
 *
 * Equivalent to `npx storium status`.
 */
export const status = async (config: StoriumConfig): Promise<MigrationResult> => {
  const drizzleConfig = buildDrizzleKitConfig(config)

  try {
    const drizzleKit = require('drizzle-kit')

    // drizzle-kit may expose a check/status API; fall back to a basic check
    if (typeof drizzleKit.check === 'function') {
      const result = await drizzleKit.check(drizzleConfig)
      return { success: true, message: result?.message ?? 'Migration status checked.' }
    }

    return {
      success: true,
      message: `Migrations directory: ${drizzleConfig.out}\nSchema: ${JSON.stringify(drizzleConfig.schema)}`,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, message: `Status check failed: ${message}` }
  }
}
