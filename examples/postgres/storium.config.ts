import { defineConfig } from 'storium'

export default defineConfig({
  dialect: 'postgresql',
  connection: { url: process.env.DATABASE_URL },
  schema: ['./entities/**/*.schema.ts'],
  migrations: { directory: './migrations' },
  seeds: { directory: './seeds' },
})
