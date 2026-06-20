-- Migration: Unified Character Activity Log
--
-- Replaces the narrow `InventoryTransaction` table with a unified
-- `CharacterEvent` / `CharacterEventField` pair that covers all domains
-- (inventory, hitPoints, experience, currency, and future additions) in one
-- table, queryable in a single ORDER BY createdAt — no merging anywhere.
--
-- Three phases:
--   1. CREATE the new enums, tables, and indexes.
--   2. Backfill existing InventoryTransaction rows into CharacterEvent.
--   3. DROP the InventoryTransaction table, its FK constraints, and its enum.

-- Phase 1: Create new enums --------------------------------------------------

-- CreateEnum
CREATE TYPE "CharacterEventCategory" AS ENUM (
  'inventory',
  'hitPoints',
  'experience',
  'currency'
);

-- CreateEnum
CREATE TYPE "CharacterEventType" AS ENUM (
  'acquired',
  'consumed',
  'sold',
  'bought',
  'removed',
  'damage',
  'heal',
  'setTemp',
  'shortRest',
  'longRest',
  'levelUp',
  'levelDown',
  'deathSave',
  'stabilize',
  'xpAward',
  'xpSet',
  'currencyAdjust',
  'revert'
);

-- Phase 1: Create new tables --------------------------------------------------

-- CreateTable
CREATE TABLE "CharacterEvent" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "category" "CharacterEventCategory" NOT NULL,
    "type" "CharacterEventType" NOT NULL,
    "summary" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "data" JSONB,
    "actor" TEXT NOT NULL DEFAULT 'player',
    "reverted" BOOLEAN NOT NULL DEFAULT false,
    "batchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CharacterEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterEventField" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB,

    CONSTRAINT "CharacterEventField_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "CharacterEvent"
  ADD CONSTRAINT "CharacterEvent_characterId_fkey"
  FOREIGN KEY ("characterId") REFERENCES "Character"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterEventField"
  ADD CONSTRAINT "CharacterEventField_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "CharacterEvent"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "CharacterEvent_characterId_createdAt_idx"
  ON "CharacterEvent"("characterId", "createdAt");

-- CreateIndex
CREATE INDEX "CharacterEvent_entityType_entityId_idx"
  ON "CharacterEvent"("entityType", "entityId");

-- Phase 2: Backfill InventoryTransaction → CharacterEvent --------------------
--
-- Historical rows get no before/after snapshots (none were recorded) — that
-- is acceptable and honest. `data` carries itemName/quantityDelta/currencyDelta
-- so the inventory ledger read endpoint can still render them identically.
-- `summary` is generated from the type and item name for readability.

INSERT INTO "CharacterEvent" (
  "id",
  "characterId",
  "category",
  "type",
  "summary",
  "entityType",
  "entityId",
  "before",
  "after",
  "data",
  "actor",
  "reverted",
  "batchId",
  "createdAt"
)
SELECT
  it."id",
  it."characterId",
  'inventory'::"CharacterEventCategory",
  it."type"::TEXT::"CharacterEventType",
  CASE it."type"::TEXT
    WHEN 'acquired' THEN 'Acquired ' || it."itemName" || ' ×' || ABS(it."quantityDelta")
    WHEN 'bought'   THEN 'Bought '   || it."itemName" || ' ×' || ABS(it."quantityDelta")
    WHEN 'sold'     THEN 'Sold '     || it."itemName" || ' ×' || ABS(it."quantityDelta")
    WHEN 'consumed' THEN 'Consumed ' || it."itemName" || ' ×' || ABS(it."quantityDelta")
    ELSE                 'Removed '  || it."itemName"
  END,
  CASE WHEN it."inventoryItemId" IS NOT NULL THEN 'InventoryItem' ELSE NULL END,
  it."inventoryItemId",
  NULL,   -- no before snapshot for historical rows
  NULL,   -- no after snapshot for historical rows
  jsonb_build_object(
    'itemName',      it."itemName",
    'quantityDelta', it."quantityDelta",
    'currencyDelta', it."currencyDelta",
    'note',          it."note"
  ),
  'player',
  false,
  it."batchId",
  it."createdAt"
FROM "InventoryTransaction" it;

-- Phase 3: Drop InventoryTransaction -----------------------------------------

-- DropForeignKey (must drop before dropping the table)
ALTER TABLE "InventoryTransaction"
  DROP CONSTRAINT IF EXISTS "InventoryTransaction_characterId_fkey";

ALTER TABLE "InventoryTransaction"
  DROP CONSTRAINT IF EXISTS "InventoryTransaction_inventoryItemId_fkey";

-- DropTable
DROP TABLE "InventoryTransaction";

-- DropEnum
DROP TYPE "InventoryTxnType";
