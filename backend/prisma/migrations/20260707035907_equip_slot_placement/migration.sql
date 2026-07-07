-- CreateEnum
CREATE TYPE "EquipSlot" AS ENUM ('MAIN_HAND', 'OFF_HAND', 'BODY', 'HEAD', 'NECK', 'CLOAK', 'HANDS', 'WRISTS', 'BELT', 'FEET', 'RING');

-- AlterTable
ALTER TABLE "CampaignItem" ADD COLUMN     "slot" "EquipSlot";

-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "slot" "EquipSlot";

-- AlterTable: add the new placement columns before dropping the boolean.
ALTER TABLE "InventoryItem"
ADD COLUMN     "equippedSlot" "EquipSlot",
ADD COLUMN     "rarity" "ItemRarity",
ADD COLUMN     "slot" "EquipSlot";

-- Backfill equippedSlot from the old boolean so pre-existing equipped rows keep
-- a placement (#565): shields → OFF_HAND, other armor → BODY, weapons → MAIN_HAND.
UPDATE "InventoryItem" i
SET "equippedSlot" = 'OFF_HAND'
FROM "InventoryArmorDetail" ad
WHERE ad."inventoryItemId" = i.id AND i.equipped AND ad."armorCategory" = 'shield';

UPDATE "InventoryItem" i
SET "equippedSlot" = 'BODY'
FROM "InventoryArmorDetail" ad
WHERE ad."inventoryItemId" = i.id AND i.equipped AND ad."armorCategory" <> 'shield';

UPDATE "InventoryItem" i
SET "equippedSlot" = 'MAIN_HAND'
WHERE i.equipped AND i.category = 'weapon';

-- AlterTable: drop the now-derived boolean.
ALTER TABLE "InventoryItem" DROP COLUMN "equipped";
