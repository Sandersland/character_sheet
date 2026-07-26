import { Prisma } from "@/generated/prisma/client.js";

/**
 * The attach write itself (#1286): sets campaignId only. Extracted out of the
 * route handler so a regression pin can call it directly — bypassing the
 * route's edition-mismatch guard entirely — and prove rulesEdition is never
 * part of this write, even for a mismatched pair the guard would otherwise
 * reject before this ever runs (see campaign-attach.test.ts).
 *
 * The conditional WHERE guards a TOCTOU race: only a null or same-campaign FK
 * matches, so a different-campaign attach matches nothing (count 0) and a
 * same-campaign re-attach is a no-op success.
 */
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
