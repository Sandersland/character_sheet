-- CreateEnum
CREATE TYPE "ItemCategory" AS ENUM ('weapon', 'armor', 'consumable', 'gear');

-- CreateEnum
CREATE TYPE "ArmorCategory" AS ENUM ('light', 'medium', 'heavy', 'shield');

-- AlterTable
ALTER TABLE "Character" DROP COLUMN "inventory";

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "ItemCategory" NOT NULL,
    "weight" DOUBLE PRECISION,
    "cost" JSONB,
    "description" TEXT,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemWeaponDetail" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "damageDiceCount" INTEGER NOT NULL,
    "damageDiceFaces" INTEGER NOT NULL,
    "damageModifier" INTEGER NOT NULL DEFAULT 0,
    "damageType" TEXT NOT NULL,
    "versatileDiceCount" INTEGER,
    "versatileDiceFaces" INTEGER,
    "finesse" BOOLEAN NOT NULL DEFAULT false,
    "light" BOOLEAN NOT NULL DEFAULT false,
    "heavy" BOOLEAN NOT NULL DEFAULT false,
    "twoHanded" BOOLEAN NOT NULL DEFAULT false,
    "reach" BOOLEAN NOT NULL DEFAULT false,
    "thrown" BOOLEAN NOT NULL DEFAULT false,
    "ammunition" BOOLEAN NOT NULL DEFAULT false,
    "rangeNormal" INTEGER,
    "rangeLong" INTEGER,

    CONSTRAINT "ItemWeaponDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemArmorDetail" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "armorCategory" "ArmorCategory" NOT NULL,
    "baseArmorClass" INTEGER NOT NULL,
    "dexModifierApplies" BOOLEAN NOT NULL DEFAULT false,
    "dexModifierMax" INTEGER,
    "stealthDisadvantage" BOOLEAN NOT NULL DEFAULT false,
    "strengthRequirement" INTEGER,

    CONSTRAINT "ItemArmorDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemConsumableDetail" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "effectDiceCount" INTEGER,
    "effectDiceFaces" INTEGER,
    "effectModifier" INTEGER,
    "effectDescription" TEXT,

    CONSTRAINT "ItemConsumableDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "itemId" TEXT,
    "name" TEXT NOT NULL,
    "category" "ItemCategory" NOT NULL,
    "weight" DOUBLE PRECISION,
    "cost" JSONB,
    "description" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "equipped" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryWeaponDetail" (
    "id" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "damageDiceCount" INTEGER NOT NULL,
    "damageDiceFaces" INTEGER NOT NULL,
    "damageModifier" INTEGER NOT NULL DEFAULT 0,
    "damageType" TEXT NOT NULL,
    "versatileDiceCount" INTEGER,
    "versatileDiceFaces" INTEGER,
    "finesse" BOOLEAN NOT NULL DEFAULT false,
    "light" BOOLEAN NOT NULL DEFAULT false,
    "heavy" BOOLEAN NOT NULL DEFAULT false,
    "twoHanded" BOOLEAN NOT NULL DEFAULT false,
    "reach" BOOLEAN NOT NULL DEFAULT false,
    "thrown" BOOLEAN NOT NULL DEFAULT false,
    "ammunition" BOOLEAN NOT NULL DEFAULT false,
    "rangeNormal" INTEGER,
    "rangeLong" INTEGER,

    CONSTRAINT "InventoryWeaponDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryArmorDetail" (
    "id" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "armorCategory" "ArmorCategory" NOT NULL,
    "baseArmorClass" INTEGER NOT NULL,
    "dexModifierApplies" BOOLEAN NOT NULL DEFAULT false,
    "dexModifierMax" INTEGER,
    "stealthDisadvantage" BOOLEAN NOT NULL DEFAULT false,
    "strengthRequirement" INTEGER,

    CONSTRAINT "InventoryArmorDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryConsumableDetail" (
    "id" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "effectDiceCount" INTEGER,
    "effectDiceFaces" INTEGER,
    "effectModifier" INTEGER,
    "effectDescription" TEXT,

    CONSTRAINT "InventoryConsumableDetail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Item_name_key" ON "Item"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ItemWeaponDetail_itemId_key" ON "ItemWeaponDetail"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemArmorDetail_itemId_key" ON "ItemArmorDetail"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemConsumableDetail_itemId_key" ON "ItemConsumableDetail"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryWeaponDetail_inventoryItemId_key" ON "InventoryWeaponDetail"("inventoryItemId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryArmorDetail_inventoryItemId_key" ON "InventoryArmorDetail"("inventoryItemId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryConsumableDetail_inventoryItemId_key" ON "InventoryConsumableDetail"("inventoryItemId");

-- AddForeignKey
ALTER TABLE "ItemWeaponDetail" ADD CONSTRAINT "ItemWeaponDetail_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemArmorDetail" ADD CONSTRAINT "ItemArmorDetail_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemConsumableDetail" ADD CONSTRAINT "ItemConsumableDetail_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryWeaponDetail" ADD CONSTRAINT "InventoryWeaponDetail_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryArmorDetail" ADD CONSTRAINT "InventoryArmorDetail_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryConsumableDetail" ADD CONSTRAINT "InventoryConsumableDetail_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

