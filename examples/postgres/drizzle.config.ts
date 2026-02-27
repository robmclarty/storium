/**
 * Single config shared by both drizzle-kit (CLI migrations) and storium (runtime).
 *
 * drizzle-kit reads: dialect, dbCredentials, schema, out
 * storium reads:     dialect, dbCredentials, stores, seeds
 *
 * Using `satisfies StoriumConfig` gives you autocomplete and type checking
 * while keeping the object compatible with both tools.
 */

import type { StoriumConfig } from 'storium'

export default {
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
  schema: ['./entities/**/*.schema.ts'],
  stores: ['./entities/**/*.store.ts'],
  out: './migrations',
  seeds: './seeds',
} satisfies StoriumConfig
