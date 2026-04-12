/**
 * Single config shared by both drizzle-kit (CLI migrations) and storium (runtime).
 *
 * drizzle-kit reads: dialect, dbCredentials, schema, out
 * storium reads:     dialect, dbCredentials, stores, seeds
 */

import type { StoriumConfig } from 'storium'

export default {
  dialect: 'sqlite',
  dbCredentials: { url: './data.db' },
  schema: ['./entities/**/*.table.ts'],
  stores: ['./entities/**/*.store.ts'],
  out: './migrations',
  seeds: './seeds',
} satisfies StoriumConfig
