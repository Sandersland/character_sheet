-- #1646 (epic #1644): drop the CampaignItem family now that 20260803120000 has
-- copied every row into Item and the code reads only from there. Five models and
-- ~150 schema lines expressing what Item now expresses on its own.
--
-- InventoryItem.campaignItemId goes with them: the provenance it carried was
-- copied into itemId by the same migration, ids unchanged. Audit blobs written
-- before that still name the old key and are NOT rewritten — the log is
-- append-only — so resolveSnapshotRefs reads it as a fallback instead.

ALTER TABLE "InventoryItem" DROP COLUMN "campaignItemId";

DROP TABLE "CampaignItemCapability";
DROP TABLE "CampaignItemWeaponDetail";
DROP TABLE "CampaignItemArmorDetail";
DROP TABLE "CampaignItemConsumableDetail";
DROP TABLE "CampaignItem";
