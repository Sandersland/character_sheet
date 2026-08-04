-- #1646 (epic #1644): repoint CampaignItemLink at Item. Deferred out of
-- 20260803120000 (which only copies existing CampaignItem rows) because this
-- lands with the code change that makes it safe: campaign item CREATE now
-- writes to Item, so a freshly created row has an Item id to link against.
-- Doing this earlier would have broken creation for every row minted between
-- that migration and this code — a new CampaignItem row would have had no
-- matching Item row for CampaignItemLink.itemId to reference.
--
-- Ids are preserved (20260803120000), so the existing rows' campaignItemId
-- values are already valid Item ids — this is a rename in place, not a
-- re-resolve, and the 1:1 rows + their entity links survive untouched.
--
-- CampaignItemLink_campaignItemId_key is a bare UNIQUE INDEX (Prisma's usual
-- @unique shape), not a table CONSTRAINT, so it renames via ALTER INDEX, not
-- ALTER TABLE ... RENAME CONSTRAINT — verified against \d "CampaignItemLink".
ALTER TABLE "CampaignItemLink" RENAME COLUMN "campaignItemId" TO "itemId";
ALTER TABLE "CampaignItemLink" DROP CONSTRAINT "CampaignItemLink_campaignItemId_fkey";
ALTER INDEX "CampaignItemLink_campaignItemId_key" RENAME TO "CampaignItemLink_itemId_key";
ALTER TABLE "CampaignItemLink" ADD CONSTRAINT "CampaignItemLink_itemId_fkey"
  FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
