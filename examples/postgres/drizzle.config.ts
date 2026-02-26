import type { ConnectConfig } from 'storium'

// A single config object shared by drizzle-kit (migrations) and storium (runtime).
// drizzle-kit uses: dialect, dbCredentials, schema, out
// storium uses: dialect, dbCredentials, seeds, assertions

export default {
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
  schema: ['./entities/**/*.schema.ts'],
  out: './migrations',
  seeds: './seeds',
} satisfies ConnectConfig
