import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Base path:
//   GitHub Pages (repo at /data-manager/):  set VITE_BASE_PATH=/data-manager/
//   Custom domain or local dev:             leave unset (defaults to /)
const base = process.env.VITE_BASE_PATH ?? '/'

export default defineConfig({
  base,
  plugins: [react()],
  server: {
    port: 5173,
  },
  build: {
    assetsInlineLimit: 4096,
  },
})
