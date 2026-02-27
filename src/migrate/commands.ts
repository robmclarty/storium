/**
 * @module commands
 *
 * Programmatic wrappers around drizzle-kit for schema diffing and migration.
 * These are used by the CLI and can be called directly for programmatic
 * migration workflows.
 *
 * All functions auto-load config from `drizzle.config.ts` by default.
 * Pass an optional config object to override.
 *
 * - `generate` and `push` shell out to the drizzle-kit CLI (handles snapshot
 *   management, journal tracking, and file naming automatically).
 * - `migrate` uses drizzle-orm's built-in per-dialect migrators with a live
 *   database connection.
 * - `status` reads the filesystem directly.
 *
 * @example
 * import { generate, migrate, push, status } from 'storium/migrate'
 *
 * await generate()          // auto-loads drizzle.config.ts
 * await migrate(db)         // auto-loads config, uses live connection
 * await push()              // auto-loads config
 * await status()            // auto-loads config
 */

import { spawn } from 'node:child_process'
import { resolve as resolvePath } from 'node:path'
import { existsSync, readdirSync } from 'node:fs'
import { glob } from 'glob'
import type { StoriumConfig, StoriumInstance } from '../core/types'
import { loadConfig, resolveConfigPath } from '../core/configLoader'

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

// --------------------------------------------------------- Public API --

/**
 * Generate a new migration file by diffing current schemas against the
 * last migration state. Shells out to drizzle-kit CLI.
 *
 * Uses the config file path from resolveConfigPath() (auto-detected or
 * set via STORIUM_CONFIG env var).
 *
 * @example
 * await generate()
 */
export const generate = async (): Promise<MigrationResult> => {
  const cfgPath = resolveConfigPath()
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
 * @param db - A StoriumInstance (from connect())
 * @param config - Optional config override (default: auto-loads drizzle.config.ts)
 *
 * @example
 * await migrate(db)                   // auto-loads config
 * await migrate(db, customConfig)     // explicit config
 */
export const migrate = async (db: StoriumInstance, config?: StoriumConfig): Promise<MigrationResult> => {
  const cfg = config ?? await loadConfig()
  const drizzle = db.drizzle
  const migrationsFolder = resolvePath(process.cwd(), cfg.out ?? './migrations')

  try {
    switch (cfg.dialect) {
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
        return { success: false, message: `Unknown dialect: ${cfg.dialect}` }
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
 * Uses the config file path from resolveConfigPath() (auto-detected or
 * set via STORIUM_CONFIG env var).
 */
export const push = async (): Promise<MigrationResult> => {
  const cfgPath = resolveConfigPath()
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
 *
 * @param config - Optional config override (default: auto-loads drizzle.config.ts)
 */
export const status = async (config?: StoriumConfig): Promise<MigrationResult> => {
  const cfg = config ?? await loadConfig()

  try {
    const out = cfg.out ?? './migrations'
    const schemaGlobs = cfg.schema
      ? Array.isArray(cfg.schema) ? cfg.schema : [cfg.schema]
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
      `Dialect: ${cfg.dialect ?? 'unknown'}`,
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
