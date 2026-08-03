import { prisma } from "@/lib/core/prisma.js";
import { createBlobStore } from "@/lib/storage/index.js";

// The two persistence touchpoints portraitRouter and the character-delete
// route share (#1615): reading the stored blob key, and best-effort blob
// cleanup. One home so the routes can't drift on either.

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

// Best-effort removal of a superseded/orphaned blob. delete() is idempotent
// over missing keys by the BlobStore contract, so anything thrown here is an
// infrastructure hiccup — the DB is already consistent and an orphaned blob
// is harmless, so it never fails the request.
export async function deletePortraitBlobBestEffort(key: string | null): Promise<void> {
  if (!key) return;
  try {
    await createBlobStore().delete(key);
  } catch {
    /* orphaned blob accepted */
  }
}
