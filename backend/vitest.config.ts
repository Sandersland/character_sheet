import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";

import { TEST_WORKER_COUNT } from "./vitest.db.js";

export default defineConfig(({ mode }) => {
  // loadEnv merges backend/.env* into process.env for the test runner.
  // Real env vars (e.g. DATABASE_URL set by CI) take precedence over file values.
  // The empty prefix "" loads all keys, not just VITE_-prefixed ones.
  const env = loadEnv(mode, process.cwd(), "");
  // globalSetup runs in the vitest main process, which never receives `test.env`
  // — without this a host dev whose URL lives only in backend/.env gets no base
  // to derive the template and worker databases from.
  process.env.DATABASE_URL ??= env.DATABASE_URL;

  return {
    // Mirror the tsconfig `@/*` → `src/*` path alias so tests resolve the same
    // absolute imports as tsc (dev) and tsc-alias (prod build) do.
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    test: {
      env: { ...env, TEST_BASE_DATABASE_URL: process.env.DATABASE_URL ?? "" },
      // Each worker gets its own database, cloned from a migrated+seeded
      // template (#1269). Do not set fileParallelism:false here — files
      // intentionally run in parallel, and they are now isolated by
      // construction rather than by convention.
      globalSetup: ["./vitest.global-setup.ts"],
      // Pinned so the clone count above matches the ids workers actually claim,
      // and so N pools stay under Postgres' max_connections.
      maxWorkers: TEST_WORKER_COUNT,
      // Teardown drops every worker database, not the single default-10s task.
      teardownTimeout: 30_000,
      // Closes the per-file Prisma pool after each test file (see vitest.setup.ts).
      setupFiles: ["./vitest.setup.ts"],
      // Coverage feeds fallow's CRAP scoring (`npm run test:coverage` → the fallow
      // CI job's `--coverage`). Istanbul format is what fallow reads; the `json`
      // reporter emits coverage/coverage-final.json. `all: true` instruments every
      // production source file even when no test touches it, so an untested complex
      // function reports its real 0% coverage (→ honest high CRAP) instead of
      // fallow falling back to an inflated export-reference estimate.
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
