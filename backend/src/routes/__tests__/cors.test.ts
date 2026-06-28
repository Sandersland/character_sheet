import { afterEach, describe, expect, it, vi } from "vitest";
import supertest from "supertest";

import { createApp } from "../../app.js";

// The SPA sends `credentials: "include"` so the session cookie flows
// cross-origin (dev: 5173 → 4000). That requires CORS to allow credentials AND
// echo a concrete origin (never `*`). Probed via the public health route.

describe("CORS credentials", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reflects the request origin + allows credentials when CORS_ORIGIN is unset", async () => {
    vi.stubEnv("CORS_ORIGIN", "");
    const res = await supertest(createApp())
      .get("/api/health")
      .set("Origin", "http://localhost:5173");

    expect(res.headers["access-control-allow-credentials"]).toBe("true");
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
  });

  it("allows credentials for an allowlisted origin when CORS_ORIGIN is set", async () => {
    vi.stubEnv("CORS_ORIGIN", "https://app.example.com");
    const res = await supertest(createApp())
      .get("/api/health")
      .set("Origin", "https://app.example.com");

    expect(res.headers["access-control-allow-credentials"]).toBe("true");
    expect(res.headers["access-control-allow-origin"]).toBe("https://app.example.com");
  });

  it("does not echo an origin outside the allowlist", async () => {
    vi.stubEnv("CORS_ORIGIN", "https://app.example.com");
    const res = await supertest(createApp())
      .get("/api/health")
      .set("Origin", "https://evil.example.com");

    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
