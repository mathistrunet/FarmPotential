import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const _require = createRequire(import.meta.url);
// Resolve polygon-clipping ESM via Node module resolution (works in worktrees where
// node_modules is hoisted to the repo root, not the worktree subdirectory).
const polygonClippingEsm = _require.resolve(
  "polygon-clipping/dist/polygon-clipping.esm.js",
);

// https://vite.dev/config/
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:4174",
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      "polygon-clipping": polygonClippingEsm,
    },
  },
  optimizeDeps: {
    include: ["polygon-clipping"],
  },
  test: {
    resolve: {
      alias: {
        "polygon-clipping": polygonClippingEsm,
      },
    },
  },
});
