import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    migrate: 'src/migrate/index.ts',
    'bin/storium': 'bin/storium.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  splitting: true,
  clean: true,
  outDir: 'dist',
  external: [
    // Database drivers — peer deps, never bundled
    'pg',
    'mysql2',
    'mysql2/promise',
    'better-sqlite3',
    // Drizzle — dependencies but externalized for tree-shaking
    'drizzle-orm',
    'drizzle-orm/pg-core',
    'drizzle-orm/mysql-core',
    'drizzle-orm/sqlite-core',
    'drizzle-orm/node-postgres',
    'drizzle-orm/mysql2',
    'drizzle-orm/better-sqlite3',
    'drizzle-kit',
    // Zod
    'zod',
    // Node built-ins
    'path',
    'glob',
  ],
  treeshake: true,
})
