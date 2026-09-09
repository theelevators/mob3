import { defineConfig } from "vite";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      mob3: path.resolve(__dirname, "../../packages/core/src/index.ts"),
      "@mob3/input": path.resolve(__dirname, "../../packages/input/src/index.ts"),
      "@mob3/rapier": path.resolve(__dirname, "../../packages/rapier/src/index.ts"),
    },
  },
  server: { port: 5175, host: true },
  optimizeDeps: {
    exclude: ["@dimforge/rapier3d-compat"],
  },
});
