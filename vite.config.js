import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'polygon-clipping': path.resolve(
        __dirname,
        'node_modules/polygon-clipping/dist/polygon-clipping.esm.js',
      ),
    },
  },
  optimizeDeps: {
    include: ['polygon-clipping'],
  },
})
