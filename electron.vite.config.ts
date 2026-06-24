import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const shared = resolve(__dirname, 'shared')

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': shared, '@electron': resolve(__dirname, 'electron') } },
    build: {
      rollupOptions: { input: { index: resolve(__dirname, 'electron/main.ts') } }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': shared } },
    build: {
      rollupOptions: { input: { index: resolve(__dirname, 'electron/preload.ts') } }
    }
  },
  renderer: {
    root: 'src',
    plugins: [react()],
    resolve: {
      alias: { '@': resolve(__dirname, 'src'), '@shared': shared }
    },
    build: {
      rollupOptions: { input: { index: resolve(__dirname, 'src/index.html') } }
    }
  }
})
