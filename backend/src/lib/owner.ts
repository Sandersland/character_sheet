import { prisma } from "./prisma.js";

// Resolves the User id that should own a newly created character.
//
// This is a *placeholder* for real authentication (#100 adds OAuth/session
// sign-in; #101 enforces per-owner read/write). Today the app is single-player,
// so every character resolves to one "bootstrap" owner:
//
//   - If BOOTSTRAP_OWNER_EMAIL is set, upsert a user with that email and use
//     it — lets a deployment pin ownership to a known identity ahead of #100.
//   - Otherwise reuse the earliest existing User, or mint a single emailless
//     one if none exist yet (mirrors the migration's backfill user).
//
// Idempotent: repeated calls return the same id and never create duplicates.
// MUST NOT throw when BOOTSTRAP_OWNER_EMAIL is unset — an unconfigured
// single-player instance has to keep working.
export async function resolveBootstrapOwnerId(): Promise<string> {
  const email = process.env.BOOTSTRAP_OWNER_EMAIL?.trim();

  if (email) {
    const user = await prisma.user.upsert({
      where: { email },
      create: { email },
      update: {},
    });
    return user.id;
  }

  // No configured email: reuse the earliest user so concurrent/repeated
  // creates all converge on one owner. createdAt asc, id asc as a stable
  // tiebreaker (matches the backfill migration's ORDER BY).
  const existing = await prisma.user.findFirst({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  if (existing) return existing.id;

  const created = await prisma.user.create({ data: {} });
  return created.id;
}
