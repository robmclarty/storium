import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    include: ['test/integration/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
    testTimeout: 60_000,  // containers can take time to start
    hookTimeout: 60_000,  // beforeAll needs time for container startup
    alias: {
      'storium/migrate': path.resolve(__dirname, './src/migrate/index.ts'),
      storium: path.resolve(__dirname, './src/index.ts'),
    },
  },
})
