-- #1564 commit 4: open picks widen past weapons. ToolCategory mirrors
-- backend lib/srd/tools.ts's TS union as a real enum, so a starting-
-- equipment open pick can filter "musical instrument" / "artisan tool" as a
-- column the validator reads, never a reach into a rules TS module from the
-- DB-driven equipment resolver. Item.toolCategory is nullable and set only
-- for the small set of rows that ARE tools; StartingEquipmentOpenPick gains
-- the matching filter column plus boundToToolChoice, which serves Monk's
-- "Artisan's Tools or Musical Instrument chosen for the tool proficiency
-- above" (and, later, the Soldier background's Gaming Set pick, #1565) — a
-- plain ADD COLUMN with a default against populated tables, no backfill
-- needed since every existing row is a plain weapon pick. Hand-written for
-- consistency with this migration family (Prisma 7 refuses `migrate dev
-- --create-only` here). Not an enum-narrowing change, so
-- scripts/check-enum-narrowing.sh's guard does not apply.

-- CreateEnum
CREATE TYPE "ToolCategory" AS ENUM ('artisan', 'gamingSet', 'musicalInstrument', 'other');

-- AlterTable
ALTER TABLE "Item" ADD COLUMN "toolCategory" "ToolCategory";

-- AlterTable
ALTER TABLE "StartingEquipmentOpenPick" ADD COLUMN "toolCategory" "ToolCategory";
ALTER TABLE "StartingEquipmentOpenPick" ADD COLUMN "boundToToolChoice" BOOLEAN NOT NULL DEFAULT false;
