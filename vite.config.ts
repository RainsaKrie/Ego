import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const host = process.env.TAURI_DEV_HOST
const buildTarget =
  process.env.TAURI_ENV_PLATFORM === 'macos' ||
  process.env.TAURI_ENV_PLATFORM === 'ios'
    ? 'safari13'
    : 'chrome105'

export default defineConfig({
  clearScreen: false,
  plugins: [react()],
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  server: {
    port: 5173,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  build: {
    target: buildTarget,
    minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
})
