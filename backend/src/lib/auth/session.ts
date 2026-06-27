import crypto from "node:crypto";

import type { Request } from "express";

import { config } from "../config.js";
import { prisma } from "../prisma.js";

// Opaque server-side sessions + the low-level cookie/PKCE primitives the auth
// router builds on. No cookie-parser dependency — cookies are parsed/serialized
// by hand so the only state on the client is two opaque, HttpOnly tokens.

// Cookie names. `cs_` = character-sheet namespace.
export const SESSION_COOKIE = "cs_session";
export const OAUTH_TX_COOKIE = "cs_oauth_tx";

// 30-day session lifetime.
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface SessionUser {
  id: string;
  email: string | null;
  name: string | null;
  imageUrl: string | null;
}

// ── Session lifecycle ────────────────────────────────────────────────────────

// Mint a new session. The token is the AuthSession primary key (the schema
// gives `id` no default precisely so we store this opaque value verbatim).
export async function createSession(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.authSession.create({ data: { id: token, userId, expiresAt } });
  return token;
}

// Resolve a session token to its user, or null if the token is unknown or
// expired. Expired rows are deleted best-effort (never throws on the cleanup).
export async function lookupSession(token: string): Promise<SessionUser | null> {
  if (!token) return null;

  const session = await prisma.authSession.findUnique({
    where: { id: token },
    include: { user: true },
  });
  if (!session) return null;

  if (session.expiresAt.getTime() <= Date.now()) {
    await destroySession(token);
    return null;
  }

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    imageUrl: session.user.imageUrl,
  };
}

// Delete a session (logout). deleteMany so an already-absent token is a no-op
// rather than a throw.
export async function destroySession(token: string): Promise<void> {
  if (!token) return;
  await prisma.authSession.deleteMany({ where: { id: token } });
}

// ── Cookie helpers ───────────────────────────────────────────────────────────

// Parse a raw Cookie header into a name→value map. Tolerates missing header,
// stray whitespace, empty segments, and values containing "=".
export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;

  for (const segment of header.split(";")) {
    const eq = segment.indexOf("=");
    if (eq < 0) continue;
    const name = segment.slice(0, eq).trim();
    if (!name) continue;
    const value = segment.slice(eq + 1).trim();
    out[name] = decodeURIComponent(value);
  }
  return out;
}

export function getCookie(req: Request, name: string): string | undefined {
  return parseCookies(req.headers.cookie)[name];
}

export interface CookieOptions {
  maxAgeSeconds?: number;
  // Defaults to config.SESSION_COOKIE_SECURE; pass explicitly to override.
  secure?: boolean;
}

// Serialize a Set-Cookie value. Always HttpOnly + SameSite=Lax + Path=/. Secure
// follows config unless overridden. A maxAge of 0 expires the cookie (clear).
export function serializeCookie(
  name: string,
  value: string,
  options: CookieOptions = {},
): string {
  const secure = options.secure ?? config.SESSION_COOKIE_SECURE;
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
  ];
  if (options.maxAgeSeconds !== undefined) {
    parts.push(`Max-Age=${options.maxAgeSeconds}`);
  }
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

// ── State + PKCE primitives ──────────────────────────────────────────────────

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
