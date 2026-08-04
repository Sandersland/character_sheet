-- #1648 (epic #1644): the expand half. InventoryItem gains the frozen-JSON
-- snapshot and the mutable state promoted out of the detail tables; the four
-- Inventory* mirrors stay authoritative until #1649 flips the readers.
--
-- `snapshot` is NULLABLE on purpose. The backfill cannot be SQL: the
-- capabilities array is a discriminated union whose flat-column mapping lives in
-- readCapability, and rebuilding that in jsonb_build_object would recreate the
-- exact mirror this epic deletes — with no way to run
-- inventorySnapshotSchema.parse() over the result. backfill-inventory-snapshot
-- fills it, and #1649 makes the column NOT NULL.

ALTER TABLE "InventoryItem" ADD COLUMN "snapshot" JSONB;
ALTER TABLE "InventoryItem" ADD COLUMN "usesRemaining" INTEGER;

-- Carried across now so the promoted column is already correct for every
-- existing charged consumable; the snapshot backfill is a separate step.
UPDATE "InventoryItem" ii
SET "usesRemaining" = d."usesRemaining"
FROM "InventoryConsumableDetail" d
WHERE d."inventoryItemId" = ii.id AND d."usesRemaining" IS NOT NULL;

CREATE TABLE "InventoryCapabilityUse" (
    "id" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "capabilityKey" TEXT NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "InventoryCapabilityUse_pkey" PRIMARY KEY ("id")
);

-- The capability's own row id becomes its key, so the use rows stay addressable
-- across #1649 with no remapping step. buildInventorySnapshot writes the same id
-- into the snapshot entry's `key`.
INSERT INTO "InventoryCapabilityUse" ("id", "inventoryItemId", "capabilityKey", "used")
SELECT gen_random_uuid()::text, c."inventoryItemId", c."id", c."used"
FROM "InventoryCapability" c;

CREATE UNIQUE INDEX "InventoryCapabilityUse_inventoryItemId_capabilityKey_key"
  ON "InventoryCapabilityUse"("inventoryItemId", "capabilityKey");
CREATE INDEX "InventoryCapabilityUse_inventoryItemId_idx"
  ON "InventoryCapabilityUse"("inventoryItemId");

ALTER TABLE "InventoryCapabilityUse" ADD CONSTRAINT "InventoryCapabilityUse_inventoryItemId_fkey"
  FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
