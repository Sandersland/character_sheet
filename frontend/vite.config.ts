import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    host: true,
    // Dev-only server: accept any Host so compose-DNS access (frontend:5173 from
    // the e2e runner, in main and worktree stacks alike) isn't 403'd by Vite's
    // host check.
    allowedHosts: true,
    // Dev proxy: the SPA serves `/api/*` from its own origin and forwards to the
    // backend, so the browser sees a single origin (:5173). This makes the
    // session cookie same-origin (no CORS in dev) and lets Google OAuth redirect
    // back to the SPA. Target is env-driven: `http://backend:4000` inside Compose,
    // `http://localhost:4000` for a bare `npm run dev`.
    proxy: {
      "/api": {
        target: process.env.VITE_PROXY_TARGET ?? "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: false,
    // e2e/ is Playwright's turf — keep it out of the vitest (jsdom) run.
    exclude: ["**/node_modules/**", "**/dist/**", "e2e/**"],
  },
});
