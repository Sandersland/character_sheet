import { defineConfig } from "@playwright/test";

// baseURL is env-driven so the same suite runs against the main stack, a
// worktree stack, or a bare host dev server without hardcoding a port. Inside
// the compose e2e service it's set to the frontend service DNS (frontend:5173).
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:5173";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  // HTML report + traces both land in gitignored dirs (see root .gitignore).
  reporter: [["html", { outputFolder: "playwright-report", open: "never" }]],
  outputDir: "test-results",
  retries: process.env.CI ? 2 : 1,
  use: {
    baseURL,
    trace: "on-first-retry",
  },
});
