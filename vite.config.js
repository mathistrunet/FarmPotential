import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "polygon-clipping": path.resolve(
        __dirname,
        "node_modules/polygon-clipping/dist/polygon-clipping.esm.js",
      ),
    },
  },
  optimizeDeps: {
    include: ["polygon-clipping"],
  },
});
