-- CreateTable
CREATE TABLE "CampaignCharacterPreference" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "shareWithDm" BOOLEAN NOT NULL DEFAULT false,
    "autoFriendlyHealing" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignCharacterPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CampaignCharacterPreference_characterId_idx" ON "CampaignCharacterPreference"("characterId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignCharacterPreference_campaignId_characterId_key" ON "CampaignCharacterPreference"("campaignId", "characterId");

-- AddForeignKey
ALTER TABLE "CampaignCharacterPreference" ADD CONSTRAINT "CampaignCharacterPreference_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignCharacterPreference" ADD CONSTRAINT "CampaignCharacterPreference_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;
