import path from "node:path";

// Side-effect import: patches Express so async route throws propagate to the
// terminal error handler instead of hanging the request. Must come before the
// routers are constructed.
import "express-async-errors";
import cors from "cors";
import type { CorsOptions } from "cors";
import express from "express";

import { errorHandler } from "./lib/error-handler.js";
import { httpLogger } from "./lib/logger.js";
import { creationRateLimiter, globalRateLimiter, securityHeaders } from "./lib/security.js";
import { actionsRouter } from "./routes/actions.js";
import { activityRouter } from "./routes/activity.js";
import { advancementRouter } from "./routes/advancement.js";
import { classRouter } from "./routes/class.js";
import { charactersRouter } from "./routes/characters.js";
import { conditionsRouter } from "./routes/conditions.js";
import { sessionsRouter } from "./routes/sessions.js";
import { experienceRouter } from "./routes/experience.js";
import { featsRouter } from "./routes/feats.js";
import { healthRouter } from "./routes/health.js";
import { hitPointsRouter } from "./routes/hitpoints.js";
import { inventoryRouter } from "./routes/inventory.js";
import { itemsRouter } from "./routes/items.js";
import { journalRouter } from "./routes/journal.js";
import { maneuversRouter } from "./routes/maneuvers.js";
import { referenceRouter } from "./routes/reference.js";
import { resourcesRouter } from "./routes/resources.js";
import { spellsRouter } from "./routes/spells.js";
import { spellcastingRouter } from "./routes/spellcasting.js";

// CORS origins are env-driven so the API can be deployed anywhere without a
// code change. `CORS_ORIGIN` is a comma-separated allowlist
// (e.g. "https://dev.example.com,https://example.com"). When unset, `cors({})`
// allows every origin via a `*` wildcard — convenient for local dev and for
// single-origin deployments where the SPA is served from this same host (no
// CORS at all).
function corsOptions(): CorsOptions {
  const configured = process.env.CORS_ORIGIN?.trim();
  if (!configured) return {};
  const allowlist = configured
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return { origin: allowlist };
}

export function createApp() {
  const app = express();

  // Single-origin mode is decided up front so the CSP can be tuned for the SPA.
  const staticDir = process.env.SERVE_STATIC_DIR?.trim();

  // Security headers first, then CORS, body parsing, request logging, and a
  // coarse global rate limit — all before any router runs.
  app.use(securityHeaders(Boolean(staticDir)));
  app.use(cors(corsOptions()));
  app.use(express.json());
  app.use(httpLogger);
  app.use(globalRateLimiter);
  app.use(creationRateLimiter);

  app.use("/api", healthRouter);
  app.use("/api", charactersRouter);
  app.use("/api", referenceRouter);
  app.use("/api", itemsRouter);
  app.use("/api", hitPointsRouter);
  app.use("/api", inventoryRouter);
  app.use("/api", experienceRouter);
  app.use("/api", activityRouter);
  app.use("/api", spellsRouter);
  app.use("/api", spellcastingRouter);
  app.use("/api", resourcesRouter);
  app.use("/api", conditionsRouter);
  app.use("/api", classRouter);
  app.use("/api", maneuversRouter);
  app.use("/api", featsRouter);
  app.use("/api", advancementRouter);
  app.use("/api", sessionsRouter);
  app.use("/api", actionsRouter);
  app.use("/api", journalRouter);

  // Optional single-origin mode: when SERVE_STATIC_DIR points at a built SPA,
  // serve it from this same server so the frontend and API share one origin
  // (one hostname, one Cloudflare Access policy, no CORS). Mounted AFTER the
  // /api routers; the SPA fallback explicitly skips /api/* (via next()) so
  // those paths reach the JSON 404 handler below rather than serving
  // index.html. When the env var is unset the backend stays API-only, so
  // split deployments are unchanged.
  if (staticDir) {
    const resolvedDir = path.resolve(staticDir);
    app.use(express.static(resolvedDir));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api")) return next();
      res.sendFile(path.join(resolvedDir, "index.html"));
    });
  }

  // Unknown /api/* paths 404 as JSON (matching every route's { error } shape),
  // rather than falling through to Express's default HTML 404 page.
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  // Terminal error handler — must be registered last, after all routers and the
  // 404 handler, so async throws (caught by express-async-errors) land here as a
  // consistent JSON 500 instead of a hung request or default HTML error page.
  app.use(errorHandler);

  return app;
}
