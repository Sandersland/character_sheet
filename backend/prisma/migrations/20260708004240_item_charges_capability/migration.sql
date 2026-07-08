-- AlterEnum
ALTER TYPE "CapabilityCastResource" ADD VALUE 'charges';

-- AlterEnum
ALTER TYPE "ItemResourceKind" ADD VALUE 'charges';

-- AlterTable
ALTER TABLE "CampaignItemCapability" ADD COLUMN     "chargeCost" INTEGER,
ADD COLUMN     "maxCharges" INTEGER,
ADD COLUMN     "rechargeBonus" INTEGER,
ADD COLUMN     "rechargeDiceCount" INTEGER,
ADD COLUMN     "rechargeDiceFaces" INTEGER,
ADD COLUMN     "rechargeTrigger" "ItemResourcePeriod";

-- AlterTable
ALTER TABLE "InventoryCapability" ADD COLUMN     "chargeCost" INTEGER,
ADD COLUMN     "maxCharges" INTEGER,
ADD COLUMN     "rechargeBonus" INTEGER,
ADD COLUMN     "rechargeDiceCount" INTEGER,
ADD COLUMN     "rechargeDiceFaces" INTEGER,
ADD COLUMN     "rechargeTrigger" "ItemResourcePeriod";
