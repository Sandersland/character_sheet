-- AlterTable
-- #1909: static in-play announce text, distinct from `description`.
-- The DropForeignKey/RenameIndex statements `prisma migrate dev` also
-- generated here are the SAME unrelated shadow-db drift documented on
-- 20260810123528_add_condition_immunity_columns's own migration (Postgres's
-- 63-byte identifier truncation on
-- CatalogEntry_kind_scope_ownerUserId_ownerCampaignId_name_edition's index
-- name, and a cascading spurious Spell FK drop) — stripped so this migration
-- touches only what #1909 actually changes.
ALTER TABLE "ClassFeature" ADD COLUMN     "reminder" TEXT;
