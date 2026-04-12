import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
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
        plugins: [react()],
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
