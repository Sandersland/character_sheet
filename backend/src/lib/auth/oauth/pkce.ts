import crypto from "node:crypto";

// OAuth-only PKCE + state primitives and the short-lived transaction cookie that
// carries {provider, state, verifier} across the redirect to the provider and
// back. Distinct from the session cookie/lifecycle (../session.js) — a
// password/magic-link method would never touch any of this.

// Short-lived transaction cookie name. `cs_` = character-sheet namespace.
export const OAUTH_TX_COOKIE = "cs_oauth_tx";

// 10 minutes is ample for a consent screen.
export const OAUTH_TX_TTL_SECONDS = 600;

// Anti-CSRF state token.
export function randomState(): string {
  return crypto.randomBytes(16).toString("base64url");
}

// PKCE code verifier (RFC 7636): 32 random bytes, base64url.
export function createVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}

// PKCE S256 code challenge: base64url(SHA-256(verifier)). Deterministic.
export function challengeFromVerifier(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}
