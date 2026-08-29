import { afterEach, describe, expect, it, vi } from "vitest";
import supertest from "supertest";

// Credentialed cross-origin cookies require CORS to echo a concrete origin, never `*`; createApp reads CORS_ORIGIN via a frozen config snapshot, so each test stubs env then re-imports fresh.
async function appWithCorsOrigin(value: string) {
  vi.stubEnv("CORS_ORIGIN", value);
  vi.resetModules();
  const { createApp } = await import("@/app.js");
  return createApp();
}

describe("CORS credentials", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reflects the request origin + allows credentials when CORS_ORIGIN is unset", async () => {
    const res = await supertest(await appWithCorsOrigin(""))
      .get("/api/health")
      .set("Origin", "http://localhost:5173");

    expect(res.headers["access-control-allow-credentials"]).toBe("true");
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
  });

  it("allows credentials for an allowlisted origin when CORS_ORIGIN is set", async () => {
    const res = await supertest(await appWithCorsOrigin("https://app.example.com"))
      .get("/api/health")
      .set("Origin", "https://app.example.com");

    expect(res.headers["access-control-allow-credentials"]).toBe("true");
    expect(res.headers["access-control-allow-origin"]).toBe("https://app.example.com");
  });

  it("does not echo an origin outside the allowlist", async () => {
    const res = await supertest(await appWithCorsOrigin("https://app.example.com"))
      .get("/api/health")
      .set("Origin", "https://evil.example.com");

    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
