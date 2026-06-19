-- CreateEnum
CREATE TYPE "ItemCategory" AS ENUM ('weapon', 'armor', 'consumable', 'gear');

-- AlterTable
ALTER TABLE "Character" DROP COLUMN "inventory";

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "ItemCategory" NOT NULL,
    "weight" DOUBLE PRECISION,
    "cost" JSONB,
    "damageDice" TEXT,
    "damageType" TEXT,
    "armorClass" INTEGER,
    "properties" TEXT[],
    "description" TEXT,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
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
    "damageDice" TEXT,
    "damageType" TEXT,
    "armorClass" INTEGER,
    "properties" TEXT[],
    "description" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "equipped" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Item_name_key" ON "Item"("name");

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
