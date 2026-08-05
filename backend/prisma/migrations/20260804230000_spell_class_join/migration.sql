-- #1711: F2 of epic #1517. Replaces `Spell.classes String[]` with a
-- `SpellClass { spellId, className }` join so per-edition class lists can
-- differ (a single array column can't hold two editions' lists at once).
-- Shape 1 (settled here, referenced by #1495's identical join question): no
-- `edition` column on SpellClass — edition rides the parent Spell row, so a
-- 2014-fork spell and its 2024 sibling are separate Spell rows with disjoint
-- membership rows already.
--
-- Hand-written, not `prisma migrate dev`-generated: Prisma 7.8 gates
-- destructive DDL (a dropped column is exactly that), mirroring #1710's
-- Spell.edition migration and Feat's #1306 precedent.
--
-- Ordering is load-bearing: CREATE the join table, BACKFILL it by unnesting
-- the still-live `classes` column, THEN drop that column — reversing the
-- last two steps would drop the only source the backfill reads from.

-- CreateTable
CREATE TABLE "SpellClass" (
    "id" TEXT NOT NULL,
    "spellId" TEXT NOT NULL,
    "className" TEXT NOT NULL,

    CONSTRAINT "SpellClass_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SpellClass_spellId_className_key" ON "SpellClass"("spellId", "className");

-- AddForeignKey
ALTER TABLE "SpellClass" ADD CONSTRAINT "SpellClass_spellId_fkey" FOREIGN KEY ("spellId") REFERENCES "Spell"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: one SpellClass row per (spellId, className) pair unnested from
-- the current `classes` array on every existing (2024-tagged) Spell row.
-- gen_random_uuid() matches Prisma's default(uuid()) — same function
-- Postgres 15's pgcrypto-free core already exposes (used elsewhere in this
-- schema's hand-written migrations).
INSERT INTO "SpellClass" ("id", "spellId", "className")
SELECT gen_random_uuid()::text, "Spell"."id", "className"
FROM "Spell", unnest("Spell"."classes") AS "className"
ON CONFLICT ("spellId", "className") DO NOTHING;

-- AlterTable
ALTER TABLE "Spell" DROP COLUMN "classes";
