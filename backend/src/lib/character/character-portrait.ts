import { prisma } from "@/lib/core/prisma.js";

// The persistence touchpoint portraitRouter and the character-delete route
// share (#1615): reading the stored blob key. One home so the routes can't
// drift on it. Blob cleanup itself is key-agnostic and lives in
// deletePortraitBlobBestEffort, shared with the entity pipeline (#1617).

// Throws Prisma's record-not-found (→ 404 via errorHandler) for an unknown
// character — callers run assertCharacterAccess first, so that only fires on
// a delete race.
export async function storedPortraitKey(characterId: string): Promise<string | null> {
  const { portraitKey } = await prisma.character.findUniqueOrThrow({
    where: { id: characterId },
    select: { portraitKey: true },
  });
  return portraitKey;
}
