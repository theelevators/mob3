import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      mob3: path.resolve(__dirname, "../../packages/core/src/browser.ts"),
      "@mob3/three": path.resolve(__dirname, "../../packages/three/src/index.ts"),
      "@mob3/react": path.resolve(__dirname, "../../packages/react/src/index.ts"),
    },
  },
  server: { port: 5184, host: true },
});
