-- #1796 (epic #1795 1/6): CatalogEntry/CatalogGrant entitlement supertype,
-- replacing Spell.ownerId (#1784) as the single owner/scope model every
-- catalog kind (Spell today; Item eventually) will share.
--
-- Hand-written per this repo's established convention (see
-- 20260802120000_item_scope_discriminator's own header): `prisma migrate dev`
-- prompts interactively in this checkout and is not usable non-interactively
-- (confirmed against this exact schema change: it reports the same
-- required-column-with-472-existing-rows blocker Item.scopeKey hit, then
-- refuses to run without a TTY). Three things here are also simply beyond
-- Prisma's DSL, same class of gap as Item's own migration: the
-- exactly-one-owner-arm-per-scope CHECK (a cross-column conditional), the
-- (kind, scope, ownerUserId, ownerCampaignId, name, edition) unique with
-- NULLS NOT DISTINCT (Prisma 7.8 rejects the `nullsNotDistinct` attribute),
-- and Spell.catalogEntryId's FK — Prisma only emits an FK from an actual
-- `@relation`, and that column deliberately has none (schema.prisma's own
-- comment on Spell.catalogEntryId explains why: no back-relation on
-- CatalogEntry keeps the supertype closed to future kinds).
--
-- ORDER IS LOAD-BEARING: CatalogEntry/CatalogGrant tables + constraints are
-- created FIRST (the backfill below needs somewhere to insert into and
-- something to point Spell.catalogEntryId at); Spell.catalogEntryId is added
-- NULLABLE, backfilled with one freshly-created CatalogEntry per existing
-- Spell row, and only THEN made NOT NULL + unique + FK'd — same reasoning as
-- Item.scopeKey's own migration (SET NOT NULL before backfill aborts on
-- every existing row; a unique index before backfill indexes NULLs).

-- CreateEnum
CREATE TYPE "CatalogKind" AS ENUM ('SPELL');

-- CreateEnum
CREATE TYPE "CatalogScope" AS ENUM ('GLOBAL', 'USER', 'CAMPAIGN');

