import crypto from "node:crypto";

import { prisma } from "@/lib/core/prisma.js";
import { resolvePreferences, type ResolvedPreferences } from "@/lib/preferences/preferences.js";

export const SESSION_COOKIE = "cs_session";

// Exposed in seconds for the Set-Cookie Max-Age.
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const SESSION_TTL_MS = SESSION_TTL_SECONDS * 1000;

export interface SessionUser {
  id: string;
  email: string | null;
  name: string | null;
  imageUrl: string | null;
  // #1178: null = this account has never stored preferences — see resolvePreferences for why that's distinct from "stored defaults".
  preferences: ResolvedPreferences | null;
}

// The token is the AuthSession primary key — the schema gives `id` no default precisely so we store this opaque value verbatim.
export async function createSession(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.authSession.create({ data: { id: token, userId, expiresAt } });
  return token;
}

// An expired token's row is deleted best-effort as a side effect.
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
    preferences: resolvePreferences(session.user.preferences),
  };
}

// deleteMany so an already-absent token is a no-op rather than a throw.
export async function destroySession(token: string): Promise<void> {
  if (!token) return;
  await prisma.authSession.deleteMany({ where: { id: token } });
}
