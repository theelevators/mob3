import { defineConfig } from "vite";
import path from "node:path";

const nodeStub = path.resolve(__dirname, "stubs/node-empty.js");

export default defineConfig({
  resolve: {
    alias: {
      "@mob3/core": path.resolve(__dirname, "../../packages/core/src/index.ts"),
      "@mob3/assets": path.resolve(__dirname, "../../packages/assets/src/index.ts"),
      "@mob3/three": path.resolve(__dirname, "../../packages/three/src/index.ts"),
      "node:module": nodeStub,
      "node:url": nodeStub,
      "node:os": nodeStub,
      "node:worker_threads": nodeStub,
      "node:fs/promises": nodeStub,
    },
  },
  server: { port: 5183, host: true },
});
