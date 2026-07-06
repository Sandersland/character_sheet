-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN     "campaignItemId" TEXT;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_campaignItemId_fkey" FOREIGN KEY ("campaignItemId") REFERENCES "CampaignItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
