/**
 * Storium v1 — Config Loader
 *
 * Loads the dialect from storium.config.ts for use by the top-level
 * `defineTable()` function when called without an explicit dialect.
 *
 * Looks for `storium.config.ts` (or `.js`) in the current working directory.
 * Override the path via the `STORIUM_CONFIG` environment variable.
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
 * Load the dialect string from the project's storium config file.
 * Throws a descriptive `ConfigError` if no config is found.
 */
export const loadDialectFromConfig = (): Dialect => {
  if (cachedDialect) return cachedDialect

  const configPath = process.env.STORIUM_CONFIG
    ?? resolve(process.cwd(), 'storium.config')

  try {
    const mod = require(configPath)
    const config = mod.default ?? mod

    if (!config?.dialect) {
      throw new ConfigError(
        'Config file found but `dialect` is not set. ' +
        'Add `dialect` to your storium.config.ts.'
      )
    }

    cachedDialect = config.dialect
    return cachedDialect!
  } catch (err) {
    if ((err as any)?.code === 'MODULE_NOT_FOUND') {
      throw new ConfigError(
        'defineTable() called without a dialect and no storium.config.ts found. ' +
        "Either pass a dialect — defineTable('postgresql')('users', {...}) — " +
        'or create storium.config.ts in your project root. ' +
        'You can also set the STORIUM_CONFIG env var to a custom path.'
      )
    }
    throw err
  }
}
