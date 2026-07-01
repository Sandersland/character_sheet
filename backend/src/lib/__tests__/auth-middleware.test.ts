import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import supertest from "supertest";
import "express-async-errors";

import { requireAuth } from "../auth/middleware.js";
import { createSession, SESSION_COOKIE } from "../auth/session.js";
import { errorHandler } from "../error-handler.js";
import { prisma } from "../prisma.js";
import { ensureTestOwner } from "../../test-support/owner.js";

// Minimal app that mounts requireAuth in front of one protected route which
// echoes the resolved user. Real Postgres for the session lookup. The terminal
// errorHandler is mounted last, mirroring app.ts — requireAuth rejects via
// next(new AuthenticationError()), so the handler is what shapes the 401 body.

const USER_ID = "user-mw-1";

function buildApp() {
  const app = express();
  app.get("/protected", requireAuth, (req, res) => {
    res.json({ user: req.user });
  });
  app.use(errorHandler);
  return app;
}

function cookie(token: string): string {
  return `${SESSION_COOKIE}=${token}`;
}

describe("requireAuth", () => {
  let validToken: string;
  const expiredToken = "expired-session-token-mw";

  beforeAll(async () => {
    await ensureTestOwner(USER_ID);
    validToken = await createSession(USER_ID);
    await prisma.authSession.create({
      data: { id: expiredToken, userId: USER_ID, expiresAt: new Date(Date.now() - 1000) },
    });
  });

  afterAll(async () => {
    // Cascade-deleting the user removes its sessions.
    await prisma.user.deleteMany({ where: { id: USER_ID } });
  });

  it("401s with no session cookie", async () => {
    const res = await supertest(buildApp()).get("/protected");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Not authenticated" });
  });

  it("401s for an unknown session token", async () => {
    const res = await supertest(buildApp())
      .get("/protected")
      .set("Cookie", cookie("no-such-token"));
    expect(res.status).toBe(401);
  });

  it("401s for an expired session", async () => {
    const res = await supertest(buildApp())
      .get("/protected")
      .set("Cookie", cookie(expiredToken));
    expect(res.status).toBe(401);
  });

  it("200s and attaches req.user for a valid session", async () => {
    const res = await supertest(buildApp())
      .get("/protected")
      .set("Cookie", cookie(validToken));
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(USER_ID);
  });
});
