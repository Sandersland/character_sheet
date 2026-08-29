import { Prisma } from "@/generated/prisma/client.js";

// TOCTOU guard: the WHERE only matches a null or same-campaign FK, so a different-campaign attach matches nothing and a same-campaign re-attach no-ops instead of racing.
export async function attachCharacterUpdate(
  tx: Prisma.TransactionClient,
  characterId: string,
  campaignId: string,
): Promise<{ count: number }> {
  return tx.character.updateMany({
    where: { id: characterId, OR: [{ campaignId: null }, { campaignId }] },
    data: { campaignId },
  });
}
