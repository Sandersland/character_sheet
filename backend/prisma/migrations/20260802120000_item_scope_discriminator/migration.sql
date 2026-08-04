-- #1645 (epic #1644): Item gains a scope discriminator so DM-authored
-- CampaignItem rows can be merged into it (#1646). The two tables are today
-- near-identical but ASYMMETRIC — Item has no rarity, no attunement and no
-- capability side-table — which is why the seeded catalog structurally cannot
-- express a magic item. This migration is the identity half; 20260802130000
-- adds the columns that lift that ceiling.
--
-- scopeKey is a non-null discriminator rather than a nullable campaignId,
-- because the rule is "a name is unique among GLOBAL rows only" and Postgres
-- treats NULLs as DISTINCT: a unique index on (campaignId, name) would let two
-- catalog rows named 'Longsword' both insert while looking correct. Postgres 17
-- can express this with NULLS NOT DISTINCT, but Prisma 7.8 rejects the
-- attribute argument outright, and a raw partial index is invisible to drift
-- detection — every later migration would propose dropping it.
--
-- ORDER IS LOAD-BEARING: scopeKey is added nullable, backfilled, and only then
-- made NOT NULL and indexed. Creating the unique index before the backfill
-- indexes NULLs; SET NOT NULL before it aborts on every existing row.
--
-- Hand-written per the convention 20260801120000's header records: Prisma 7
-- prompts interactively on `migrate dev --create-only` in this checkout, so
-- every migration since 20260730120000 has been authored directly.

CREATE TYPE "ItemScope" AS ENUM ('GLOBAL', 'CAMPAIGN');

ALTER TABLE "Item" ADD COLUMN "scope" "ItemScope" NOT NULL DEFAULT 'GLOBAL';
ALTER TABLE "Item" ADD COLUMN "scopeKey" TEXT;
ALTER TABLE "Item" ADD COLUMN "campaignId" TEXT;

-- Every pre-existing row is seeded catalog content by definition: CampaignItem
-- rows still live in their own table until #1646 moves them.
UPDATE "Item" SET "scopeKey" = 'global' WHERE "scopeKey" IS NULL;

ALTER TABLE "Item" ALTER COLUMN "scopeKey" SET NOT NULL;

DROP INDEX "Item_name_key";
CREATE UNIQUE INDEX "Item_scopeKey_name_key" ON "Item"("scopeKey", "name");
CREATE INDEX "Item_campaignId_idx" ON "Item"("campaignId");

ALTER TABLE "Item" ADD CONSTRAINT "Item_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- scopeKey is derivable from scope + campaignId, and derived-but-stored is only
-- safe if it cannot drift. Prisma cannot model a computed column, so the
-- agreement is enforced here rather than trusted to every future write path —
-- same reasoning as StartingEquipmentPackage_gold_dice_jointly_null_check.
-- Without it a row could claim scope CAMPAIGN while holding scopeKey 'global',
-- which would put a DM's homebrew in the catalog's uniqueness namespace.
ALTER TABLE "Item" ADD CONSTRAINT "Item_scope_key_agreement_check"
  CHECK (
    ("scope" = 'GLOBAL' AND "campaignId" IS NULL AND "scopeKey" = 'global')
    OR
    ("scope" = 'CAMPAIGN' AND "campaignId" IS NOT NULL AND "scopeKey" = 'campaign:' || "campaignId")
  );
