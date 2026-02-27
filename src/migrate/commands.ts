/**
 * @module commands
 *
 * Programmatic wrappers around drizzle-kit for schema diffing and migration.
 * These are used by the CLI and can be called directly for programmatic
 * migration workflows.
 *
 * - `generate` and `push` shell out to the drizzle-kit CLI (handles snapshot
 *   management, journal tracking, and file naming automatically).
 * - `migrate` uses drizzle-orm's built-in per-dialect migrators with a live
 *   database connection.
 * - `status` reads the filesystem directly.
 *
 * @example
 * import { generate, migrate, push, status } from 'storium/migrate'
 * import config from './drizzle.config'
 *
 * await generate()                // Diff → create migration SQL (reads drizzle.config.ts)
 * await migrate(config, db)       // Apply pending migrations via live connection
 * await push()                    // Push schema directly (dev only)
 * await status(config)            // Show pending migrations
 */

import { spawn } from 'node:child_process'
import { resolve as resolvePath } from 'node:path'
import { existsSync, readdirSync } from 'node:fs'
import { glob } from 'glob'
import type { ConnectConfig } from '../core/types'

// --------------------------------------------------------------- Types --

type MigrationResult = {
  success: boolean
  message: string
}

// ------------------------------------------------------------ Helpers --

/**
 * Async wrapper around child_process.spawn.
 * Passes args as an array (no shell interpolation — no injection risk),
 * captures stdout/stderr, and rejects on non-zero exit.
 */
const run = (cmd: string, args: string[]): Promise<{ stdout: string; stderr: string }> =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d: Buffer) => { stdout += d })
    child.stderr.on('data', (d: Buffer) => { stderr += d })
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr })
      else reject(Object.assign(new Error(`Exit code ${code}`), { stdout, stderr }))
    })
  })

/**
 * Resolve the drizzle config file path.
 * Priority: explicit argument → DRIZZLE_CONFIG env var → default.
 */
const resolveConfigPath = (configPath?: string): string =>
  configPath ?? process.env.DRIZZLE_CONFIG ?? './drizzle.config.ts'

// --------------------------------------------------------- Public API --

/**
 * Generate a new migration file by diffing current schemas against the
 * last migration state. Shells out to drizzle-kit CLI.
 *
 * @param configPath - Path to config file (default: drizzle.config.ts)
 *
 * @example
 * await generate()                          // uses default config
 * await generate('./custom.config.ts')      // explicit path
 */
export const generate = async (configPath?: string): Promise<MigrationResult> => {
  const cfgPath = resolveConfigPath(configPath)
  try {
    const { stdout } = await run('npx', ['drizzle-kit', 'generate', `--config=${cfgPath}`])
    return { success: true, message: stdout.trim() || 'Migration file generated successfully.' }
  } catch (err: any) {
    const detail = err.stderr?.trim() || err.message || String(err)
    return { success: false, message: `Migration generate failed: ${detail}` }
  }
}

/**
 * Apply all pending migrations to the database using drizzle-orm's
 * built-in migrator for the configured dialect.
 *
 * @param config - Storium/drizzle config (for dialect + migrations folder)
 * @param db - A StoriumInstance or raw Drizzle instance
 *
 * @example
 * const db = storium.connect(config)
 * await migrate(config, db)
 */
export const migrate = async (config: ConnectConfig, db: any): Promise<MigrationResult> => {
  const drizzle = db?.drizzle ?? db
  const migrationsFolder = resolvePath(process.cwd(), config.out ?? './migrations')

  try {
    switch (config.dialect) {
      case 'postgresql': {
        const { migrate: pgMigrate } = await import('drizzle-orm/node-postgres/migrator')
        await pgMigrate(drizzle, { migrationsFolder })
        break
      }
      case 'mysql': {
        const { migrate: mysqlMigrate } = await import('drizzle-orm/mysql2/migrator')
        await mysqlMigrate(drizzle, { migrationsFolder })
        break
      }
      case 'sqlite':
      case 'memory': {
        const { migrate: sqliteMigrate } = await import('drizzle-orm/better-sqlite3/migrator')
        sqliteMigrate(drizzle, { migrationsFolder })
        break
      }
      default:
        return { success: false, message: `Unknown dialect: ${config.dialect}` }
    }
    return { success: true, message: 'Migrations applied successfully.' }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, message: `Migration failed: ${message}` }
  }
}

/**
 * Push the current schema directly to the database without creating
 * migration files. Useful for development only — not for production.
 * Shells out to drizzle-kit CLI.
 *
 * @param configPath - Path to config file (default: drizzle.config.ts)
 */
export const push = async (configPath?: string): Promise<MigrationResult> => {
  const cfgPath = resolveConfigPath(configPath)
  try {
    const { stdout } = await run('npx', ['drizzle-kit', 'push', `--config=${cfgPath}`])
    return { success: true, message: stdout.trim() || 'Schema pushed to database successfully.' }
  } catch (err: any) {
    const detail = err.stderr?.trim() || err.message || String(err)
    return { success: false, message: `Push failed: ${detail}` }
  }
}

/**
 * Show migration status: lists migration files found in the output directory
 * and schema files matched by the config globs.
 */
export const status = async (config: ConnectConfig): Promise<MigrationResult> => {
  try {
    const out = config.out ?? './migrations'
    const schemaGlobs = config.schema
      ? Array.isArray(config.schema) ? config.schema : [config.schema]
      : []

    // List migration SQL files
    const migrationsDir = resolvePath(process.cwd(), out)
    let migrationFiles: string[] = []
    if (existsSync(migrationsDir)) {
      migrationFiles = readdirSync(migrationsDir)
        .filter((f: string) => f.endsWith('.sql'))
        .toSorted()
    }

    // List matched schema files
    let schemaFiles: string[] = []
    for (const pattern of schemaGlobs) {
      const matches = await glob(pattern, { cwd: process.cwd(), absolute: false })
      schemaFiles.push(...matches)
    }
    schemaFiles = [...new Set(schemaFiles)].toSorted()

    const lines = [
      `Dialect: ${config.dialect ?? 'unknown'}`,
      `Migrations directory: ${out}`,
      `Migration files: ${migrationFiles.length === 0 ? '(none)' : ''}`,
      ...migrationFiles.map(f => `  ${f}`),
      `Schema files: ${schemaFiles.length === 0 ? '(none)' : ''}`,
      ...schemaFiles.map(f => `  ${f}`),
    ]

    return { success: true, message: lines.join('\n') }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, message: `Status check failed: ${message}` }
  }
}
