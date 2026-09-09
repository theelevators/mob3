import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      mob3: path.resolve(__dirname, "packages/core/src/index.ts"),
      "@mob3/three": path.resolve(__dirname, "packages/three/src/index.ts"),
    },
  },
  test: {
    include: [
      "packages/*/src/**/*.test.ts",
      "packages/*/tests/**/*.test.ts",
      "tests/**/*.test.ts",
    ],
  },
});
