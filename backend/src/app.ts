import path from "node:path";

// Side-effect import: patches Express so async route throws propagate to the
// terminal error handler instead of hanging the request. Must come before the
// routers are constructed.
import "express-async-errors";
import cors from "cors";
import type { CorsOptions } from "cors";
import express from "express";

import { requireAuth } from "@/lib/auth/middleware.js";
import { config } from "@/lib/core/config.js";
import { errorHandler } from "@/lib/core/error-handler.js";
import { httpLogger } from "@/lib/core/logger.js";
import { creationRateLimiter, globalRateLimiter, securityHeaders } from "@/lib/core/security.js";
import { actionsRouter } from "@/routes/character/actions.js";
import { activityRouter } from "@/routes/character/activity.js";
import { authRouter } from "@/routes/platform/auth.js";
import { advancementRouter } from "@/routes/character/advancement.js";
import { arcsRouter } from "@/routes/campaign/arcs.js";
import { campaignItemsRouter } from "@/routes/campaign/campaign-items.js";
import { campaignsRouter } from "@/routes/campaign/campaigns.js";
import { classRouter } from "@/routes/character/class.js";
import { charactersRouter } from "@/routes/character/characters.js";
import { conditionsRouter } from "@/routes/character/conditions.js";
import { entitiesRouter } from "@/routes/campaign/entities.js";
import { sessionsRouter } from "@/routes/session/sessions.js";
import { experienceRouter } from "@/routes/character/experience.js";
import { featsRouter } from "@/routes/catalog/feats.js";
import { healthRouter } from "@/routes/platform/health.js";
import { hitPointsRouter } from "@/routes/character/hitpoints.js";
import { inventoryRouter } from "@/routes/character/inventory.js";
import { itemsRouter } from "@/routes/catalog/items.js";
import { journalRouter } from "@/routes/session/journal.js";
import { levelUpRouter } from "@/routes/character/level-up.js";
import { disciplinesRouter } from "@/routes/character/disciplines.js";
import { shadowArtsRouter } from "@/routes/character/shadow-arts.js";
import { maneuversRouter } from "@/routes/character/maneuvers.js";
import { sneakAttackRouter } from "@/routes/character/sneak-attack.js";
import { stunningStrikeRouter } from "@/routes/character/stunning-strike.js";
import { openHandTechniqueRouter } from "@/routes/character/open-hand-technique.js";
import { quiveringPalmRouter } from "@/routes/character/quivering-palm.js";
import { handOfHarmRouter } from "@/routes/character/hand-of-harm.js";
import { handOfUltimateMercyRouter } from "@/routes/character/hand-of-ultimate-mercy.js";
import { subclassChoicesRouter } from "@/routes/character/subclass-choices.js";
import { channelDivinityRouter } from "@/routes/character/channel-divinity.js";
import { referenceRouter } from "@/routes/catalog/reference.js";
import { resourcesRouter } from "@/routes/character/resources.js";
import { spellsRouter } from "@/routes/catalog/spells.js";
import { spellcastingRouter } from "@/routes/character/spellcasting.js";

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

  // Public allowlist: health + the auth mechanism (OAuth sign-in + session)
  // are mounted BEFORE requireAuth so they stay reachable without a session.
  app.use("/api", healthRouter);
  app.use("/api", authRouter);

  // The gate: every router mounted past this point requires a valid session.
  // An unauthenticated request is 401'd here and never reaches them.
  app.use("/api", requireAuth);

  app.use("/api", charactersRouter);

  // Catalog / reference routers own top-level collection paths.
  app.use("/api", referenceRouter);
  app.use("/api", itemsRouter);
  app.use("/api", spellsRouter);
  app.use("/api", featsRouter);

  // Character-scoped routers own their sub-path under /characters/:id and read
  // :id via mergeParams (see each Router({ mergeParams: true })).
  app.use("/api/characters/:id/hp", hitPointsRouter);
  app.use("/api/characters/:id/inventory", inventoryRouter);
  app.use("/api/characters/:id/experience", experienceRouter);
  app.use("/api/characters/:id/spellcasting", spellcastingRouter);
  app.use("/api/characters/:id/resources", resourcesRouter);
  app.use("/api/characters/:id/conditions", conditionsRouter);
  app.use("/api/characters/:id/class", classRouter);
  app.use("/api/characters/:id/channel-divinity", channelDivinityRouter);
  app.use("/api/characters/:id/advancement", advancementRouter);
  app.use("/api/characters/:id/level-up", levelUpRouter);
  app.use("/api/characters/:id/actions", actionsRouter);
  // activity owns two sub-paths (/activity, /events/:batchId/revert), so it
  // mounts on the character root rather than a single leaf.
  app.use("/api/characters/:id", activityRouter);

  // Hybrid routers serve a top-level catalog (GET /) plus a character-scoped
  // transaction (POST /transactions), so they mount on both owned paths.
  app.use(["/api/maneuvers", "/api/characters/:id/maneuvers"], maneuversRouter);
  app.use("/api/characters/:id/sneak-attack", sneakAttackRouter);
  app.use("/api/characters/:id/stunning-strike", stunningStrikeRouter);
  app.use("/api/characters/:id/open-hand-technique", openHandTechniqueRouter);
  app.use("/api/characters/:id/quivering-palm", quiveringPalmRouter);
  app.use("/api/characters/:id/hand-of-harm", handOfHarmRouter);
  app.use("/api/characters/:id/hand-of-ultimate-mercy", handOfUltimateMercyRouter);
  app.use(["/api/disciplines", "/api/characters/:id/disciplines"], disciplinesRouter);
  app.use(["/api/shadow-arts", "/api/characters/:id/shadow-arts"], shadowArtsRouter);
  app.use("/api/subclass-choices", subclassChoicesRouter);

  app.use("/api", sessionsRouter);
  app.use("/api", journalRouter);
  app.use("/api", campaignsRouter);
  app.use("/api", entitiesRouter);
  app.use("/api", campaignItemsRouter);
  app.use("/api", arcsRouter);

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
