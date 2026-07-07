-- CreateEnum
CREATE TYPE "ActivationType" AS ENUM ('action', 'bonus', 'reaction', 'commandWord');

-- CreateEnum
CREATE TYPE "ActivatedDuration" AS ENUM ('whileActive', 'untilRest');

-- CreateEnum
CREATE TYPE "ItemResourceKind" AS ENUM ('perRest', 'perDay', 'atWill');

-- CreateEnum
CREATE TYPE "ItemResourcePeriod" AS ENUM ('short', 'long', 'dawn', 'dusk');

-- AlterTable
ALTER TABLE "CampaignItemCapability" ADD COLUMN     "activatedDuration" "ActivatedDuration",
ADD COLUMN     "activation" "ActivationType",
ADD COLUMN     "durationText" TEXT,
ADD COLUMN     "resourceCharges" INTEGER,
ADD COLUMN     "resourceKind" "ItemResourceKind",
ADD COLUMN     "resourcePeriod" "ItemResourcePeriod";

-- AlterTable
ALTER TABLE "InventoryCapability" ADD COLUMN     "activatedDuration" "ActivatedDuration",
ADD COLUMN     "activation" "ActivationType",
ADD COLUMN     "durationText" TEXT,
ADD COLUMN     "resourceCharges" INTEGER,
ADD COLUMN     "resourceKind" "ItemResourceKind",
ADD COLUMN     "resourcePeriod" "ItemResourcePeriod";

-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN     "activatedUsesSpent" INTEGER NOT NULL DEFAULT 0;
