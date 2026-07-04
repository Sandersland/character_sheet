import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

// The SPA serves `/api/*` from its own origin and forwards to the backend, so the
// browser sees a single origin. This makes the session cookie same-origin (no CORS)
// and lets Google OAuth redirect back to the SPA. Target is env-driven:
// `http://backend:4000` inside Compose, `http://localhost:4000` for a bare host run.
// Shared by dev (`server`) and the built-asset preview used by e2e CI (`preview`).
const apiProxy = {
  "/api": {
    target: process.env.VITE_PROXY_TARGET ?? "http://localhost:4000",
    changeOrigin: true,
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    host: true,
    proxy: apiProxy,
  },
  // `vite preview` serves the production build with the same proxy — e2e CI runs
  // against this (not the dev server) so on-demand compilation never slows renders.
  preview: {
    host: true,
    proxy: apiProxy,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: false,
    // e2e/ is Playwright's turf — keep it out of the vitest (jsdom) run.
    exclude: ["**/node_modules/**", "**/dist/**", "e2e/**"],
  },
});
