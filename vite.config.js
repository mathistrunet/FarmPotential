import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const polygonClippingPath = require.resolve(
  'polygon-clipping/dist/polygon-clipping.esm.js',
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
