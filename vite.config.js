import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const polygonClippingPath = resolve(
  __dirname,
  'node_modules/polygon-clipping/dist/polygon-clipping.esm.js',
)

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'polygon-clipping': polygonClippingPath,
    },
  },
  optimizeDeps: {
    include: ['polygon-clipping'],
  },
})
