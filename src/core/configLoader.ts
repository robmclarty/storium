/**
 * Storium v1 — Config Loader
 *
 * Loads the dialect from drizzle.config.ts for use by the top-level
 * `defineTable()` function when called without an explicit dialect.
 *
 * Looks for `drizzle.config.ts` (or `.js`) in the current working directory.
 * Override the path via the `DRIZZLE_CONFIG` environment variable.
 *
 * The result is cached — the config file is loaded at most once per process.
 */

import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import type { Dialect } from './types'
import { ConfigError } from './errors'

const require = createRequire(import.meta.url)

let cachedDialect: Dialect | null = null

/**
 * Load the dialect string from the project's drizzle config file.
 * Throws a descriptive `ConfigError` if no config is found.
 */
export const loadDialectFromConfig = (): Dialect => {
  if (cachedDialect) return cachedDialect

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

    cachedDialect = config.dialect
    return cachedDialect!
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
