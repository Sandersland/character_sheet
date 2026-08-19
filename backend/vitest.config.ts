import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";

import { TEST_WORKER_COUNT } from "./vitest.db.js";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  process.env.DATABASE_URL ??= env.DATABASE_URL;

  return {
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
        "@character-sheet/contracts": fileURLToPath(
          new URL("../packages/contracts/src/index.ts", import.meta.url),
        ),
      },
    },
    test: {
      env: { ...env, TEST_BASE_DATABASE_URL: process.env.DATABASE_URL ?? "" },

      globalSetup: ["./vitest.global-setup.ts"],
      maxWorkers: TEST_WORKER_COUNT,
      teardownTimeout: 30_000,
      setupFiles: ["./vitest.setup.ts"],
      coverage: {
        provider: "istanbul",
        reporter: ["text-summary", "json"],
        reportsDirectory: "./coverage",
        all: true,
        include: ["src/**/*.ts"],
        exclude: [
          "src/**/__tests__/**",
          "src/**/*.test.ts",
          "src/generated/**",
          "src/index.ts",
        ],
      },
    },
  };
});
