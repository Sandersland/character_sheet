import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The config module reads env once at import time and freezes the result, so
// every test re-imports it fresh (vi.resetModules + dynamic import) after
// stubbing the env it wants to observe. No Postgres needed — this is pure env
// validation.

async function loadConfig() {
  vi.resetModules();
  return import("../config.js");
}

describe("config", () => {
  beforeEach(() => {
    // Start from a clean slate so a real ambient env (DATABASE_URL etc.) can't
    // leak provider creds into a "no creds" assertion.
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    vi.stubEnv("APP_BASE_URL", "");
    vi.stubEnv("SESSION_COOKIE_SECURE", "");
    vi.stubEnv("NODE_ENV", "test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("constructs with provider creds absent (undefined, no throw)", async () => {
    const { config } = await loadConfig();
    expect(config.GOOGLE_CLIENT_ID).toBeUndefined();
    expect(config.GOOGLE_CLIENT_SECRET).toBeUndefined();
  });

  it("surfaces provider creds when present", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "client-abc");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret-xyz");

    const { config } = await loadConfig();
    expect(config.GOOGLE_CLIENT_ID).toBe("client-abc");
    expect(config.GOOGLE_CLIENT_SECRET).toBe("secret-xyz");
  });

  it("defaults APP_BASE_URL to http://localhost:4000", async () => {
    const { config } = await loadConfig();
    expect(config.APP_BASE_URL).toBe("http://localhost:4000");
  });

  it("respects an explicit APP_BASE_URL", async () => {
    vi.stubEnv("APP_BASE_URL", "https://dnd.example.com");
    const { config } = await loadConfig();
    expect(config.APP_BASE_URL).toBe("https://dnd.example.com");
  });

  it("SESSION_COOKIE_SECURE defaults to false outside production", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const { config } = await loadConfig();
    expect(config.SESSION_COOKIE_SECURE).toBe(false);
  });

  it("SESSION_COOKIE_SECURE defaults to true in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { config } = await loadConfig();
    expect(config.SESSION_COOKIE_SECURE).toBe(true);
  });

  it("SESSION_COOKIE_SECURE honours an explicit override", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SESSION_COOKIE_SECURE", "false");
    const { config } = await loadConfig();
    expect(config.SESSION_COOKIE_SECURE).toBe(false);
  });

  it("appRedirectUri builds the per-provider callback path", async () => {
    vi.stubEnv("APP_BASE_URL", "https://dnd.example.com");
    const { appRedirectUri } = await loadConfig();
    expect(appRedirectUri("google")).toBe(
      "https://dnd.example.com/api/auth/google/callback",
    );
  });

  it("freezes the config object", async () => {
    const { config } = await loadConfig();
    expect(Object.isFrozen(config)).toBe(true);
  });
});
