/**
 * @module configLoader
 *
 * Loads the dialect from drizzle.config.ts for use by the top-level
 * `defineTable()` function when called without an explicit dialect.
 *
 * Looks for `drizzle.config.ts` (or `.js`) in the current working directory.
 * Override the path via the `DRIZZLE_CONFIG` environment variable.
 *
 * The result is cached — the config file is loaded at most once per process.
 */

import { resolve } from 'node:path'
import type { Dialect } from './types'
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
