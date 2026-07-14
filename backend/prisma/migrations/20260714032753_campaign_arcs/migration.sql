-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "arcId" TEXT;

-- CreateTable
CREATE TABLE "CampaignArc" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignArc_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CampaignArc_campaignId_position_idx" ON "CampaignArc"("campaignId", "position");

-- CreateIndex
CREATE INDEX "Session_arcId_idx" ON "Session"("arcId");

-- AddForeignKey
ALTER TABLE "CampaignArc" ADD CONSTRAINT "CampaignArc_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_arcId_fkey" FOREIGN KEY ("arcId") REFERENCES "CampaignArc"("id") ON DELETE SET NULL ON UPDATE CASCADE;
