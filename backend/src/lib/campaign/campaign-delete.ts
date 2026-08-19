import type { Prisma } from "@/generated/prisma/client.js";

/**
 * The campaign-delete transaction body — extracted so the double-delete
 * loser's already-gone path is directly testable.
 */
export async function deleteCampaignRows(
  tx: Prisma.TransactionClient,
  campaignId: string,
): Promise<{ portraitKey: string | null }[] | "activeSession"> {
  // Serializes against startCampaignSession (#1888 pattern): its session
  // insert holds a KEY SHARE lock on this row, so acquiring FOR UPDATE first
  // means the re-check below sees any session committed meanwhile instead of
  // the cascade silently killing it.
  await tx.$queryRaw`SELECT id FROM "Campaign" WHERE id = ${campaignId} FOR UPDATE`;

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
