import { Router } from "express";

import { config } from "../lib/config.js";
import { clearCookie, getCookie, setCookie } from "../lib/auth/cookies.js";
import {
  createSession,
  destroySession,
  lookupSession,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
} from "../lib/auth/session.js";
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
} from "../lib/auth/oauth/index.js";

// Hand-rolled OAuth 2.0 + PKCE sign-in. This is the auth MECHANISM only:
// per-route read/write enforcement (requireAuth) is deferred to #101, so every
// endpoint here is public. Handlers stay thin — they wire HTTP to the OAuth
// method (lib/auth/oauth) + session/cookie helpers, guarding with early returns
// and letting unexpected throws reach the terminal errorHandler.

export const authRouter = Router();

// ── GET /api/auth/providers ──────────────────────────────────────────────────
// List the sign-in providers this deployment has configured.

authRouter.get("/auth/providers", (_req, res) => {
  const providers = enabledProviders().map((provider) => ({
    id: provider.id,
    displayName: provider.displayName,
    startUrl: `${config.APP_BASE_URL}/api/auth/${provider.id}/start`,
  }));
  res.json({ providers });
});

// ── GET /api/auth/:provider/start ────────────────────────────────────────────
// Begin the OAuth dance: stash state+PKCE in a short-lived cookie, 302 to the
// provider's authorize endpoint.

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

// ── GET /api/auth/:provider/callback ─────────────────────────────────────────
// Provider redirects back here with ?code&state (or ?error). Verify, exchange,
// resolve the user, and mint a session.

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

  res.redirect(302, config.APP_BASE_URL);
});

// ── POST /api/auth/logout ────────────────────────────────────────────────────

authRouter.post("/auth/logout", async (req, res) => {
  await destroySession(getCookie(req, SESSION_COOKIE) ?? "");
  clearCookie(res, SESSION_COOKIE);
  res.json({ ok: true });
});

// ── GET /api/auth/me ─────────────────────────────────────────────────────────

authRouter.get("/auth/me", async (req, res) => {
  const user = await lookupSession(getCookie(req, SESSION_COOKIE) ?? "");
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  res.json({ user });
});
