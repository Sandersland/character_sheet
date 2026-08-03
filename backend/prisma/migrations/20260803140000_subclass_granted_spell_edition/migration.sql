-- #1625: nullable `edition` on SubclassGrantedSpell. NULL = "granted in both
-- editions"; a diverging list forks into one row per edition. NULLS NOT
-- DISTINCT is hand-written (Prisma 7.8 rejects the DSL attribute) so two
-- identical shared rows cannot both insert — same shape as
-- 20260726111922_catalog_edition_tagging, NOT #1645's scopeKey (that rule was
-- PARTIAL uniqueness, inexpressible as a full index; this one is full-table).

-- DropIndex
DROP INDEX "SubclassGrantedSpell_subclassId_spellId_key";

-- AlterTable
ALTER TABLE "SubclassGrantedSpell" ADD COLUMN "edition" "RulesEdition";

-- CreateIndex
CREATE UNIQUE INDEX "SubclassGrantedSpell_subclassId_spellId_edition_key"
  ON "SubclassGrantedSpell"("subclassId", "spellId", "edition") NULLS NOT DISTINCT;
