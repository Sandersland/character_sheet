import path from "node:path";

// Must be imported before routers are constructed so async route throws propagate to errorHandler.
import "express-async-errors";
import cors from "cors";
import type { CorsOptions } from "cors";
import express, { type Express } from "express";

import { requireAuth } from "@/http/middleware.js";
import { config } from "@/lib/core/config.js";
import { errorHandler } from "@/http/error-handler.js";
import { httpLogger } from "@/http/http-logger.js";
import {
  authRateLimiter,
  creationRateLimiter,
  globalRateLimiter,
  joinRateLimiter,
  securityHeaders,
  uploadRateLimiter,
} from "@/http/security.js";
import { routeManifest, type RouteMount } from "@/routes/manifest.js";

function mountPass(app: Express, scope: RouteMount["scope"]): void {
  for (const entry of routeManifest) {
    if (entry.scope !== scope) continue;
    for (const mountPath of Array.isArray(entry.mount) ? entry.mount : [entry.mount]) {
      app.use(mountPath, entry.router);
    }
  }
}

// The app is single-origin (the backend serves the SPA, dev rides the Vite proxy), so an unset CORS_ORIGIN means no CORS at all (#2021). `credentials: true` requires a concrete origin, never `*`.
function corsOptions(): CorsOptions | undefined {
  const configured = config.CORS_ORIGIN;
  if (!configured) return undefined;
  const allowlist = configured
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return { origin: allowlist, credentials: true };
}

export function createApp() {
  const app = express();

  const staticDir = config.SERVE_STATIC_DIR;

  app.set("trust proxy", config.TRUST_PROXY);

  app.use(securityHeaders(staticDir));
  const corsConfig = corsOptions();
  if (corsConfig) app.use(cors(corsConfig));
  app.use(express.json());
  app.use(httpLogger);
  app.use(globalRateLimiter);
  app.use(creationRateLimiter);
  app.use(authRateLimiter);
  app.use(joinRateLimiter);
  app.use(uploadRateLimiter);

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
