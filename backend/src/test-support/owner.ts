import { prisma } from "@/lib/core/prisma.js";

// Test-only helper. Character.ownerId is NOT NULL (issue #99), so every
// character a test creates needs an owning User row. Tests call this in their
// beforeEach and pass the returned id as `ownerId` on each character.create;
// the upsert keeps it idempotent across reruns within a file.
export async function ensureTestOwner(id: string): Promise<string> {
  await prisma.user.upsert({ where: { id }, create: { id }, update: {} });
  return id;
}
