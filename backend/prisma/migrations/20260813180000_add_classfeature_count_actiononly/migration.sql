-- AlterTable
-- #1912: `count` (a resolved numeric fact, e.g. Flurry of Blows' strike
-- count) and `actionOnly` (marks a row that exists only to carry one
-- action variant, never a feature card — see ClassFeature.actionOnly's own
-- schema.prisma comment). Hand-authored per the #1571 workaround: `prisma
-- migrate dev` also emits an unrelated shadow-db diff (CatalogEntry index
-- truncation + a cascading Spell FK drop, documented on
-- 20260810123528_add_condition_immunity_columns's own migration) — stripped
-- so this migration touches only what #1912 actually changes.
ALTER TABLE "ClassFeature" ADD COLUMN     "count" INTEGER;
ALTER TABLE "ClassFeature" ADD COLUMN     "actionOnly" BOOLEAN NOT NULL DEFAULT false;
