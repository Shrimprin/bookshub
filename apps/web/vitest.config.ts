import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    globals: true,
    mockReset: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          include: [
            'features/**/__tests__/**/*.test.tsx',
            'components/**/__tests__/**/*.test.tsx',
            'app/**/__tests__/**/*.test.tsx',
          ],
          setupFiles: ['./vitest.setup.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['app/**/__tests__/**/*.test.ts', 'lib/**/__tests__/**/*.test.ts'],
        },
      },
    ],
  },
})
