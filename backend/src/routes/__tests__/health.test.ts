import { afterAll, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "../../app.js";
import { prisma } from "../../lib/prisma.js";
import { authCookie } from "../../test-support/auth.js";

describe("GET /api/health", () => {
  it("returns ok status (public, no session)", async () => {
    const response = await supertest(createApp()).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });
});

describe("unknown /api paths", () => {
  const OWNER_ID = "owner-health";
  let cookie: string;

  beforeAll(async () => {
    cookie = await authCookie(OWNER_ID);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: OWNER_ID } });
  });

  it("401s before the 404 handler when unauthenticated (no path enumeration)", async () => {
    const response = await supertest(createApp()).get("/api/does-not-exist");
    expect(response.status).toBe(401);
  });

  it("404s as JSON for an authenticated caller, not Express's default HTML", async () => {
    const response = await supertest(createApp())
      .get("/api/does-not-exist")
      .set("Cookie", cookie);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "Not found" });
  });
});
