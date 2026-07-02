import { defineConfig } from "@playwright/test";

// baseURL is env-driven so the same suite runs against the main stack, a
// worktree stack, or a bare host dev server without hardcoding a port. The
// host-networked compose e2e service sets it to http://localhost:${FRONTEND_PORT}
// (e.g. 5183 in a worktree), reaching the stack on its published host ports.
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:5173";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  // HTML report + traces both land in gitignored dirs (see root .gitignore).
  reporter: [["html", { outputFolder: "playwright-report", open: "never" }]],
  outputDir: "test-results",
  retries: process.env.CI ? 2 : 1,
  // Serial: several specs drive the shared roster's live sessions, and one
  // campaign allows only one active session — parallel files would contend and
  // overload the single dev stack.
  workers: 1,
  use: {
    baseURL,
    trace: "on-first-retry",
  },
});
