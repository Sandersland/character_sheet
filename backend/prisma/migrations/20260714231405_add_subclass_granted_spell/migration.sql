-- CreateTable
CREATE TABLE "SubclassGrantedSpell" (
    "id" TEXT NOT NULL,
    "subclassId" TEXT NOT NULL,
    "spellId" TEXT NOT NULL,
    "gateLevel" INTEGER NOT NULL DEFAULT 3,
    "castingAbility" TEXT NOT NULL,

    CONSTRAINT "SubclassGrantedSpell_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubclassGrantedSpell_subclassId_idx" ON "SubclassGrantedSpell"("subclassId");

-- CreateIndex
CREATE UNIQUE INDEX "SubclassGrantedSpell_subclassId_spellId_key" ON "SubclassGrantedSpell"("subclassId", "spellId");

-- AddForeignKey
ALTER TABLE "SubclassGrantedSpell" ADD CONSTRAINT "SubclassGrantedSpell_subclassId_fkey" FOREIGN KEY ("subclassId") REFERENCES "Subclass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubclassGrantedSpell" ADD CONSTRAINT "SubclassGrantedSpell_spellId_fkey" FOREIGN KEY ("spellId") REFERENCES "Spell"("id") ON DELETE CASCADE ON UPDATE CASCADE;
