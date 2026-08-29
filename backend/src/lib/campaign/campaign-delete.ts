import type { Prisma } from "@/generated/prisma/client.js";

export async function deleteCampaignRows(
  tx: Prisma.TransactionClient,
  campaignId: string,
): Promise<{ portraitKey: string | null }[] | "activeSession"> {
  // FOR UPDATE serializes against startCampaignSession's KEY SHARE lock (#1888 pattern), so the re-check below sees any session committed meanwhile.
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
  // deleteMany, not delete: a concurrently-removed campaign deletes zero rows instead of throwing P2025, keeping the loser idempotent.
  await tx.campaign.deleteMany({ where: { id: campaignId } });
  return entities;
}
