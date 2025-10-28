import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'polygon-clipping': 'polygon-clipping/dist/polygon-clipping.esm.js',
    },
  },
  optimizeDeps: {
    include: ['polygon-clipping/dist/polygon-clipping.esm.js'],
  },
})
