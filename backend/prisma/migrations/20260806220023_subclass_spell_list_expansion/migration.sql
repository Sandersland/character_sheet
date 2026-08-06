-- #1631: nullable `edition`, same shape as SubclassGrantedSpell's own
-- 20260803140000_subclass_granted_spell_edition migration. NULL = "valid in
-- both editions"; a diverging list forks into one row per edition. NULLS NOT
-- DISTINCT is hand-written (Prisma 7.8's DSL can't express it) so two
-- identical shared rows cannot both insert.

-- CreateTable
CREATE TABLE "SubclassSpellListExpansion" (
    "id" TEXT NOT NULL,
    "subclassId" TEXT NOT NULL,
    "spellId" TEXT NOT NULL,
    "edition" "RulesEdition",

    CONSTRAINT "SubclassSpellListExpansion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubclassSpellListExpansion_subclassId_idx" ON "SubclassSpellListExpansion"("subclassId");

-- CreateIndex
CREATE UNIQUE INDEX "SubclassSpellListExpansion_subclassId_spellId_edition_key"
  ON "SubclassSpellListExpansion"("subclassId", "spellId", "edition") NULLS NOT DISTINCT;

-- AddForeignKey
ALTER TABLE "SubclassSpellListExpansion" ADD CONSTRAINT "SubclassSpellListExpansion_subclassId_fkey" FOREIGN KEY ("subclassId") REFERENCES "Subclass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubclassSpellListExpansion" ADD CONSTRAINT "SubclassSpellListExpansion_spellId_fkey" FOREIGN KEY ("spellId") REFERENCES "Spell"("id") ON DELETE CASCADE ON UPDATE CASCADE;
