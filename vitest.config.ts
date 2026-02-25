import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    include: ['src/**/__tests__/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
    alias: {
      storium: path.resolve(__dirname, './src/index.ts'),
      'storium/*': path.resolve(__dirname, './src/*/index.ts'),
    },
  },
})
