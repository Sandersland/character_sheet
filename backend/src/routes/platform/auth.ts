import { Router } from "express";
import type { Request } from "express";

import { config } from "@/lib/core/config.js";
import { prisma } from "@/lib/core/prisma.js";
import { clearCookie, getCookie, setCookie } from "@/lib/auth/cookies.js";
import { AuthenticationError } from "@/lib/auth/errors.js";
import { resolvePreferences } from "@/lib/preferences/preferences.js";
import {
  createSession,
  destroySession,
  lookupSession,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
} from "@/lib/auth/session.js";
import {
  buildAuthorizeUrl,
  challengeFromVerifier,
  createVerifier,
  decodeTx,
  enabledProviders,
  encodeTx,
  exchangeCode,
  fetchProfile,
  getProvider,
  OAUTH_TX_COOKIE,
  OAUTH_TX_TTL_SECONDS,
  randomState,
  resolveUserId,
  safeEqual,
  tokenColumns,
} from "@/lib/auth/oauth/index.js";

// This is the auth mechanism only: per-route read/write enforcement (requireAuth) is separate, so every endpoint here is public.

export const authRouter = Router();

// Used for user-facing redirects only — never the OAuth redirect_uri, which must stay APP_BASE_URL-based to match what's registered with the provider.
function requestOrigin(req: Request): string {
  const forwardedHost = req.headers["x-forwarded-host"];
  const host =
    (typeof forwardedHost === "string" ? forwardedHost.split(",")[0].trim() : undefined) ??
    req.headers.host;
  if (!host) return config.APP_BASE_URL;

  const forwardedProto = req.headers["x-forwarded-proto"];
  const proto =
    (typeof forwardedProto === "string" ? forwardedProto.split(",")[0].trim() : undefined) ??
    req.protocol ??
    "http";
  return `${proto}://${host}`;
}

/** GET /api/auth/providers — lists the sign-in providers this deployment has configured. */
authRouter.get("/auth/providers", (req, res) => {
  const origin = requestOrigin(req);
  const providers = enabledProviders().map((provider) => ({
    id: provider.id,
    displayName: provider.displayName,
    startUrl: `${origin}/api/auth/${provider.id}/start`,
  }));
  res.json({ providers });
});

const DEV_USER = {
  id: "dev-user-local",
  email: "dev@local.test",
  name: "Dev User",
} as const;

/** POST /api/auth/dev-login — mints a session for a fixed dev user without a real provider, guarded by config.ALLOW_DEV_LOGIN; 404s like an unknown provider when disabled. */
authRouter.post("/auth/dev-login", async (_req, res) => {
  if (!config.ALLOW_DEV_LOGIN) {
    res.status(404).json({ error: "Unknown or disabled provider" });
    return;
  }

  const user = await prisma.user.upsert({
    where: { id: DEV_USER.id },
    create: { id: DEV_USER.id, email: DEV_USER.email, name: DEV_USER.name },
    update: { email: DEV_USER.email, name: DEV_USER.name },
  });

  const token = await createSession(user.id);
  setCookie(res, SESSION_COOKIE, token, SESSION_TTL_SECONDS);
  // Reshaped to the same SessionUser contract /auth/me returns (resolved preferences, not the raw Json column).
  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      imageUrl: user.imageUrl,
      preferences: resolvePreferences(user.preferences),
    },
  });
});

/** GET /api/auth/:provider/start — stashes state+PKCE in a short-lived cookie, then 302s to the provider's authorize endpoint. */
authRouter.get("/auth/:provider/start", (req, res) => {
  const provider = getProvider(req.params.provider);
  if (!provider) {
    res.status(404).json({ error: "Unknown or disabled provider" });
    return;
  }

  const state = randomState();
  const verifier = createVerifier();
  const challenge = challengeFromVerifier(verifier);

  setCookie(
    res,
    OAUTH_TX_COOKIE,
    encodeTx({ provider: provider.id, state, verifier }),
    OAUTH_TX_TTL_SECONDS,
  );

  res.redirect(302, buildAuthorizeUrl(provider, { state, challenge }));
});

/** GET /api/auth/:provider/callback — verifies state, exchanges the code, resolves the user, and mints a session. */
authRouter.get("/auth/:provider/callback", async (req, res) => {
  // Read and immediately clear the transaction cookie — it's single-use.
  const tx = decodeTx(getCookie(req, OAUTH_TX_COOKIE));
  clearCookie(res, OAUTH_TX_COOKIE);

  if (!tx) {
    res.status(400).json({ error: "Missing or invalid OAuth transaction" });
    return;
  }

  const query = req.query as Record<string, string | undefined>;
  if (query.error) {
    res.status(400).json({ error: `Provider error: ${query.error}` });
    return;
  }

  const provider = getProvider(req.params.provider);
  if (!provider || provider.id !== tx.provider) {
    res.status(400).json({ error: "Provider mismatch" });
    return;
  }

  if (!query.state || !safeEqual(query.state, tx.state)) {
    res.status(400).json({ error: "Invalid state" });
    return;
  }

  if (!query.code) {
    res.status(400).json({ error: "Missing authorization code" });
    return;
  }

  const tokens = await exchangeCode(provider, query.code, tx.verifier);
  if (!tokens) {
    res.status(502).json({ error: "Token exchange failed" });
    return;
  }

  const profile = await fetchProfile(provider, tokens.access_token);
  if (!profile) {
    res.status(502).json({ error: "Failed to fetch user profile" });
    return;
  }

  // If the caller already has a valid session, this is an account-link flow.
  const existing = await lookupSession(getCookie(req, SESSION_COOKIE) ?? "");

  const userId = await resolveUserId(
    provider,
    profile,
    tokenColumns(tokens),
    existing?.id ?? null,
  );

  const sessionToken = await createSession(userId);
  setCookie(res, SESSION_COOKIE, sessionToken, SESSION_TTL_SECONDS);

  res.redirect(302, requestOrigin(req));
});

/** POST /api/auth/logout */
authRouter.post("/auth/logout", async (req, res) => {
  await destroySession(getCookie(req, SESSION_COOKIE) ?? "");
  clearCookie(res, SESSION_COOKIE);
  res.json({ ok: true });
});

/** GET /api/auth/me */
authRouter.get("/auth/me", async (req, res) => {
  const user = await lookupSession(getCookie(req, SESSION_COOKIE) ?? "");
  if (!user) {
    throw new AuthenticationError();
  }
  res.json({ user });
});
