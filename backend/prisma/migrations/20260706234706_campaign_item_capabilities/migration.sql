-- CreateEnum
CREATE TYPE "CapabilityKind" AS ENUM ('passiveBonus', 'castSpell', 'charges', 'grant', 'activatedEffect');

-- CreateEnum
CREATE TYPE "CapabilityTarget" AS ENUM ('ac', 'attack', 'damage', 'save', 'skill', 'abilityScore', 'spellAttack', 'spellDc', 'initiative', 'speed', 'maxHp');

-- CreateEnum
CREATE TYPE "CapabilityOp" AS ENUM ('add', 'setTo');

-- CreateEnum
CREATE TYPE "AttunementPrereqKind" AS ENUM ('class', 'spellcaster', 'species', 'alignment');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CharacterEventType" ADD VALUE 'attuned';
ALTER TYPE "CharacterEventType" ADD VALUE 'unattuned';

-- AlterTable
ALTER TABLE "CampaignItem" ADD COLUMN     "attunementPrereqKind" "AttunementPrereqKind",
ADD COLUMN     "attunementPrereqValue" TEXT;

-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN     "attuned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "attunementPrereqKind" "AttunementPrereqKind",
ADD COLUMN     "attunementPrereqValue" TEXT;

-- CreateTable
CREATE TABLE "CampaignItemCapability" (
    "id" TEXT NOT NULL,
    "campaignItemId" TEXT NOT NULL,
    "kind" "CapabilityKind" NOT NULL,
    "description" TEXT,
    "target" "CapabilityTarget",
    "op" "CapabilityOp",
    "value" INTEGER,
    "targetKey" TEXT,
    "condition" TEXT,
    "valueDiceCount" INTEGER,
    "valueDiceFaces" INTEGER,
    "valueDamageType" TEXT,

    CONSTRAINT "CampaignItemCapability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryCapability" (
    "id" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "kind" "CapabilityKind" NOT NULL,
    "description" TEXT,
    "target" "CapabilityTarget",
    "op" "CapabilityOp",
    "value" INTEGER,
    "targetKey" TEXT,
    "condition" TEXT,
    "valueDiceCount" INTEGER,
    "valueDiceFaces" INTEGER,
    "valueDamageType" TEXT,

    CONSTRAINT "InventoryCapability_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CampaignItemCapability_campaignItemId_idx" ON "CampaignItemCapability"("campaignItemId");

-- CreateIndex
CREATE INDEX "InventoryCapability_inventoryItemId_idx" ON "InventoryCapability"("inventoryItemId");

-- AddForeignKey
ALTER TABLE "CampaignItemCapability" ADD CONSTRAINT "CampaignItemCapability_campaignItemId_fkey" FOREIGN KEY ("campaignItemId") REFERENCES "CampaignItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCapability" ADD CONSTRAINT "InventoryCapability_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
