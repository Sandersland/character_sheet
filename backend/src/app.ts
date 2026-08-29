import path from "node:path";

// Must be imported before routers are constructed so async route throws propagate to errorHandler.
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

function mountPass(app: Express, scope: RouteMount["scope"]): void {
  for (const entry of routeManifest) {
    if (entry.scope !== scope) continue;
    for (const mountPath of Array.isArray(entry.mount) ? entry.mount : [entry.mount]) {
      app.use(mountPath, entry.router);
    }
  }
}

// `credentials: true` requires a concrete origin, never `*`; reflecting the request
// origin here (when CORS_ORIGIN is unset) stays safe for that reason.
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

  const staticDir = config.SERVE_STATIC_DIR;

  app.use(securityHeaders(staticDir));
  app.use(cors(corsOptions()));
  app.use(express.json());
  app.use(httpLogger);
  app.use(globalRateLimiter);
  app.use(creationRateLimiter);

  mountPass(app, "public");
  app.use("/api", requireAuth);
  mountPass(app, "authed");

  // Must mount after the /api routers so /api/* falls through to the JSON 404 below instead of index.html.
  if (staticDir) {
    const resolvedDir = path.resolve(staticDir);
    app.use(express.static(resolvedDir));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api")) return next();
      res.sendFile(path.join(resolvedDir, "index.html"));
    });
  }

  // Matches every route's { error } wire shape.
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  // Must be registered last: async throws (via express-async-errors) land here only if so.
  app.use(errorHandler);

  return app;
}
