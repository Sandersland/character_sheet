import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { RequestHandler } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import type { Config } from "@/lib/core/config.js";
import { config } from "@/lib/core/config.js";

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

export type RateLimitConfig = Pick<
  Config,
  | "isTest"
  | "RATE_LIMIT_DISABLED"
  | "RATE_LIMIT_WINDOW_MS"
  | "RATE_LIMIT_MAX"
  | "RATE_LIMIT_CREATE_MAX"
>;

const passthrough: RequestHandler = (_req, _res, next) => next();

export function createRateLimiters(cfg: RateLimitConfig): {
  globalRateLimiter: RequestHandler;
  creationRateLimiter: RequestHandler;
} {
  if (cfg.isTest || cfg.RATE_LIMIT_DISABLED) {
    return { globalRateLimiter: passthrough, creationRateLimiter: passthrough };
  }
  const sharedOptions = {
    windowMs: cfg.RATE_LIMIT_WINDOW_MS,
    standardHeaders: true as const,
    legacyHeaders: false as const,
    message: { error: "Too many requests, please try again later." },
  };
  return {
    globalRateLimiter: rateLimit({ ...sharedOptions, limit: cfg.RATE_LIMIT_MAX }),
    creationRateLimiter: rateLimit({
      ...sharedOptions,
      limit: cfg.RATE_LIMIT_CREATE_MAX,
      skip: (req) => !(req.method === "POST" && req.path === "/api/characters"),
    }),
  };
}

export const { globalRateLimiter, creationRateLimiter } = createRateLimiters(config);
