-- AlterTable
ALTER TABLE "CampaignItemCapability" ADD COLUMN     "cantBeSurprised" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "grantOn" TEXT,
ADD COLUMN     "grantType" TEXT,
ADD COLUMN     "grantValue" TEXT,
ADD COLUMN     "grantValueKind" TEXT;

-- AlterTable
ALTER TABLE "InventoryCapability" ADD COLUMN     "cantBeSurprised" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "grantOn" TEXT,
ADD COLUMN     "grantType" TEXT,
ADD COLUMN     "grantValue" TEXT,
ADD COLUMN     "grantValueKind" TEXT;
