import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../prisma.js";
import {
  challengeFromVerifier,
  createSession,
  createVerifier,
  destroySession,
  lookupSession,
  parseCookies,
  randomState,
  serializeCookie,
  SESSION_COOKIE,
} from "../auth/session.js";

// Postgres-backed: session create/lookup/destroy hit AuthSession. A per-file
// owner avoids cross-file races on the shared dev DB.
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

describe("parseCookies", () => {
  it("returns {} for a missing header", () => {
    expect(parseCookies(undefined)).toEqual({});
  });

  it("parses multiple cookies and trims whitespace", () => {
    expect(parseCookies("a=1; b=2;  c=3")).toEqual({ a: "1", b: "2", c: "3" });
  });

  it("keeps values containing '='", () => {
    expect(parseCookies("token=ab=cd==")).toEqual({ token: "ab=cd==" });
  });

  it("skips segments without '=' and empty names", () => {
    expect(parseCookies("garbage; =val; ok=yes")).toEqual({ ok: "yes" });
  });

  it("URL-decodes values", () => {
    expect(parseCookies("x=a%20b")).toEqual({ x: "a b" });
  });
});

describe("serializeCookie", () => {
  it("includes HttpOnly, SameSite=Lax, Path=/ and Max-Age", () => {
    const header = serializeCookie(SESSION_COOKIE, "tok", { maxAgeSeconds: 600, secure: false });
    expect(header).toContain(`${SESSION_COOKIE}=tok`);
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Lax");
    expect(header).toContain("Path=/");
    expect(header).toContain("Max-Age=600");
    expect(header).not.toContain("Secure");
  });

  it("appends Secure when secure is true", () => {
    expect(serializeCookie("n", "v", { secure: true })).toContain("Secure");
  });

  it("URL-encodes the value", () => {
    expect(serializeCookie("n", "a b", { secure: false })).toContain("n=a%20b");
  });
});

describe("PKCE / state primitives", () => {
  it("randomState and createVerifier produce non-empty distinct tokens", () => {
    expect(randomState()).not.toBe(randomState());
    expect(createVerifier().length).toBeGreaterThan(20);
  });

  it("challengeFromVerifier is deterministic S256 (RFC 7636 test vector)", () => {
    // RFC 7636 Appendix B verifier/challenge pair.
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    expect(challengeFromVerifier(verifier)).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });
});
