import { prisma } from "@/lib/core/prisma.js";
import { SESSION_COOKIE } from "@/lib/auth/session.js";

// Deterministic token id per owner + upsert = idempotent across reruns, so a file's repeated beforeEach doesn't accumulate session rows.
export async function authCookie(ownerId: string): Promise<string> {
  await prisma.user.upsert({ where: { id: ownerId }, create: { id: ownerId }, update: {} });

  const token = `test-session-${ownerId}`;
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await prisma.authSession.upsert({
    where: { id: token },
    create: { id: token, userId: ownerId, expiresAt },
    update: { expiresAt },
  });

  return `${SESSION_COOKIE}=${token}`;
}
