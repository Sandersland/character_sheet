import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { RequestHandler } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

const isTest = process.env.NODE_ENV === "test" || process.env.VITEST === "true";

// Hashes the served index.html's inline scripts at boot so the CSP allowance tracks deployed markup rather than drifting from it.
function inlineScriptHashes(staticDir: string): string[] {
  try {
    const html = readFileSync(join(staticDir, "index.html"), "utf8");
    const hashes: string[] = [];
    // Non-greedy match ends at the first </script>; a literal "</script>" inside a script body would truncate the hashed content.
    for (const match of html.matchAll(/<script(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi)) {
      if (!match[1]) continue;
      hashes.push(`'sha256-${createHash("sha256").update(match[1]).digest("base64")}'`);
    }
    return hashes;
  } catch {
    return [];
  }
}

export function securityHeaders(staticDir: string | undefined): RequestHandler {
  return helmet({
    contentSecurityPolicy: staticDir
      ? {
          directives: {
            defaultSrc: ["'self'"],
            // 'inline-speculation-rules' permits only Cloudflare's declarative prefetch script tag, not arbitrary inline JS, and is ignored by browsers that don't recognize it.
            // First-party inline scripts (the theme pre-paint snippet) can't carry a per-request nonce since they're static HTML, so they're allowlisted by content hash instead.
            scriptSrc: [
              "'self'",
              "https://static.cloudflareinsights.com",
              "'inline-speculation-rules'",
              ...inlineScriptHashes(staticDir),
              () => `'nonce-${randomBytes(16).toString("base64")}'`,
            ],
            // Workers fall back to scriptSrc without an explicit workerSrc.
            workerSrc: ["'self'", "blob:"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            imgSrc: ["'self'", "data:", "https://lh3.googleusercontent.com"],
            fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
            connectSrc: ["'self'", "https://cloudflareinsights.com"],
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

const windowMs = intFromEnv("RATE_LIMIT_WINDOW_MS", 15 * 60 * 1000);
const globalMax = intFromEnv("RATE_LIMIT_MAX", 600);
const createMax = intFromEnv("RATE_LIMIT_CREATE_MAX", 30);

const disabled = isTest || process.env.RATE_LIMIT_DISABLED === "true";

const sharedOptions = {
  windowMs,
  standardHeaders: true as const,
  legacyHeaders: false as const,
  message: { error: "Too many requests, please try again later." },
};

export const globalRateLimiter: RequestHandler = disabled
  ? (_req, _res, next) => next()
  : rateLimit({ ...sharedOptions, limit: globalMax });

export const creationRateLimiter: RequestHandler = disabled
  ? (_req, _res, next) => next()
  : rateLimit({
      ...sharedOptions,
      limit: createMax,
      skip: (req) => !(req.method === "POST" && req.path === "/api/characters"),
    });
