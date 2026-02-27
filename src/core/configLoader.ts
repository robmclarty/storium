/**
 * @module configLoader
 *
 * Loads config from the project's config file. Two entry points:
 *
 * - `loadDialectFromConfig()` — sync, for `defineTable()` at import time
 * - `loadConfig()` — async, for migrate/seed commands at runtime
 *
 * Config file resolution order:
 * 1. `STORIUM_CONFIG` env var (explicit path)
 * 2. `DRIZZLE_CONFIG` env var (legacy / drizzle-kit compat)
 * 3. `storium.config.ts` in cwd
 * 4. `drizzle.config.ts` in cwd (drizzle-kit compat)
 */

import { resolve } from 'node:path'
import { existsSync } from 'node:fs'
import type { Dialect, StoriumConfig } from './types'
import { ConfigError } from './errors'

// createRequire is used intentionally: loadDialectFromConfig() is called
// synchronously by defineTable(). Switching to async import() would cascade
// into making defineTable() async — a breaking API change.
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

// ---------------------------------------------------- Path Resolution --

/** Default config filenames, checked in order. */
const CONFIG_FILENAMES = ['storium.config', 'drizzle.config']

/** Extensions to check when probing for config files. */
const CONFIG_EXTENSIONS = ['.ts', '.js', '.mjs']

/**
 * Resolve the config file path.
 *
 * Priority:
 * 1. STORIUM_CONFIG env var
 * 2. DRIZZLE_CONFIG env var
 * 3. storium.config.{ts,js,mjs} in cwd
 * 4. drizzle.config.{ts,js,mjs} in cwd
 *
 * Returns an absolute path. Throws if no config file is found.
 */
export const resolveConfigPath = (): string => {
  // Env var overrides — explicit path, no probing
  const envPath = process.env.STORIUM_CONFIG ?? process.env.DRIZZLE_CONFIG
  if (envPath) return resolve(process.cwd(), envPath)

  // Probe for config files in order
  for (const name of CONFIG_FILENAMES) {
    for (const ext of CONFIG_EXTENSIONS) {
      const candidate = resolve(process.cwd(), `${name}${ext}`)
      if (existsSync(candidate)) return candidate
    }
  }

  // Default fallback (will fail at import time with a clear error)
  return resolve(process.cwd(), 'storium.config.ts')
}

// ----------------------------------------------- Sync Dialect Loader --

/**
 * Load the dialect string from the project's config file (sync).
 * Used by `defineTable()` when called without an explicit dialect.
 *
 * No module-level cache — Node's `require()` cache handles repeat loads,
 * and a process-global singleton would return the wrong dialect in
 * multi-dialect test suites or monorepos.
 */
export const loadDialectFromConfig = (): Dialect => {
  const configPath = resolveConfigPath()

  // Strip extension for require() — it probes .ts/.js/.mjs automatically
  const requirePath = configPath.replace(/\.(ts|js|mjs)$/, '')

  try {
    const mod = require(requirePath)
    const config = mod.default ?? mod

    if (!config?.dialect) {
      throw new ConfigError(
        'Config file found but `dialect` is not set. ' +
        'Add `dialect` to your config file.'
      )
    }

    return config.dialect
  } catch (err) {
    if (err instanceof ConfigError) throw err
    if ((err as any)?.code === 'MODULE_NOT_FOUND') {
      throw new ConfigError(
        'defineTable() called without a dialect and no config file found. ' +
        "Either pass a dialect — defineTable('postgresql')('users', {...}) — " +
        'or create storium.config.ts (or drizzle.config.ts) in your project root. ' +
        'You can also set the STORIUM_CONFIG env var to a custom path.'
      )
    }
    throw err
  }
}

// ------------------------------------------------ Async Config Loader --

/**
 * Load the full config object from the config file (async).
 * Used by migrate commands and seed runner.
 *
 * @param configPath - Optional explicit path (overrides auto-resolution)
 */
export const loadConfig = async (configPath?: string): Promise<StoriumConfig> => {
  const abs = configPath
    ? resolve(process.cwd(), configPath)
    : resolveConfigPath()

  try {
    const mod = await import(abs)
    const config = mod.default ?? mod

    if (!config?.dialect) {
      throw new ConfigError(
        'Config file found but `dialect` is not set. ' +
        'Add `dialect` to your config file.'
      )
    }

    return config
  } catch (err) {
    if (err instanceof ConfigError) throw err

    const msg = err instanceof Error ? err.message : String(err)
    const hint = abs.endsWith('.ts')
      ? '\nHint: Loading .ts config files requires tsx. Install it: npm install -D tsx'
      : ''
    throw new ConfigError(
      `Failed to load config from '${abs}': ${msg}${hint}`
    )
  }
}
