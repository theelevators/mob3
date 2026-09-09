import { defineConfig } from "vite";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      mob3: path.resolve(__dirname, "../../packages/core/src/index.ts"),
    },
  },
  server: { port: 5177 },
  worker: {
    format: "es",
  },
});
