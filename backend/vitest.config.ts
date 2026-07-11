import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";

export default defineConfig(({ mode }) => ({
  // Mirror the tsconfig `@/*` → `src/*` path alias so tests resolve the same
  // absolute imports as tsc (dev) and tsc-alias (prod build) do.
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    // loadEnv merges backend/.env* into process.env for the test runner.
    // Real env vars (e.g. DATABASE_URL set by CI) take precedence over file values.
    // The empty prefix "" loads all keys, not just VITE_-prefixed ones.
    env: loadEnv(mode, process.cwd(), ""),
    // Closes the per-file Prisma pool after each test file (see vitest.setup.ts).
    // NOTE: do not set fileParallelism:false here — test files intentionally run
    // in parallel; isolation is by convention (docs/testing.md), not by
    // serializing the suite.
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
}));
