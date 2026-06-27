import crypto from "node:crypto";

import { z } from "zod";

import { appRedirectUri } from "../../config.js";
import type { AuthProvider, NormalizedProfile } from "./types.js";

// The provider-agnostic OAuth 2.0 authorization-code + PKCE flow: build the
// authorize URL, round-trip the state/verifier through a transaction cookie,
// exchange the code for tokens, and fetch + normalize the userinfo profile.

// ── OAuth transaction (state/PKCE) cookie codec ──────────────────────────────

const oauthTxSchema = z.object({
  provider: z.string().min(1),
  state: z.string().min(1),
  verifier: z.string().min(1),
});
export type OAuthTx = z.infer<typeof oauthTxSchema>;

export function encodeTx(tx: OAuthTx): string {
  return Buffer.from(JSON.stringify(tx), "utf8").toString("base64url");
}

export function decodeTx(raw: string | undefined): OAuthTx | null {
  if (!raw) return null;
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    return oauthTxSchema.parse(JSON.parse(json));
  } catch {
    return null;
  }
}

// Constant-time string compare (guards against state-token timing oracles).
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// ── Authorize URL ────────────────────────────────────────────────────────────

// Build the provider authorize URL for a start request.
export function buildAuthorizeUrl(
  provider: AuthProvider,
  params: { state: string; challenge: string },
): string {
  const url = new URL(provider.authUrl);
  url.search = new URLSearchParams({
    client_id: provider.clientId ?? "",
    redirect_uri: appRedirectUri(provider.id),
    response_type: "code",
    scope: provider.scopes.join(" "),
    state: params.state,
    code_challenge: params.challenge,
    code_challenge_method: "S256",
    access_type: "offline",
    prompt: "consent",
  }).toString();
  return url.toString();
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
export type TokenResponse = z.infer<typeof tokenResponseSchema>;

export interface TokenColumns {
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
  tokenType: string | null;
  scope: string | null;
  idToken: string | null;
}

export function tokenColumns(token: TokenResponse): TokenColumns {
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
export async function exchangeCode(
  provider: AuthProvider,
  code: string,
  verifier: string,
): Promise<TokenResponse | null> {
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
export async function fetchProfile(
  provider: AuthProvider,
  accessToken: string,
): Promise<NormalizedProfile | null> {
  const response = await fetch(provider.userInfoUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return null;
  return provider.mapProfile(await response.json());
}
