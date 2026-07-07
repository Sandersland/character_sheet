-- AlterTable
ALTER TABLE "CampaignItemConsumableDetail" ADD COLUMN     "maxUses" INTEGER,
ADD COLUMN     "usesRemaining" INTEGER;

-- AlterTable
ALTER TABLE "InventoryConsumableDetail" ADD COLUMN     "maxUses" INTEGER,
ADD COLUMN     "usesRemaining" INTEGER;

-- AlterTable
ALTER TABLE "ItemConsumableDetail" ADD COLUMN     "maxUses" INTEGER,
ADD COLUMN     "usesRemaining" INTEGER;
