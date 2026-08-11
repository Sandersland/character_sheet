-- CreateEnum
CREATE TYPE "SubclassCasterFraction" AS ENUM ('third');

-- AlterTable
-- #1531: third-caster identity moves onto Subclass (casterFraction/
-- spellcastingAbility), replacing the retired THIRD_CASTER_SUBCLASSES
-- name-keyed lookup. The DropForeignKey/RenameIndex statements `prisma
-- migrate dev` also generated here are the SAME unrelated shadow-db drift
-- 20260810123528_add_condition_immunity_columns's own comment documents
-- (Postgres's 63-byte identifier truncation on the CatalogEntry unique index
-- name, and a cascading spurious Spell FK drop) — stripped so this migration
-- touches only what #1531 actually changes.
ALTER TABLE "Subclass" ADD COLUMN     "casterFraction" "SubclassCasterFraction",
ADD COLUMN     "spellcastingAbility" TEXT;

-- Review finding 2: casterFraction and spellcastingAbility must be both NULL
-- or both set — a half-set row (e.g. casterFraction = 'third' with a NULL
-- ability) would make thirdCasterAbilityOf silently return null, losing an
-- Eldritch Knight/Arcane Trickster's spellcasting with no error. subclassSeedSchema's
-- refine (subclasses.ts) enforces this at seed time; this CHECK enforces it at
-- every write, including a future admin endpoint or a raw SQL backfill that
-- bypasses Zod entirely.
ALTER TABLE "Subclass" ADD CONSTRAINT "Subclass_casterFraction_spellcastingAbility_copresence"
  CHECK (("casterFraction" IS NULL) = ("spellcastingAbility" IS NULL));
