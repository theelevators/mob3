import { defineConfig } from "vite";
import path from "node:path";

const nodeStub = path.resolve(__dirname, "stubs/node-empty.js");

export default defineConfig({
  resolve: {
    alias: {
      mob3: path.resolve(__dirname, "../../packages/core/src/index.ts"),
      "@mob3/three": path.resolve(
        __dirname,
        "../../packages/three/src/index.ts",
      ),
      // App pulls ParallelExecutor → node builtins; stub for browser demos.
      "node:module": nodeStub,
      "node:url": nodeStub,
      "node:os": nodeStub,
      "node:worker_threads": nodeStub,
      "node:fs/promises": nodeStub,
    },
  },
  server: {
    port: 5179,
    host: true,
  },
});
