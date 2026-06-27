import type { RequestHandler } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

// Security hardening middleware: standard security headers (helmet) + request
// rate limiting. Both are env-tunable so local dev and tests aren't throttled
// and the CSP can be relaxed if a single-origin deployment needs it.

const isTest = process.env.NODE_ENV === "test" || process.env.VITEST === "true";

// helmet sets HSTS, X-Content-Type-Options, X-Frame-Options, a restrictive CSP,
// etc. When the SPA is served from this same origin (SERVE_STATIC_DIR set), the
// default CSP would block the Vite-built assets, so we tune the directives to
// allow self-hosted scripts/styles (Tailwind injects a stylesheet; some inline
// styles exist, hence 'unsafe-inline' for style only) plus data: URIs for
// fonts/images. In API-only mode the responses are JSON, so CSP is moot — but a
// tuned policy is harmless and keeps one code path.
export function securityHeaders(servesStatic: boolean): RequestHandler {
  return helmet({
    contentSecurityPolicy: servesStatic
      ? {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            // Vite/Tailwind emit a real stylesheet, but inline styles slip in
            // (e.g. dynamic widths on the HP bar) — allow them for style only.
            // The SPA also pulls Source Sans/Serif from Google Fonts: the
            // stylesheet from fonts.googleapis.com, the font files from
            // fonts.gstatic.com (see frontend/index.html). Both must be allowed
            // or the app falls back to system fonts in single-origin mode.
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            imgSrc: ["'self'", "data:"],
            fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
            connectSrc: ["'self'"],
            objectSrc: ["'none'"],
          },
        }
      : undefined,
  });
}

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const windowMs = intFromEnv("RATE_LIMIT_WINDOW_MS", 15 * 60 * 1000); // 15 min
const globalMax = intFromEnv("RATE_LIMIT_MAX", 600); // generous for normal play
const createMax = intFromEnv("RATE_LIMIT_CREATE_MAX", 30); // tighter on creation

// A no-op when limiting is disabled (tests, or RATE_LIMIT_DISABLED=true) so the
// suite and local dev aren't throttled. Returns an array so callers can spread
// it into app.use without conditionals at the call site.
const disabled = isTest || process.env.RATE_LIMIT_DISABLED === "true";

const sharedOptions = {
  windowMs,
  standardHeaders: true as const,
  legacyHeaders: false as const,
  message: { error: "Too many requests, please try again later." },
};

// Global limiter across all routes — a coarse backstop against hammering.
export const globalRateLimiter: RequestHandler = disabled
  ? (_req, _res, next) => next()
  : rateLimit({ ...sharedOptions, limit: globalMax });

// Tighter limiter scoped to character creation (POST /api/characters), which
// writes a new row + audit history and is the cheapest endpoint to abuse.
// Mounted at the app level, so it skips everything except that exact request.
export const creationRateLimiter: RequestHandler = disabled
  ? (_req, _res, next) => next()
  : rateLimit({
      ...sharedOptions,
      limit: createMax,
      skip: (req) => !(req.method === "POST" && req.path === "/api/characters"),
    });
