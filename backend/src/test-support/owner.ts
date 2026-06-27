import { prisma } from "../lib/prisma.js";

// Test-only helper. Character.ownerId is NOT NULL (issue #99), so every
// character a test creates needs an owning User row. Tests call this in their
// beforeEach with a per-file id and pass the returned id as `ownerId` on each
// character.create.
//
// A distinct id per test file avoids cross-file races on the shared dev
// database (vitest runs files in parallel); the upsert keeps it idempotent
// across reruns within a file.
export async function ensureTestOwner(id: string): Promise<string> {
  await prisma.user.upsert({ where: { id }, create: { id }, update: {} });
  return id;
}
