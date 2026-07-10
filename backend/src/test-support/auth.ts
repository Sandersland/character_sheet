import { prisma } from "@/lib/core/prisma.js";
import { SESSION_COOKIE } from "@/lib/auth/session.js";

// Test-only helper. Once requireAuth gates every protected /api route, route
// tests must present a valid session cookie. This upserts the owning User and a
// deterministic, long-lived AuthSession for it, then returns the Cookie header
// value (`cs_session=<token>`) tests attach to their requests.
//
// Deterministic token id per owner + upsert = idempotent across reruns (no
// session-row accumulation) and safe under parallel test files (distinct owner
// ids per file, same rule as ensureTestOwner).
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
