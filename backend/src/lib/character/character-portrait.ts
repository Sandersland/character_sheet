import { prisma } from "@/lib/core/prisma.js";

// Throws Prisma's record-not-found (404 via errorHandler) for an unknown character — callers run assertCharacterAccess first, so this only fires on a delete race.
export async function storedPortraitKey(characterId: string): Promise<string | null> {
  const { portraitKey } = await prisma.character.findUniqueOrThrow({
    where: { id: characterId },
    select: { portraitKey: true },
  });
  return portraitKey;
}
