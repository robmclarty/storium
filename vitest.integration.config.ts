import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    include: ['test/integration/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
    testTimeout: 60_000, // containers can take time to start
    alias: {
      storium: path.resolve(__dirname, './src/index.ts'),
      'storium/*': path.resolve(__dirname, './src/*/index.ts'),
    },
  },
})
