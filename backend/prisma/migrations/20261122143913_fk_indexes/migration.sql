-- (#1571) The Spell_catalogEntryId_fkey DropForeignKey `prisma migrate dev` generates here is stripped on purpose, same as 20260901013946_effect_instances: that FK is hand-written onto a deliberately relationless scalar.

-- CreateIndex
CREATE INDEX "CampaignMembership_userId_idx" ON "CampaignMembership"("userId");

-- CreateIndex
CREATE INDEX "CharacterClassEntry_characterId_idx" ON "CharacterClassEntry"("characterId");

-- CreateIndex
CREATE INDEX "CharacterEvent_batchId_idx" ON "CharacterEvent"("batchId");

-- CreateIndex
CREATE INDEX "InventoryItem_characterId_idx" ON "InventoryItem"("characterId");

-- CreateIndex
CREATE INDEX "InventoryItem_itemId_idx" ON "InventoryItem"("itemId");
