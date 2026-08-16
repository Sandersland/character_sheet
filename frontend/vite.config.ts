import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv } from "vite";

const env = {
  ...loadEnv("development", fileURLToPath(new URL(".", import.meta.url)), ""),
  ...process.env,
};

const apiProxy = {
  "/api": {
    target: env.VITE_PROXY_TARGET ?? "http://localhost:4000",
    changeOrigin: true,
    xfwd: true,
  },
};

const server = {
  host: true,
  port: Number(env.FRONTEND_PORT ?? 5173),
  strictPort: true,
  allowedHosts: ["localhost", "host.docker.internal"],
  proxy: apiProxy,
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server,
  preview: server,
  build: {
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("preload-helper")) return "react-vendor";
          if (!id.includes("node_modules")) return undefined;
          if (/[/\\](three|troika[^/\\]*|@react-three[/\\][^/\\]+|cannon-es)[/\\]/.test(id)) {
            return "dice-vendor";
          }
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
    exclude: ["**/node_modules/**", "**/dist/**", "e2e/**"],
  },
});
