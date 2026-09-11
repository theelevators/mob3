import { defineConfig } from "vite";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@mob3/core": path.resolve(__dirname, "../../packages/core/src/index.ts"),
      "@mob3/three": path.resolve(__dirname, "../../packages/three/src/index.ts"),
    },
  },
});
