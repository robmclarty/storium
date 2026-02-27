/**
 * @module configLoader
 *
 * Loads config from drizzle.config.ts. Two entry points:
 *
 * - `loadDialectFromConfig()` — sync, for `defineTable()` at import time
 * - `loadConfig()` — async, for migrate/seed commands at runtime
 *
 * Looks for `drizzle.config.ts` (or `.js`) in the current working directory.
 * Override the path via the `DRIZZLE_CONFIG` environment variable.
 */

import { resolve } from 'node:path'
import type { Dialect, ConnectConfig } from './types'
import { ConfigError } from './errors'

// createRequire is used intentionally: loadDialectFromConfig() is called
// synchronously by defineTable(). Switching to async import() would cascade
// into making defineTable() async — a breaking API change.
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

/**
 * Load the dialect string from the project's drizzle config file.
 * Throws a descriptive `ConfigError` if no config is found.
 *
 * No module-level cache — Node's `require()` cache handles repeat loads,
 * and a process-global singleton would return the wrong dialect in
 * multi-dialect test suites or monorepos.
 */
export const loadDialectFromConfig = (): Dialect => {
  const configPath = process.env.DRIZZLE_CONFIG
    ?? resolve(process.cwd(), 'drizzle.config')

  try {
    const mod = require(configPath)
    const config = mod.default ?? mod

    if (!config?.dialect) {
      throw new ConfigError(
        'Config file found but `dialect` is not set. ' +
        'Add `dialect` to your drizzle.config.ts.'
      )
    }

    return config.dialect
  } catch (err) {
    if ((err as any)?.code === 'MODULE_NOT_FOUND') {
      throw new ConfigError(
        'defineTable() called without a dialect and no drizzle.config.ts found. ' +
        "Either pass a dialect — defineTable('postgresql')('users', {...}) — " +
        'or create drizzle.config.ts in your project root. ' +
        'You can also set the DRIZZLE_CONFIG env var to a custom path.'
      )
    }
    throw err
  }
}

// ------------------------------------------------ Async Config Loader --

/**
 * Resolve the config file path.
 * Priority: DRIZZLE_CONFIG env var → default `./drizzle.config.ts`.
 */
export const resolveConfigPath = (): string =>
  process.env.DRIZZLE_CONFIG ?? resolve(process.cwd(), 'drizzle.config.ts')

/**
 * Load the full config object from drizzle.config.ts (async).
 * Used by migrate commands and seed runner.
 *
 * @param configPath - Optional explicit path (defaults to resolveConfigPath())
 */
export const loadConfig = async (configPath?: string): Promise<ConnectConfig> => {
  const abs = resolve(process.cwd(), configPath ?? resolveConfigPath())

  try {
    const mod = await import(abs)
    const config = mod.default ?? mod

    if (!config?.dialect) {
      throw new ConfigError(
        'Config file found but `dialect` is not set. ' +
        'Add `dialect` to your drizzle.config.ts.'
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
