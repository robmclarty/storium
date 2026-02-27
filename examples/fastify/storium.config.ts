import type { StoriumConfig } from 'storium'

export default {
  dialect: 'sqlite',
  dbCredentials: { url: './data.db' },
  schema: ['./entities/**/*.schema.ts'],
  out: './migrations',
  seeds: './seeds',
} satisfies StoriumConfig
