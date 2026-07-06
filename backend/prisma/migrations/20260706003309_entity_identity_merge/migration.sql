-- CreateEnum
CREATE TYPE "MergeStatus" AS ENUM ('PREPARED', 'EXECUTED');

-- CreateTable
CREATE TABLE "CampaignEntityMerge" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "mergedEntityId" TEXT NOT NULL,
    "survivorEntityId" TEXT NOT NULL,
    "status" "MergeStatus" NOT NULL DEFAULT 'PREPARED',
    "note" TEXT,
    "preparedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "executedAt" TIMESTAMP(3),

    CONSTRAINT "CampaignEntityMerge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CampaignEntityMerge_mergedEntityId_key" ON "CampaignEntityMerge"("mergedEntityId");

-- CreateIndex
CREATE INDEX "CampaignEntityMerge_campaignId_idx" ON "CampaignEntityMerge"("campaignId");

-- CreateIndex
CREATE INDEX "CampaignEntityMerge_survivorEntityId_idx" ON "CampaignEntityMerge"("survivorEntityId");

-- AddForeignKey
ALTER TABLE "CampaignEntityMerge" ADD CONSTRAINT "CampaignEntityMerge_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignEntityMerge" ADD CONSTRAINT "CampaignEntityMerge_mergedEntityId_fkey" FOREIGN KEY ("mergedEntityId") REFERENCES "CampaignEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignEntityMerge" ADD CONSTRAINT "CampaignEntityMerge_survivorEntityId_fkey" FOREIGN KEY ("survivorEntityId") REFERENCES "CampaignEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
