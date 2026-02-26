/**
 * Storium v1 — Configuration
 *
 * Provides `defineConfig()` for storium.config.ts files. This config is the
 * single source of truth consumed by both `connect()` (runtime) and the CLI
 * (migrations, seeds).
 *
 * @example
 * // storium.config.ts
 * import { defineConfig } from 'storium'
 *
 * export default defineConfig({
 *   dialect: 'postgresql',
 *   connection: { url: process.env.DATABASE_URL },
 *   schema: [
 *     './src/entities/*.schema.ts',
 *     './src/collections/*.schema.ts',
 *   ],
 *   migrations: { directory: './migrations' },
 *   seeds: { directory: './seeds' },
 * })
 */

import type { StoriumConfig } from './core/types'

/**
 * Define a Storium configuration. Provides type-checking and autocompletion
 * for storium.config.ts files. This is an identity function — it returns
 * the config as-is, but with full TypeScript support.
 *
 * @param config - The full Storium configuration
 * @returns The same config, typed
 */
export const defineConfig = (config: StoriumConfig): StoriumConfig => config
