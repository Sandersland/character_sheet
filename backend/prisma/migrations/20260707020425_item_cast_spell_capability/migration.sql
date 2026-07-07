-- CreateEnum
CREATE TYPE "CapabilityCastResource" AS ENUM ('perRestShort', 'perRestLong', 'perDayDawn', 'perDayDusk', 'atWill');

-- CreateEnum
CREATE TYPE "CapabilityCastStatMode" AS ENUM ('fixed', 'wielder');

-- AlterTable
ALTER TABLE "CampaignItemCapability" ADD COLUMN     "attackMode" "CapabilityCastStatMode",
ADD COLUMN     "attackValue" INTEGER,
ADD COLUMN     "castConcentration" BOOLEAN,
ADD COLUMN     "castLevel" INTEGER,
ADD COLUMN     "castResource" "CapabilityCastResource",
ADD COLUMN     "castUses" INTEGER,
ADD COLUMN     "dcMode" "CapabilityCastStatMode",
ADD COLUMN     "dcValue" INTEGER,
ADD COLUMN     "spellId" TEXT,
ADD COLUMN     "spellLevel" INTEGER,
ADD COLUMN     "spellName" TEXT;

-- AlterTable
ALTER TABLE "InventoryCapability" ADD COLUMN     "attackMode" "CapabilityCastStatMode",
ADD COLUMN     "attackValue" INTEGER,
ADD COLUMN     "castConcentration" BOOLEAN,
ADD COLUMN     "castLevel" INTEGER,
ADD COLUMN     "castResource" "CapabilityCastResource",
ADD COLUMN     "castUses" INTEGER,
ADD COLUMN     "dcMode" "CapabilityCastStatMode",
ADD COLUMN     "dcValue" INTEGER,
ADD COLUMN     "spellId" TEXT,
ADD COLUMN     "spellLevel" INTEGER,
ADD COLUMN     "spellName" TEXT,
ADD COLUMN     "used" INTEGER NOT NULL DEFAULT 0;
