import { afterEach, describe, expect, it, vi } from "vitest";
import supertest from "supertest";

// isTest turns every limiter into a passthrough, so the env is re-stubbed to a non-test shape and the app re-imported to exercise the real wiring (trust proxy from config + limiters on the routes).
async function liveApp(env: Record<string, string>) {
  vi.stubEnv("VITEST", "");
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("RATE_LIMIT_DISABLED", "");
  vi.stubEnv("ALLOW_DEV_LOGIN", "true");
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  vi.resetModules();
  // fallow-ignore-next-line boundary-violation -- the test must build the real app to assert its limiter wiring
  const { createApp } = await import("@/app.js");
  return createApp();
}

describe("rate limiter wiring", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("429s dev-login past RATE_LIMIT_AUTH_MAX, including trailing-slash and mixed-case spellings", async () => {
    const app = await liveApp({ RATE_LIMIT_AUTH_MAX: "1", TRUST_PROXY: "1" });
    const spellings = ["/api/auth/dev-login", "/api/auth/dev-login/", "/API/AUTH/Dev-Login"];
    const statuses: number[] = [];
    for (const path of spellings) statuses.push((await supertest(app).post(path)).status);
    expect(statuses[0]).not.toBe(429);
    expect(statuses.slice(1)).toEqual([429, 429]);
  });

  it("keys on the client IP from X-Forwarded-For per TRUST_PROXY", async () => {
    const app = await liveApp({ RATE_LIMIT_AUTH_MAX: "1", TRUST_PROXY: "1" });
    const from = (ip: string) => supertest(app).post("/api/auth/dev-login").set("X-Forwarded-For", ip);
    const first = await from("1.1.1.1");
    const again = await from("1.1.1.1");
    const other = await from("2.2.2.2");
    expect(first.status).not.toBe(429);
    expect(again.status).toBe(429);
    expect(other.status).not.toBe(429);
  });

  it("leaves the OAuth callback and /auth/providers unlimited", async () => {
    const app = await liveApp({ RATE_LIMIT_AUTH_MAX: "1", TRUST_PROXY: "1" });
    for (let i = 0; i < 3; i += 1) {
      expect((await supertest(app).get("/api/auth/google/callback")).status).not.toBe(429);
      expect((await supertest(app).get("/api/auth/providers")).status).not.toBe(429);
    }
  });
});
