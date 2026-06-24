import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@shared': resolve(__dirname, 'shared'),
      '@electron': resolve(__dirname, 'electron')
    }
  },
  test: {
    globals: true,
    environment: 'node',
    environmentMatchGlobs: [['src/**', 'jsdom']],
    coverage: { provider: 'v8', reportsDirectory: './coverage' }
  }
})
