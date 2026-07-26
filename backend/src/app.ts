import path from "node:path";

// Side-effect import: patches Express so async route throws propagate to the
// terminal error handler instead of hanging the request. Must come before the
// routers are constructed.
import "express-async-errors";
import cors from "cors";
import type { CorsOptions } from "cors";
import express, { type Express } from "express";

import { requireAuth } from "@/lib/auth/middleware.js";
import { config } from "@/lib/core/config.js";
import { errorHandler } from "@/lib/core/error-handler.js";
import { httpLogger } from "@/lib/core/logger.js";
import { creationRateLimiter, globalRateLimiter, securityHeaders } from "@/lib/core/security.js";
import { routeManifest, type RouteMount } from "@/routes/manifest.js";

// Mounts every routeManifest entry matching `scope`, in array order — see
// RouteMount's doc for why that order and the required `scope` matter.
function mountPass(app: Express, scope: RouteMount["scope"]): void {
  for (const entry of routeManifest) {
    if (entry.scope !== scope) continue;
    for (const mountPath of Array.isArray(entry.mount) ? entry.mount : [entry.mount]) {
      app.use(mountPath, entry.router);
    }
  }
}

// CORS origins are env-driven so the API can be deployed anywhere without a
// code change. `CORS_ORIGIN` is a comma-separated allowlist
// (e.g. "https://dev.example.com,https://example.com").
//
// `credentials: true` is always set: the SPA sends the session cookie with
// `credentials: "include"`, which the browser only honors when the response
// carries `Access-Control-Allow-Credentials: true` AND a concrete (non-`*`)
// origin. So when no allowlist is configured we reflect the request origin
// (`origin: true`) rather than `*` — convenient for local dev and single-origin
// deploys (where CORS isn't exercised anyway). Harden a split-origin prod by
// setting `CORS_ORIGIN` to the explicit allowlist.
function corsOptions(): CorsOptions {
  const configured = config.CORS_ORIGIN;
  if (!configured) return { origin: true, credentials: true };
  const allowlist = configured
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return { origin: allowlist, credentials: true };
}

export function createApp() {
  const app = express();

  // Single-origin mode is decided up front so the CSP can be tuned for the SPA.
  const staticDir = config.SERVE_STATIC_DIR;

  // Security headers first, then CORS, body parsing, request logging, and a
  // coarse global rate limit — all before any router runs.
  app.use(securityHeaders(staticDir));
  app.use(cors(corsOptions()));
  app.use(express.json());
  app.use(httpLogger);
  app.use(globalRateLimiter);
  app.use(creationRateLimiter);

  mountPass(app, "public");
  app.use("/api", requireAuth);
  mountPass(app, "authed");

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
