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
  // Visual baselines are checked-in source fixtures, kept in one flat dir. The
  // {platform} suffix pins each PNG to the OS that rendered it — always the
  // pinned Linux e2e image in CI, so committed baselines match CI renders.
  snapshotPathTemplate: "{testDir}/__screenshots__/{arg}-{platform}{ext}",
  use: {
    baseURL,
    trace: "on-first-retry",
    // Fixed viewport so layout-driven screenshots are deterministic run-to-run.
    viewport: { width: 1280, height: 800 },
  },
  expect: {
    // Deterministic renders: freeze CSS/web animations and the text caret, and
    // scale by CSS pixels so DPR can't shift the raster. Per-screen diff budgets
    // are set at each toHaveScreenshot call; this is the conservative default.
    // Fonts come from the pinned e2e image — the visual specs block the Google
    // Fonts network load so text falls back to the image's bundled fonts.
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.02,
    },
  },
});
