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
  build: {
    // The only remaining >500 kB chunk is `dice-vendor` (the three.js 3D stack),
    // and it is deliberately async-only — the lazy dice seams keep it out of the
    // initial load, so its size never gates first paint. Raised past that chunk
    // so the warning stays meaningful for the initial bundle we do care about.
    chunkSizeWarningLimit: 1400,
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
