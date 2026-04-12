import type { StoriumConfig } from 'storium'

export default {
  dialect: 'sqlite',
  dbCredentials: { url: './data.db' },
  schema: ['./entities/**/*.table.ts'],
  out: './migrations',
  seeds: './seeds',
} satisfies StoriumConfig
