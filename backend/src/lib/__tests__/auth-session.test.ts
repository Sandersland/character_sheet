import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../prisma.js";
import {
  createSession,
  destroySession,
  lookupSession,
} from "../auth/session.js";

// Postgres-backed: session create/lookup/destroy hit AuthSession. A per-file
// owner avoids cross-file races on the shared dev DB. Cookie helpers and the
// OAuth PKCE primitives moved out — covered by cookies.test.ts and
// auth-oauth-pkce.test.ts respectively.
const OWNER_ID = "test-owner-auth-session";

describe("session lifecycle", () => {
  beforeEach(async () => {
    await prisma.user.upsert({ where: { id: OWNER_ID }, create: { id: OWNER_ID }, update: {} });
  });

  afterEach(async () => {
    await prisma.authSession.deleteMany({ where: { userId: OWNER_ID } });
  });

  it("create → lookup returns the owning user", async () => {
    const token = await createSession(OWNER_ID);
    const user = await lookupSession(token);
    expect(user?.id).toBe(OWNER_ID);
  });

  it("lookup of an unknown token is null", async () => {
    expect(await lookupSession("nope-not-a-token")).toBeNull();
  });

  it("destroy removes the session (subsequent lookup null)", async () => {
    const token = await createSession(OWNER_ID);
    await destroySession(token);
    expect(await lookupSession(token)).toBeNull();
  });

  it("destroy of an absent token does not throw", async () => {
    await expect(destroySession("already-gone")).resolves.toBeUndefined();
  });

  it("rejects (and cleans up) an expired session", async () => {
    const token = "expired-token-fixture";
    await prisma.authSession.create({
      data: { id: token, userId: OWNER_ID, expiresAt: new Date(Date.now() - 1000) },
    });

    expect(await lookupSession(token)).toBeNull();
    // Best-effort cleanup removed the row.
    expect(await prisma.authSession.findUnique({ where: { id: token } })).toBeNull();
  });
});
