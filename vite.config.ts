import { defineConfig } from "vitest/config";
import preact from "@preact/preset-vite";

// `npm run dev:app` serves the app with hot reload and sends /api to the Worker that
// `npm run dev` runs on 8821, so the browser still talks to one origin.
export default defineConfig({
  plugins: [preact()],
  server: { port: 8823, strictPort: true, host: "127.0.0.1", proxy: { "^/api/": { target: "http://127.0.0.1:8821", changeOrigin: false } } },
  build: { target: "es2022", sourcemap: false },
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
});
