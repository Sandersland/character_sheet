import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

import { parseConfig } from "@/lib/core/config.js";

// config.ts reads env once at import time and freezes the result, so every test re-imports it fresh after stubbing the env it wants to observe.
async function loadConfig() {
  vi.resetModules();
  return import("@/lib/core/config.js");
}

describe("config", () => {
  beforeEach(() => {
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

const baseEnv = { DATABASE_URL: "postgres://user:pw@localhost:5432/db" };

function issuePaths(fn: () => unknown): string[] {
  try {
    fn();
  } catch (error) {
    if (error instanceof ZodError) return error.issues.map((issue) => issue.path.join("."));
    throw error;
  }
  return [];
}

describe("parseConfig", () => {
  it("fails naming DATABASE_URL when it is missing or blank", () => {
    expect(issuePaths(() => parseConfig({}))).toEqual(["DATABASE_URL"]);
    expect(issuePaths(() => parseConfig({ DATABASE_URL: "  " }))).toEqual(["DATABASE_URL"]);
  });

  it("fails naming PORT when it is not a valid port", () => {
    expect(issuePaths(() => parseConfig({ ...baseEnv, PORT: "abc" }))).toEqual(["PORT"]);
    expect(issuePaths(() => parseConfig({ ...baseEnv, PORT: "70000" }))).toEqual(["PORT"]);
  });

  it("fails naming LOG_LEVEL and APP_BASE_URL when they are invalid", () => {
    expect(issuePaths(() => parseConfig({ ...baseEnv, LOG_LEVEL: "loud" }))).toEqual(["LOG_LEVEL"]);
    expect(issuePaths(() => parseConfig({ ...baseEnv, APP_BASE_URL: "nope" }))).toEqual(["APP_BASE_URL"]);
  });

  it("parses PORT to a number, defaulting to 4000", () => {
    expect(parseConfig(baseEnv).PORT).toBe(4000);
    expect(parseConfig({ ...baseEnv, PORT: "4030" }).PORT).toBe(4030);
  });

  it("derives isProd and isTest once", () => {
    expect(parseConfig({ ...baseEnv, NODE_ENV: "production" })).toMatchObject({ isProd: true, isTest: false });
    expect(parseConfig({ ...baseEnv, NODE_ENV: "test" })).toMatchObject({ isProd: false, isTest: true });
    expect(parseConfig({ ...baseEnv, VITEST: "true" }).isTest).toBe(true);
    expect(parseConfig(baseEnv)).toMatchObject({ isProd: false, isTest: false });
  });

  it("defaults LOG_LEVEL to silent under test and info otherwise", () => {
    expect(parseConfig({ ...baseEnv, NODE_ENV: "test" }).LOG_LEVEL).toBe("silent");
    expect(parseConfig(baseEnv).LOG_LEVEL).toBe("info");
    expect(parseConfig({ ...baseEnv, LOG_LEVEL: "debug" }).LOG_LEVEL).toBe("debug");
  });

  it("falls back to the rate-limit defaults for unset or malformed knobs", () => {
    const parsed = parseConfig({ ...baseEnv, RATE_LIMIT_MAX: "-4", RATE_LIMIT_CREATE_MAX: "x" });
    expect(parsed).toMatchObject({
      RATE_LIMIT_WINDOW_MS: 15 * 60 * 1000,
      RATE_LIMIT_MAX: 600,
      RATE_LIMIT_CREATE_MAX: 30,
      RATE_LIMIT_DISABLED: false,
    });
    expect(parseConfig({ ...baseEnv, RATE_LIMIT_MAX: "5", RATE_LIMIT_DISABLED: "true" })).toMatchObject({
      RATE_LIMIT_MAX: 5,
      RATE_LIMIT_DISABLED: true,
    });
  });

  it("does not read or mutate process.env", () => {
    vi.stubEnv("PORT", "9999");
    expect(parseConfig(baseEnv).PORT).toBe(4000);
    vi.unstubAllEnvs();
  });
});
