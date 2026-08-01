-- #1564 commit 2: StartingEquipmentOption.gold — every PHB'24 class option
-- carries a GP amount (4-28 for a non-final option, 50-155 for the flat final
-- option), which the 2014-only schema had no column for. Hand-written for
-- consistency with this migration family (Prisma 7 refuses `migrate dev
-- --create-only` here — see this repo's docs/development.md). Plain
-- ADD COLUMN with a default against a populated table: every existing
-- (2014) row defaults to 0, matching that edition's actual gold path (the
-- package-level dice roll), so no backfill is needed.

-- AlterTable
ALTER TABLE "StartingEquipmentOption" ADD COLUMN "gold" INTEGER NOT NULL DEFAULT 0;
