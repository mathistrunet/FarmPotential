import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const polygonClippingEntry = require.resolve(
  'polygon-clipping/dist/polygon-clipping.esm.js'
)
const sqlJsWasmEntry = require.resolve('sql.js/dist/sql-wasm.js')

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['polygon-clipping'],
  },
})