-- CreateTable
CREATE TABLE "CatalogEntry" (
    "id" TEXT NOT NULL,
    "kind" "CatalogKind" NOT NULL,
    "scope" "CatalogScope" NOT NULL,
    "ownerUserId" TEXT,
    "ownerCampaignId" TEXT,
    "name" TEXT NOT NULL,
    "edition" "RulesEdition" NOT NULL,
    "forkedFromId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogGrant" (
    "id" TEXT NOT NULL,
    "catalogEntryId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,

    CONSTRAINT "CatalogGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CatalogEntry_kind_scope_idx" ON "CatalogEntry"("kind", "scope");

-- CreateIndex
CREATE INDEX "CatalogEntry_ownerUserId_idx" ON "CatalogEntry"("ownerUserId");

-- CreateIndex
CREATE INDEX "CatalogEntry_ownerCampaignId_idx" ON "CatalogEntry"("ownerCampaignId");

-- CreateIndex
CREATE INDEX "CatalogEntry_forkedFromId_idx" ON "CatalogEntry"("forkedFromId");

-- CreateIndex
-- Business-key uniqueness, hand-written for NULLS NOT DISTINCT (see file
-- header) so two GLOBAL rows (both owner arms null) sharing a (kind, name,
-- edition) are still rejected, matching Spell's pre-#1796 unique index.
CREATE UNIQUE INDEX "CatalogEntry_kind_scope_ownerUserId_ownerCampaignId_name_edition_key"
  ON "CatalogEntry"("kind", "scope", "ownerUserId", "ownerCampaignId", "name", "edition") NULLS NOT DISTINCT;

-- CreateIndex
CREATE UNIQUE INDEX "CatalogGrant_catalogEntryId_campaignId_key" ON "CatalogGrant"("catalogEntryId", "campaignId");

-- CreateIndex
CREATE INDEX "CatalogGrant_campaignId_idx" ON "CatalogGrant"("campaignId");

-- AddForeignKey
ALTER TABLE "CatalogEntry" ADD CONSTRAINT "CatalogEntry_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogEntry" ADD CONSTRAINT "CatalogEntry_ownerCampaignId_fkey" FOREIGN KEY ("ownerCampaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- SetNull, not Cascade: a fork's origin being deleted must not take the fork
-- down with it — see schema.prisma's own comment on CatalogEntry.forkedFrom.
ALTER TABLE "CatalogEntry" ADD CONSTRAINT "CatalogEntry_forkedFromId_fkey" FOREIGN KEY ("forkedFromId") REFERENCES "CatalogEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogGrant" ADD CONSTRAINT "CatalogGrant_catalogEntryId_fkey" FOREIGN KEY ("catalogEntryId") REFERENCES "CatalogEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogGrant" ADD CONSTRAINT "CatalogGrant_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-written: exactly one owner arm set per scope (GLOBAL -> both null).
-- Prisma's DSL cannot express a cross-column conditional CHECK — see file
-- header. Same shape as Item_scope_key_agreement_check.
ALTER TABLE "CatalogEntry" ADD CONSTRAINT "CatalogEntry_owner_scope_check"
  CHECK (
    ("scope" = 'GLOBAL' AND "ownerUserId" IS NULL AND "ownerCampaignId" IS NULL)
    OR
    ("scope" = 'USER' AND "ownerUserId" IS NOT NULL AND "ownerCampaignId" IS NULL)
    OR
    ("scope" = 'CAMPAIGN' AND "ownerCampaignId" IS NOT NULL AND "ownerUserId" IS NULL)
  );

-- AlterTable
ALTER TABLE "Spell" ADD COLUMN "catalogEntryId" TEXT;

-- Backfill: one CatalogEntry per existing Spell row, mirroring the OLD
-- (name, edition, ownerId) business key this migration retires — a null
-- ownerId becomes scope GLOBAL, a set one becomes scope USER carrying that
-- same id as ownerUserId. edition is COALESCEd to EDITION_2024 for the
-- (today unpopulated, but schema-legal) null-edition case, matching
-- seedSpells' own resolvedSpellEdition default (prisma/seed.ts) so this
-- backfill's join predicate agrees with what seedSpells will look up next
-- run.
INSERT INTO "CatalogEntry" ("id", "kind", "scope", "ownerUserId", "ownerCampaignId", "name", "edition", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  'SPELL',
  CASE WHEN "ownerId" IS NULL THEN 'GLOBAL'::"CatalogScope" ELSE 'USER'::"CatalogScope" END,
  "ownerId",
  NULL,
  "name",
  COALESCE("edition", 'EDITION_2024'::"RulesEdition"),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Spell";

UPDATE "Spell" s
SET "catalogEntryId" = ce."id"
FROM "CatalogEntry" ce
WHERE ce."kind" = 'SPELL'
  AND ce."name" = s."name"
  AND ce."edition" = COALESCE(s."edition", 'EDITION_2024'::"RulesEdition")
  AND ce."ownerUserId" IS NOT DISTINCT FROM s."ownerId";

ALTER TABLE "Spell" ALTER COLUMN "catalogEntryId" SET NOT NULL;

-- DropForeignKey
ALTER TABLE "Spell" DROP CONSTRAINT "Spell_ownerId_fkey";

-- DropIndex
DROP INDEX "Spell_ownerId_idx";

-- DropIndex
DROP INDEX "Spell_name_edition_ownerId_key";

-- AlterTable
ALTER TABLE "Spell" DROP COLUMN "ownerId";

-- CreateIndex
CREATE UNIQUE INDEX "Spell_catalogEntryId_key" ON "Spell"("catalogEntryId");

-- AddForeignKey
ALTER TABLE "Spell" ADD CONSTRAINT "Spell_catalogEntryId_fkey" FOREIGN KEY ("catalogEntryId") REFERENCES "CatalogEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
