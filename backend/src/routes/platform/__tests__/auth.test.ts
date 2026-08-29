import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import supertest from "supertest";
import "express-async-errors";

import { errorHandler } from "@/lib/core/error-handler.js";
import { prisma } from "@/lib/core/prisma.js";
import { authRouter } from "@/routes/platform/auth.js";

// config is frozen at import, so ALLOW_DEV_LOGIN can't be flipped via env at runtime; mock it to read from a hoisted, mutable holder instead.
const hoisted = vi.hoisted(() => ({ devLoginEnabled: false }));
vi.mock("@/lib/core/config.js", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/core/config.js")>();
  return {
    ...actual,
    get config() {
      return { ...actual.config, ALLOW_DEV_LOGIN: hoisted.devLoginEnabled };
    },
  };
});

const DEV_USER_ID = "dev-user-local";
let devUserTouched = false;
async function cleanupDevUser() {
  if (!devUserTouched) return;
  await prisma.user.deleteMany({ where: { id: DEV_USER_ID } });
  devUserTouched = false;
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", authRouter);
  app.use(errorHandler);
  return app;
}

const TEST_SUBS = new Set<string>();

async function cleanupSubs() {
  if (TEST_SUBS.size === 0) return;
  const accounts = await prisma.authAccount.findMany({
    where: { provider: "google", providerAccountId: { in: [...TEST_SUBS] } },
    select: { userId: true },
  });
  const userIds = [...new Set(accounts.map((a) => a.userId))];
  if (userIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
  TEST_SUBS.clear();
}

function mockGoogleFetch(opts: {
  tokenStatus?: number;
  userinfoStatus?: number;
  tokenBody?: Record<string, unknown>;
  profile?: Record<string, unknown>;
}) {
  const {
    tokenStatus = 200,
    userinfoStatus = 200,
    tokenBody,
    profile = {
      sub: "sub-default",
      email: "player@example.com",
      email_verified: true,
      name: "Player One",
      picture: "https://img.example.com/p.png",
    },
  } = opts;

  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("oauth2.googleapis.com/token")) {
      return new Response(
        JSON.stringify(
          tokenBody ?? {
            access_token: "access-tok",
            token_type: "Bearer",
            expires_in: 3600,
            refresh_token: "refresh-tok",
            scope: "openid email profile",
            id_token: "id-tok",
          },
        ),
        { status: tokenStatus, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url.includes("openidconnect.googleapis.com/v1/userinfo")) {
      return new Response(JSON.stringify(profile), {
        status: userinfoStatus,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
}

async function beginFlow(agent: ReturnType<typeof supertest.agent>) {
  const start = await agent.get("/api/auth/google/start");
  expect(start.status).toBe(302);
  const location = new URL(start.headers.location);
  const state = location.searchParams.get("state");
  if (!state) throw new Error("no state in authorize URL");
  return { state };
}

describe("auth router", () => {
  beforeEach(() => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "client-abc");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret-xyz");
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    hoisted.devLoginEnabled = false;
    await cleanupSubs();
    await cleanupDevUser();
  });

  describe("GET /auth/providers", () => {
    it("lists google with a startUrl origin-relative to the request", async () => {
      // The expected origin is driven by the request's Host header, not ambient APP_BASE_URL, which varies across compose/worktree stacks (#166).
      const res = await supertest(buildApp())
        .get("/api/auth/providers")
        .set("Host", "sheet.example:8080");
      expect(res.status).toBe(200);
      expect(res.body.providers).toEqual([
        {
          id: "google",
          displayName: "Google",
          startUrl: "http://sheet.example:8080/api/auth/google/start",
        },
      ]);
    });

    it("is empty when creds are absent", async () => {
      vi.stubEnv("GOOGLE_CLIENT_ID", "");
      vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
      const res = await supertest(buildApp()).get("/api/auth/providers");
      expect(res.body.providers).toEqual([]);
    });
  });

  describe("POST /auth/dev-login", () => {
    it("404s when ALLOW_DEV_LOGIN is disabled (no DB needed)", async () => {
      hoisted.devLoginEnabled = false;
      const res = await supertest(buildApp()).post("/api/auth/dev-login");
      expect(res.status).toBe(404);
    });

    it("mints a session for the dev user when enabled", async () => {
      hoisted.devLoginEnabled = true;
      devUserTouched = true;
      const res = await supertest(buildApp()).post("/api/auth/dev-login");
      expect(res.status).toBe(200);
      expect(res.body.token).toBeTruthy();
      expect(res.body.user.id).toBe(DEV_USER_ID);
      expect(res.body.user.email).toBe("dev@local.test");

      const cookies = res.headers["set-cookie"] as unknown as string[];
      expect(cookies.some((c) => c.startsWith("cs_session="))).toBe(true);

      const sessions = await prisma.authSession.count({
        where: { userId: DEV_USER_ID },
      });
      expect(sessions).toBe(1);
    });
  });

  describe("GET /auth/:provider/start", () => {
    it("302s to the authorize URL with PKCE + state and sets the tx cookie", async () => {
      const res = await supertest(buildApp()).get("/api/auth/google/start");
      expect(res.status).toBe(302);

      const url = new URL(res.headers.location);
      expect(url.origin + url.pathname).toBe(
        "https://accounts.google.com/o/oauth2/v2/auth",
      );
      expect(url.searchParams.get("code_challenge_method")).toBe("S256");
      expect(url.searchParams.get("code_challenge")).toBeTruthy();
      expect(url.searchParams.get("state")).toBeTruthy();
      expect(url.searchParams.get("response_type")).toBe("code");
      expect(url.searchParams.get("client_id")).toBe("client-abc");
      // access_type/prompt are what make Google return a refresh token.
      expect(url.searchParams.get("access_type")).toBe("offline");
      expect(url.searchParams.get("prompt")).toBe("consent");

      const cookies = res.headers["set-cookie"] as unknown as string[];
      const tx = cookies.find((c) => c.startsWith("cs_oauth_tx="));
      expect(tx).toBeTruthy();
      expect(tx).toContain("HttpOnly");
      expect(tx).toContain("SameSite=Lax");
    });

    it("404s for an unknown provider", async () => {
      const res = await supertest(buildApp()).get("/api/auth/facebook/start");
      expect(res.status).toBe(404);
    });

    it("404s for a known provider with no creds (disabled)", async () => {
      vi.stubEnv("GOOGLE_CLIENT_ID", "");
      vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
      const res = await supertest(buildApp()).get("/api/auth/google/start");
      expect(res.status).toBe(404);
    });
  });

  describe("GET /auth/:provider/callback", () => {
    it("creates User + AuthAccount + AuthSession and sets cs_session", async () => {
      TEST_SUBS.add("sub-happy");
      mockGoogleFetch({ profile: googleProfile("sub-happy") });

      const agent = supertest.agent(buildApp());
      const { state } = await beginFlow(agent);

      const res = await agent.get(
        `/api/auth/google/callback?code=auth-code&state=${state}`,
      );
      expect(res.status).toBe(302);
      const cookies = res.headers["set-cookie"] as unknown as string[];
      expect(cookies.some((c) => c.startsWith("cs_session="))).toBe(true);

      const account = await prisma.authAccount.findUnique({
        where: {
          provider_providerAccountId: {
            provider: "google",
            providerAccountId: "sub-happy",
          },
        },
        include: { user: true },
      });
      expect(account).not.toBeNull();
      expect(account?.user.email).toBe("player@example.com");
      expect(account?.accessToken).toBe("access-tok");
      expect(account?.refreshToken).toBe("refresh-tok");

      const sessions = await prisma.authSession.count({
        where: { userId: account!.userId },
      });
      expect(sessions).toBe(1);
    });

    it("reuses the same user on a second callback with the same sub", async () => {
      TEST_SUBS.add("sub-repeat");
      mockGoogleFetch({ profile: googleProfile("sub-repeat") });

      const first = supertest.agent(buildApp());
      const f = await beginFlow(first);
      await first.get(`/api/auth/google/callback?code=c1&state=${f.state}`);

      const second = supertest.agent(buildApp());
      const s = await beginFlow(second);
      await second.get(`/api/auth/google/callback?code=c2&state=${s.state}`);

      const accounts = await prisma.authAccount.findMany({
        where: { provider: "google", providerAccountId: "sub-repeat" },
      });
      expect(accounts).toHaveLength(1);
      const users = await prisma.user.count({
        where: { id: accounts[0].userId },
      });
      expect(users).toBe(1);
    });

    it("stores a null email when the provider reports it unverified", async () => {
      TEST_SUBS.add("sub-unverified");
      mockGoogleFetch({
        profile: {
          sub: "sub-unverified",
          email: "sketchy@example.com",
          email_verified: false,
          name: "Sketchy",
        },
      });

      const agent = supertest.agent(buildApp());
      const { state } = await beginFlow(agent);
      await agent.get(`/api/auth/google/callback?code=c&state=${state}`);

      const account = await prisma.authAccount.findUnique({
        where: {
          provider_providerAccountId: {
            provider: "google",
            providerAccountId: "sub-unverified",
          },
        },
        include: { user: true },
      });
      expect(account?.user.email).toBeNull();
    });

    it("400s when the state does not match the tx cookie", async () => {
      mockGoogleFetch({});
      const agent = supertest.agent(buildApp());
      await beginFlow(agent);
      const res = await agent.get(
        "/api/auth/google/callback?code=c&state=wrong-state",
      );
      expect(res.status).toBe(400);
    });

    it("400s when the tx cookie is missing entirely", async () => {
      const res = await supertest(buildApp()).get(
        "/api/auth/google/callback?code=c&state=s",
      );
      expect(res.status).toBe(400);
    });

    it("400s when the provider returns an error param", async () => {
      const agent = supertest.agent(buildApp());
      const { state } = await beginFlow(agent);
      const res = await agent.get(
        `/api/auth/google/callback?error=access_denied&state=${state}`,
      );
      expect(res.status).toBe(400);
    });

    it("502s when the token exchange is non-200", async () => {
      mockGoogleFetch({ tokenStatus: 400 });
      const agent = supertest.agent(buildApp());
      const { state } = await beginFlow(agent);
      const res = await agent.get(
        `/api/auth/google/callback?code=c&state=${state}`,
      );
      expect(res.status).toBe(502);
    });

    it("502s when the userinfo request is non-200", async () => {
      mockGoogleFetch({ userinfoStatus: 500 });
      const agent = supertest.agent(buildApp());
      const { state } = await beginFlow(agent);
      const res = await agent.get(
        `/api/auth/google/callback?code=c&state=${state}`,
      );
      expect(res.status).toBe(502);
    });

    it("502s (not 500) when the token response is a malformed 200", async () => {
      // 200 OK but the body fails tokenResponseSchema — must surface as 502, not a ZodError escaping to the 500 handler.
      mockGoogleFetch({ tokenBody: { unexpected: "shape" } });
      const agent = supertest.agent(buildApp());
      const { state } = await beginFlow(agent);
      const res = await agent.get(
        `/api/auth/google/callback?code=c&state=${state}`,
      );
      expect(res.status).toBe(502);
    });

    it("502s (not 500) when the userinfo response is a malformed 200", async () => {
      // 200 OK but missing `sub` — mapProfile's zod parse throws; must surface as 502.
      mockGoogleFetch({ profile: { email: "x@y.z", email_verified: true } });
      const agent = supertest.agent(buildApp());
      const { state } = await beginFlow(agent);
      const res = await agent.get(
        `/api/auth/google/callback?code=c&state=${state}`,
      );
      expect(res.status).toBe(502);
    });

    it("does not transfer an existing account link to a different signed-in user", async () => {
      TEST_SUBS.add("sub-link-a");
      TEST_SUBS.add("sub-link-b");

      const userA = await prisma.user.create({ data: { email: "owner-a@example.com" } });
      await prisma.authAccount.create({
        data: { userId: userA.id, provider: "google", providerAccountId: "sub-link-a" },
      });

      mockGoogleFetch({ profile: googleProfile("sub-link-b") });
      const agent = supertest.agent(buildApp());
      const b1 = await beginFlow(agent);
      await agent.get(`/api/auth/google/callback?code=c&state=${b1.state}`);

      mockGoogleFetch({ profile: googleProfile("sub-link-a") });
      const b2 = await beginFlow(agent);
      await agent.get(`/api/auth/google/callback?code=c&state=${b2.state}`);

      const account = await prisma.authAccount.findUnique({
        where: {
          provider_providerAccountId: {
            provider: "google",
            providerAccountId: "sub-link-a",
          },
        },
      });
      expect(account?.userId).toBe(userA.id);
    });
  });

  describe("GET /auth/me + POST /auth/logout", () => {
    it("401s without a session cookie", async () => {
      const res = await supertest(buildApp()).get("/api/auth/me");
      expect(res.status).toBe(401);
    });

    it("200s with the user after login, then 401s after logout", async () => {
      TEST_SUBS.add("sub-me");
      mockGoogleFetch({ profile: googleProfile("sub-me") });

      const agent = supertest.agent(buildApp());
      const { state } = await beginFlow(agent);
      await agent.get(`/api/auth/google/callback?code=c&state=${state}`);

      const me = await agent.get("/api/auth/me");
      expect(me.status).toBe(200);
      expect(me.body.user.email).toBe("player@example.com");
      expect(me.body.user.id).toBeTruthy();

      const logout = await agent.post("/api/auth/logout");
      expect(logout.status).toBe(200);
      expect(logout.body).toEqual({ ok: true });

      const after = await agent.get("/api/auth/me");
      expect(after.status).toBe(401);
    });

    it("includes preferences: null until stored, then the defaulted-merged value (#1178)", async () => {
      TEST_SUBS.add("sub-me-prefs");
      mockGoogleFetch({ profile: googleProfile("sub-me-prefs") });

      const agent = supertest.agent(buildApp());
      const { state } = await beginFlow(agent);
      await agent.get(`/api/auth/google/callback?code=c&state=${state}`);

      const before = await agent.get("/api/auth/me");
      expect(before.body.user.preferences).toBeNull();

      await prisma.user.update({
        where: { id: before.body.user.id },
        data: { preferences: { theme: "dark" } },
      });

      const after = await agent.get("/api/auth/me");
      expect(after.body.user.preferences).toEqual({
        theme: "dark",
        diceRollStyle: "animated",
        autoRollConcentration: true,
      });
    });
  });
});

function googleProfile(sub: string): Record<string, unknown> {
  return {
    sub,
    email: "player@example.com",
    email_verified: true,
    name: "Player One",
    picture: "https://img.example.com/p.png",
  };
}
