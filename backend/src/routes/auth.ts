import crypto from "node:crypto";

import { Router } from "express";
import type { Response } from "express";
import { z } from "zod";

import { appRedirectUri, config } from "../lib/config.js";
import { enabledProviders, getProvider } from "../lib/auth/providers/index.js";
import type {
  AuthProvider,
  NormalizedProfile,
} from "../lib/auth/providers/index.js";
import {
  createSession,
  createVerifier,
  challengeFromVerifier,
  destroySession,
  getCookie,
  lookupSession,
  OAUTH_TX_COOKIE,
  randomState,
  SESSION_COOKIE,
  serializeCookie,
} from "../lib/auth/session.js";
import { prisma } from "../lib/prisma.js";

// Hand-rolled OAuth 2.0 + PKCE sign-in. This is the auth MECHANISM only:
// per-route read/write enforcement (requireAuth) is deferred to #101, so every
// endpoint here is public. Handlers stay thin — guard with early returns and
// let unexpected throws reach the terminal errorHandler.

export const authRouter = Router();

// Short-lived transaction cookie holding {provider, state, verifier} across the
// redirect to the provider and back. 10 minutes is ample for a consent screen.
const OAUTH_TX_TTL_SECONDS = 600;

// ── Set-Cookie helpers ───────────────────────────────────────────────────────

function setCookie(
  res: Response,
  name: string,
  value: string,
  maxAgeSeconds: number,
): void {
  res.append("Set-Cookie", serializeCookie(name, value, { maxAgeSeconds }));
}

function clearCookie(res: Response, name: string): void {
  res.append("Set-Cookie", serializeCookie(name, "", { maxAgeSeconds: 0 }));
}

// ── OAuth transaction (state/PKCE) cookie codec ──────────────────────────────

const oauthTxSchema = z.object({
  provider: z.string().min(1),
  state: z.string().min(1),
  verifier: z.string().min(1),
});
type OAuthTx = z.infer<typeof oauthTxSchema>;

function encodeTx(tx: OAuthTx): string {
  return Buffer.from(JSON.stringify(tx), "utf8").toString("base64url");
}

function decodeTx(raw: string | undefined): OAuthTx | null {
  if (!raw) return null;
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    return oauthTxSchema.parse(JSON.parse(json));
  } catch {
    return null;
  }
}

// Constant-time string compare (guards against state-token timing oracles).
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// ── Token-exchange / userinfo response shapes ────────────────────────────────

const tokenResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.string().optional(),
  expires_in: z.number().optional(),
  refresh_token: z.string().optional(),
  scope: z.string().optional(),
  id_token: z.string().optional(),
});

interface TokenColumns {
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
  tokenType: string | null;
  scope: string | null;
  idToken: string | null;
}

function tokenColumns(token: z.infer<typeof tokenResponseSchema>): TokenColumns {
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? null,
    // Store an absolute epoch-seconds expiry so callers don't have to remember
    // when the row was written.
    expiresAt: token.expires_in ? Math.floor(Date.now() / 1000) + token.expires_in : null,
    tokenType: token.token_type ?? null,
    scope: token.scope ?? null,
    idToken: token.id_token ?? null,
  };
}

// Exchange the authorization code for tokens (PKCE: code_verifier, no secret in
// the URL). Returns null on any non-200 so the caller can answer 502.
async function exchangeCode(
  provider: AuthProvider,
  code: string,
  verifier: string,
): Promise<z.infer<typeof tokenResponseSchema> | null> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: appRedirectUri(provider.id),
    client_id: provider.clientId ?? "",
    client_secret: provider.clientSecret ?? "",
    code_verifier: verifier,
  });

  const response = await fetch(provider.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!response.ok) return null;
  return tokenResponseSchema.parse(await response.json());
}

// Fetch the provider's userinfo and normalize it. Returns null on a non-200.
async function fetchProfile(
  provider: AuthProvider,
  accessToken: string,
): Promise<NormalizedProfile | null> {
  const response = await fetch(provider.userInfoUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return null;
  return provider.mapProfile(await response.json());
}

// Resolve the user this callback should authenticate, and persist the account.
//   - Signed in: link the provider account to the current user, but only when
//     the email is verified (mapProfile already nulled an unverified email).
//     The session stays on the current user either way.
//   - Not signed in: upsert by (provider, providerAccountId) ONLY — never merge
//     by email — minting a fresh User on first sight.
// Tokens are refreshed on every callback.
async function resolveUserId(
  provider: AuthProvider,
  profile: NormalizedProfile,
  tokens: TokenColumns,
  currentUserId: string | null,
): Promise<string> {
  if (currentUserId) {
    if (profile.email !== null) {
      await prisma.authAccount.upsert({
        where: {
          provider_providerAccountId: {
            provider: provider.id,
            providerAccountId: profile.providerAccountId,
          },
        },
        create: {
          userId: currentUserId,
          provider: provider.id,
          providerAccountId: profile.providerAccountId,
          ...tokens,
        },
        update: { userId: currentUserId, ...tokens },
      });
    }
    return currentUserId;
  }

  const account = await prisma.authAccount.upsert({
    where: {
      provider_providerAccountId: {
        provider: provider.id,
        providerAccountId: profile.providerAccountId,
      },
    },
    create: {
      provider: provider.id,
      providerAccountId: profile.providerAccountId,
      ...tokens,
      user: {
        create: {
          email: profile.email,
          name: profile.name,
          imageUrl: profile.imageUrl,
        },
      },
    },
    update: tokens,
  });
  return account.userId;
}

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

  const authorizeUrl = new URL(provider.authUrl);
  authorizeUrl.search = new URLSearchParams({
    client_id: provider.clientId ?? "",
    redirect_uri: appRedirectUri(provider.id),
    response_type: "code",
    scope: provider.scopes.join(" "),
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    access_type: "offline",
    prompt: "consent",
  }).toString();

  res.redirect(302, authorizeUrl.toString());
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
  setCookie(res, SESSION_COOKIE, sessionToken, 30 * 24 * 60 * 60);

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
