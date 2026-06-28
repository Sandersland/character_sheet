import { afterAll, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "../../app.js";
import { prisma } from "../../lib/prisma.js";
import { authCookie } from "../../test-support/auth.js";

// Exercises the requireAuth gate wired into createApp(): unauthenticated
// requests to any protected /api route are 401, while the public allowlist
// (health + /api/auth/*) stays reachable without a session.

const OWNER_ID = "owner-authz-gate";

describe("auth gate (requireAuth)", () => {
  let cookie: string;

  beforeAll(async () => {
    cookie = await authCookie(OWNER_ID);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: OWNER_ID } });
  });

  it("401s an unauthenticated request to a protected route", async () => {
    const res = await supertest(createApp()).get("/api/characters");
    expect(res.status).toBe(401);
  });

  it("allows an authenticated request through the gate", async () => {
    const res = await supertest(createApp()).get("/api/characters").set("Cookie", cookie);
    expect(res.status).toBe(200);
  });

  it("keeps GET /api/health public", async () => {
    const res = await supertest(createApp()).get("/api/health");
    expect(res.status).toBe(200);
  });

  it("keeps GET /api/auth/providers public", async () => {
    const res = await supertest(createApp()).get("/api/auth/providers");
    expect(res.status).toBe(200);
  });
});
