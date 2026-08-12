-- AlterTable
-- #1121: while-active condition immunity (Mindless Rage / Beguiling
-- Defenses / Nature's Ward). The DropForeignKey/RenameIndex statements
-- `prisma migrate dev` also generated here are unrelated shadow-db drift
-- (Postgres's 63-byte identifier truncation on
-- CatalogEntry_kind_scope_ownerUserId_ownerCampaignId_name_edition's index
-- name, and a cascading spurious Spell FK drop) — stripped so this migration
-- touches only what #1121 actually changes.
ALTER TABLE "ClassFeature" ADD COLUMN     "conditionImmunities" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "conditionImmunitiesOnBuffStart" TEXT,
ADD COLUMN     "conditionImmunitiesRequireActiveBuff" TEXT;
