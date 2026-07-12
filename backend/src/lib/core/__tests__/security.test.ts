import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, RequestHandler, Response } from "express";

import { securityHeaders } from "@/lib/core/security.js";

// A fake served SPA dir with one inline script, standing in for the built
// index.html (whose real inline snippet is the pre-paint theme apply).
const INLINE_BODY = "console.log('theme');";
const INLINE_HASH = createHash("sha256").update(INLINE_BODY).digest("base64");
const fixtureStaticDir = mkdtempSync(join(tmpdir(), "csp-static-"));
writeFileSync(
  join(fixtureStaticDir, "index.html"),
  `<!doctype html><html><head><script>${INLINE_BODY}</script>` +
    `<script type="module" src="/src/main.tsx"></script></head><body></body></html>`,
);
afterAll(() => rmSync(fixtureStaticDir, { recursive: true, force: true }));

// Pure middleware test — no Postgres. Runs the helmet handler against a fake
// res and reads back the Content-Security-Policy header it sets. Guards the
// single-origin CSP allowances (#149 avatars, #150 dice worker, #151 CF beacon)
// that only bite in SERVE_STATIC_DIR mode and so never surface in local dev.
// Pass a static dir (the fixture) for single-origin mode, undefined for API-only.
function cspFor(staticDir: string | undefined): string {
  const handler = securityHeaders(staticDir);
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
  const csp = cspFor(fixtureStaticDir);

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

  it("carries a script-src nonce for Cloudflare's injected inline snippets (JS Detections)", () => {
    expect(csp).toMatch(/script-src[^;]*'nonce-[A-Za-z0-9+/]{22}=*'/);
  });

  it("mints a fresh nonce per response — no nonce reuse", () => {
    const nonceOf = (policy: string) => policy.match(/'nonce-([^']+)'/)?.[1];
    const first = nonceOf(cspFor(fixtureStaticDir));
    const second = nonceOf(cspFor(fixtureStaticDir));
    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    expect(first).not.toBe(second);
  });

  it("allowlists the served index.html's inline scripts by hash (theme pre-paint snippet)", () => {
    expect(csp).toContain(`'sha256-${INLINE_HASH}'`);
  });

  it("does not emit hash sources for src-carrying script tags", () => {
    // Exactly one sha256 source: the fixture's single inline body.
    expect(csp.match(/'sha256-/g)).toHaveLength(1);
  });

  it("serves a hash-free policy when index.html is unreadable (no crash)", () => {
    const handler = securityHeaders("/definitely/not/a/dir");
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
    handler({ secure: true, headers: {} } as unknown as Request, res, () => {});
    const policy = headers["content-security-policy"] ?? "";
    expect(policy).toContain("script-src 'self'");
    expect(policy).not.toContain("'sha256-");
  });
});

describe("securityHeaders API-only mode", () => {
  it("does not apply the single-origin third-party allowances", () => {
    const csp = cspFor(undefined);
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
