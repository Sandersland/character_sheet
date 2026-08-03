-- #1649 (epic #1644): the contract half. Every reader is on the snapshot, so
-- the four Inventory* mirrors are dead weight. snapshot becomes NOT NULL here
-- because #1648's backfill + dual-write made a null impossible to create.

-- Fail loudly rather than letting SET NOT NULL abort with a bare constraint
-- error: a null here means a #1648 write path was missed, and the row id is
-- what makes that findable.
DO $$
DECLARE missing INT;
BEGIN
  SELECT count(*) INTO missing FROM "InventoryItem" WHERE snapshot IS NULL;
  IF missing > 0 THEN
    RAISE EXCEPTION 'Cannot contract: % InventoryItem row(s) have no snapshot — a creation path from #1648 was missed.', missing;
  END IF;
END $$;

ALTER TABLE "InventoryItem" ALTER COLUMN "snapshot" SET NOT NULL;

DROP TABLE "InventoryCapability";
DROP TABLE "InventoryWeaponDetail";
DROP TABLE "InventoryArmorDetail";
DROP TABLE "InventoryConsumableDetail";
