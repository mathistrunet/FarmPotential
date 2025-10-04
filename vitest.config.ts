import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{js,jsx,ts,tsx}', 'server/src/**/*.{test,spec}.ts'],
    setupFiles: [],
  },
});
