-- #1710: foundation slice of the 2014 spell catalog fork (epic #1517). Adds
-- the same nullable `edition` axis 20260726111922_catalog_edition_tagging
-- gave Feat/Background/Subclass, widening Spell's business key from `name`
-- alone to `(name, edition)` in one step (Spell never got a separate
-- edition-column-only migration the way Action did, so there is no earlier
-- widen step to mirror — Feat's single-migration shape applies directly).
--
-- NULLS NOT DISTINCT (Postgres 15+) is hand-written because Prisma's schema
-- DSL cannot express it; Prisma 7.8 also gates `migrate dev`/`migrate reset`
-- against destructive DDL, so this migration is authored by hand rather than
-- generated. Without the clause Postgres treats NULLs as distinct, so
-- (name, edition) would admit unboundedly many ("Fireball", NULL) rows —
-- resolveEditionRow's exact-then-NULL fallback and upsertEditionRow's
-- findFirst both assume at most one NULL-edition row per name.
--
-- Safe to widen unconditionally, without inspecting any row: the index being
-- dropped guarantees every `name` is already globally distinct, so every
-- (name, edition) pair is distinct too under ANY NULL semantics. No cast, no
-- type change, no value narrowing — widening a unique index to a superset of
-- its own columns cannot find a duplicate the narrower index admitted.

-- DropIndex
DROP INDEX "Spell_name_key";

-- AlterTable
ALTER TABLE "Spell" ADD COLUMN     "edition" "RulesEdition";

-- CreateIndex
CREATE UNIQUE INDEX "Spell_name_edition_key" ON "Spell"("name", "edition") NULLS NOT DISTINCT;
