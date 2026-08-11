import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import wasm from 'vite-plugin-wasm'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: process.env.VITE_BASE_PATH || './',
  plugins: [react(), wasm(), tailwindcss()],
  cacheDir: process.env.VITE_CACHE_DIR || undefined,
  build: {
    outDir: process.env.VITE_OUT_DIR || 'dist',
  },
  server: {
    port: 5173,
    proxy: {
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
      },
    },
  },
})
