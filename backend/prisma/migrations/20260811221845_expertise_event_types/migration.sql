-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.
--
-- #1588: the DropForeignKey/RenameIndex statements `prisma migrate dev`
-- also generated here are the SAME unrelated shadow-db drift documented on
-- 20260810123528_add_condition_immunity_columns's own migration (Postgres's
-- 63-byte identifier truncation on
-- CatalogEntry_kind_scope_ownerUserId_ownerCampaignId_name_edition's index
-- name, and a cascading spurious Spell FK drop) — stripped so this migration
-- touches only the Expertise event types.


ALTER TYPE "CharacterEventType" ADD VALUE 'learnExpertise';
ALTER TYPE "CharacterEventType" ADD VALUE 'forgetExpertise';
ALTER TYPE "CharacterEventType" ADD VALUE 'expertiseReconciled';
