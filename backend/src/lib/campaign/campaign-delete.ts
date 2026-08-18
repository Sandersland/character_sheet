import type { Prisma } from "@/generated/prisma/client.js";

/**
 * The campaign-delete transaction body: re-checks for a session started since
 * the caller's auto-close-aware guard, collects the entity portrait keys the
 * cascade is about to orphan, and deletes the campaign row. Extracted so
 * campaigns.test.ts can pin the loser of a double-delete race directly.
 */
export async function deleteCampaignRows(
  tx: Prisma.TransactionClient,
  campaignId: string,
): Promise<{ portraitKey: string | null }[] | "activeSession"> {
  const sessionStartedMeanwhile = await tx.session.findFirst({
    where: { campaignId, status: "active" },
    select: { id: true },
  });
  if (sessionStartedMeanwhile) return "activeSession";

  const entities = await tx.campaignEntity.findMany({
    where: { campaignId, portraitKey: { not: null } },
    select: { portraitKey: true },
  });
  // deleteMany, not delete: a campaign already removed by a concurrent request
  // deletes zero rows instead of throwing P2025, keeping the loser idempotent.
  await tx.campaign.deleteMany({ where: { id: campaignId } });
  return entities;
}
