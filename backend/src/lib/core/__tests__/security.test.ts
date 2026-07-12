import { afterEach, describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, RequestHandler, Response } from "express";

import { securityHeaders } from "@/lib/core/security.js";

// Pure middleware test — no Postgres. Runs the helmet handler against a fake
// res and reads back the Content-Security-Policy header it sets. Guards the
// single-origin CSP allowances (#149 avatars, #150 dice worker, #151 CF beacon)
// that only bite in SERVE_STATIC_DIR mode and so never surface in local dev.
function cspFor(servesStatic: boolean): string {
  const handler = securityHeaders(servesStatic);
  const headers: Record<string, string> = {};
  const res = {
    setHeader(name: string, value: string) {
      headers[name.toLowerCase()] = String(value);
    },
    getHeader(name: string) {
      return headers[name.toLowerCase()];
    },
    removeHeader(name: string) {
      delete headers[name.toLowerCase()];
    },
  } as unknown as Response;
  const req = { secure: true, headers: {} } as unknown as Request;
  handler(req, res, () => {});
  return headers["content-security-policy"] ?? "";
}

describe("securityHeaders single-origin CSP", () => {
  const csp = cspFor(true);

  it("allows Google profile avatars in img-src (#149)", () => {
    expect(csp).toContain("img-src 'self' data: https://lh3.googleusercontent.com");
  });

  it("allows the 3D dice blob: Web Worker via a dedicated worker-src (#150)", () => {
    expect(csp).toContain("worker-src 'self' blob:");
  });

  it("keeps script-src restricted to self + the CF beacon, not blob: (#150/#151)", () => {
    expect(csp).toContain("script-src 'self' https://static.cloudflareinsights.com");
    expect(csp).not.toContain("script-src 'self' https://static.cloudflareinsights.com blob:");
  });

  it("allows the Cloudflare Web Analytics beacon POST in connect-src (#151)", () => {
    expect(csp).toContain("connect-src 'self' https://cloudflareinsights.com");
  });

  it("permits Cloudflare Speed Brain's inline speculation rules — and nothing else inline", () => {
    expect(csp).toContain("'inline-speculation-rules'");
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });
});

describe("securityHeaders API-only mode", () => {
  it("does not apply the single-origin third-party allowances", () => {
    const csp = cspFor(false);
    expect(csp).not.toContain("lh3.googleusercontent.com");
    expect(csp).not.toContain("cloudflareinsights.com");
  });
});

// Re-imports security.ts with a controlled env so we can exercise both the
// enabled and disabled rate-limiter branches. In-suite VITEST=true would
// otherwise always short-circuit to the no-op, so this clears the test flags.
async function loadLimiters(env: Record<string, string | undefined>) {
  const prev = { ...process.env };
  vi.resetModules();
  process.env.VITEST = "";
  process.env.NODE_ENV = "production";
  delete process.env.RATE_LIMIT_DISABLED;
  Object.assign(process.env, env);
  const mod = await import("@/lib/core/security.js");
  process.env = prev;
  return mod;
}

// The real express-rate-limit middleware emits RateLimit headers; the no-op
// passthrough does not. That header is the observable difference between an
// active limiter and a disabled one.
async function runOnce(handler: RequestHandler) {
  const headers: Record<string, string> = {};
  const res = {
    setHeader(name: string, value: string) {
      headers[name.toLowerCase()] = String(value);
    },
    getHeader(name: string) {
      return headers[name.toLowerCase()];
    },
    removeHeader(name: string) {
      delete headers[name.toLowerCase()];
    },
  } as unknown as Response;
  const req = {
    method: "GET",
    path: "/api/health",
    ip: "127.0.0.1",
    headers: {},
    app: { get: () => undefined },
  } as unknown as Request;
  let nextCalled = false;
  const next: NextFunction = () => {
    nextCalled = true;
  };
  await handler(req, res, next);
  const limited = Object.keys(headers).some((h) => h.startsWith("ratelimit"));
  return { nextCalled, limited };
}

describe("rate limiter disabling", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("makes both limiters no-op passthroughs when RATE_LIMIT_DISABLED=true", async () => {
    const { globalRateLimiter, creationRateLimiter } = await loadLimiters({
      RATE_LIMIT_DISABLED: "true",
    });
    const global = await runOnce(globalRateLimiter);
    const creation = await runOnce(creationRateLimiter);
    expect(global.nextCalled).toBe(true);
    expect(global.limited).toBe(false);
    expect(creation.nextCalled).toBe(true);
    expect(creation.limited).toBe(false);
  });

  it("keeps the global limiter active when RATE_LIMIT_DISABLED is unset", async () => {
    const { globalRateLimiter } = await loadLimiters({ RATE_LIMIT_DISABLED: undefined });
    const { nextCalled, limited } = await runOnce(globalRateLimiter);
    expect(nextCalled).toBe(true);
    expect(limited).toBe(true);
  });
});
