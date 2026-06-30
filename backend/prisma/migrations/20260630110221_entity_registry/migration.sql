-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('NPC', 'LOCATION', 'FACTION', 'ITEM', 'PC', 'OTHER');

-- CreateTable
CREATE TABLE "CampaignEntity" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "type" "EntityType" NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignEntity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntryRef" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,

    CONSTRAINT "JournalEntryRef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignCharacterLink" (
    "id" TEXT NOT NULL,
    "campaignEntityId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,

    CONSTRAINT "CampaignCharacterLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CampaignEntity_campaignId_type_idx" ON "CampaignEntity"("campaignId", "type");

-- CreateIndex
CREATE INDEX "JournalEntryRef_entityId_idx" ON "JournalEntryRef"("entityId");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntryRef_entryId_entityId_key" ON "JournalEntryRef"("entryId", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignCharacterLink_campaignEntityId_key" ON "CampaignCharacterLink"("campaignEntityId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignCharacterLink_characterId_key" ON "CampaignCharacterLink"("characterId");

-- AddForeignKey
ALTER TABLE "CampaignEntity" ADD CONSTRAINT "CampaignEntity_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntryRef" ADD CONSTRAINT "JournalEntryRef_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "JournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntryRef" ADD CONSTRAINT "JournalEntryRef_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "CampaignEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignCharacterLink" ADD CONSTRAINT "CampaignCharacterLink_campaignEntityId_fkey" FOREIGN KEY ("campaignEntityId") REFERENCES "CampaignEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignCharacterLink" ADD CONSTRAINT "CampaignCharacterLink_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;
