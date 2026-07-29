import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv } from "vite";

// Config-time settings can't read `import.meta.env` (that exists only in client
// code) and Vite never copies .env into process.env, so loadEnv is the bridge —
// empty prefix because none of these are VITE_-prefixed client vars, and a real
// environment variable still wins so CI stays authoritative over a stray .env.
// The mode is fixed because only a mode-agnostic `.env` exists; adding an
// `.env.<mode>` means switching to defineConfig's function form to see the real
// mode (#1458).
const env = {
  ...loadEnv("development", fileURLToPath(new URL(".", import.meta.url)), ""),
  ...process.env,
};

// The SPA serves `/api/*` from its own origin and forwards to the backend, so the
// browser sees a single origin. This makes the session cookie same-origin (no CORS)
// and lets Google OAuth redirect back to the SPA. Target is env-driven:
// the host backend's port, which differs per worktree slot.
// Shared by dev (`server`) and the built-asset preview used by e2e CI (`preview`).
const apiProxy = {
  "/api": {
    target: env.VITE_PROXY_TARGET ?? "http://localhost:4000",
    changeOrigin: true,
  },
};

// strictPort is the point, not the port. Vite's default is to silently take the
// next free one, so a second stack would answer on 5174 while every URL the
// tooling printed — and E2E_BASE_URL — still said 5183. Fail loudly instead;
// the dev containers used to give each slot its own network, and nothing does
// now (#1458).
const server = {
  host: true,
  port: Number(env.FRONTEND_PORT ?? 5173),
  strictPort: true,
  // The Playwright container reaches this server as host.docker.internal, and
  // Vite rejects an unrecognised Host header with 403 — which surfaces as a
  // blanket e2e failure rather than anything mentioning hostnames (#1458).
  allowedHosts: ["localhost", "host.docker.internal"],
  proxy: apiProxy,
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server,
  // `vite preview` serves the production build with the same proxy — e2e CI runs
  // against this (not the dev server) so on-demand compilation never slows renders.
  preview: server,
  build: {
    // #1279: Vite's default (500 kB) — every eager/route/tab chunk sits well
    // under it (largest is react-vendor at ~187 kB). `dice-vendor` (the
    // three.js 3D stack, ~1.1 MB) is deliberately async-only — the lazy dice
    // seams keep it out of the initial load — and is the one EXPECTED warning
    // this limit produces; Vite has no per-chunk override, so raising the
    // limit past it (as before, to 1400) would have silenced a real regression
    // too, which is exactly how the eager `index` chunk grew 680→722 kB
    // unnoticed. Keep the limit low and accept dice-vendor's one warning.
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        // Isolate the heavy 3D dice stack (three/@react-three/cannon-es/troika)
        // into its own vendor chunk. Combined with the React.lazy dice seams
        // (RollContext/ConcentrationSaveModal) this chunk is only fetched when a
        // roll animates — it stays out of the initial load. Kept to two vendor
        // chunks on purpose so the split doesn't fan into a waterfall.
        manualChunks(id) {
          // Vite's shared preload helper is pulled in by every React.lazy site;
          // pin it to the eager react-vendor chunk so Rollup can't park it in
          // dice-vendor and drag the 3D stack into the entry's static preload.
          if (id.includes("preload-helper")) return "react-vendor";
          if (!id.includes("node_modules")) return undefined;
          if (/[/\\](three|troika[^/\\]*|@react-three[/\\][^/\\]+|cannon-es)[/\\]/.test(id)) {
            return "dice-vendor";
          }
          // Pin React into its own eager chunk so Rollup can't fold it into
          // dice-vendor — otherwise the entry static-imports React from that
          // chunk and drags the whole 3D stack back into the initial preload.
          if (/[/\\](react|react-dom|scheduler|react-router|react-router-dom)[/\\]/.test(id)) {
            return "react-vendor";
          }
          return undefined;
        },
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
