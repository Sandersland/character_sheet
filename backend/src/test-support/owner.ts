import { prisma } from "@/lib/core/prisma.js";

// Character.ownerId is NOT NULL (#99); the upsert keeps this idempotent across reruns within a file.
export async function ensureTestOwner(id: string): Promise<string> {
  await prisma.user.upsert({ where: { id }, create: { id }, update: {} });
  return id;
}
