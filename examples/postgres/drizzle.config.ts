// Single config shared by both drizzle-kit (CLI migrations) and storium (runtime).
//
// drizzle-kit reads: dialect, dbCredentials, schema, out
// storium reads:     dialect, dbCredentials, seeds, assertions
//
// Using `satisfies ConnectConfig` gives you autocomplete and type checking
// while keeping the object compatible with both tools.

import type { ConnectConfig } from 'storium'

export default {
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
  schema: ['./entities/**/*.schema.ts'],
  out: './migrations',
  seeds: './seeds',
} satisfies ConnectConfig
