import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";

import { AuthorizationError, NotFoundError } from "./errors.js";

// Accepts either the shared client or a $transaction callback's tx client, so a
// route can authorize inside the same transaction it mutates in.
type Db = PrismaClient | Prisma.TransactionClient;

// The single chokepoint for character access decisions. Every character-scoped
// route resolves access through this function instead of comparing ownerId at
// the call site — so character sharing (#116) has exactly one seam to widen.
//
// Today it enforces owner-only for both "view" and "edit"; the `level` param is
// the documented extension point where a future CharacterShare lookup will
// distinguish read-only collaborators from editors.
//
// Returns the minimal authorized row, or throws: 404 if the character does not
// exist (preserves the pre-auth "Character not found" behavior), 403 if it
// exists but the caller is not the owner.
export async function assertCharacterAccess(
  db: Db,
  userId: string,
  characterId: string,
  level: "view" | "edit",
): Promise<{ id: string; ownerId: string }> {
  // `level` is owner-only today (both view and edit require ownership); it is
  // the reserved seam where #116 sharing will distinguish read collaborators
  // from editors. Referenced here so the contract stays explicit at call sites.
  void level;

  const character = await db.character.findUnique({
    where: { id: characterId },
    select: { id: true, ownerId: true },
  });

  if (!character) {
    throw new NotFoundError("Character not found");
  }
  if (character.ownerId !== userId) {
    throw new AuthorizationError("You do not have access to this character");
  }
  return character;
}
