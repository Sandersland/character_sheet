-- AlterTable
ALTER TABLE "CharacterRace" ADD COLUMN     "abilityBonuses" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "speciesId" TEXT,
ADD COLUMN     "variantId" TEXT,
ADD COLUMN     "variantName" TEXT;

-- CreateTable
CREATE TABLE "Species" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "speed" INTEGER NOT NULL,
    "edition" "RulesEdition" NOT NULL,
    "abilityIncreases" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "Species_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpeciesVariant" (
    "id" TEXT NOT NULL,
    "speciesId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "speedOverride" INTEGER,
    "abilityIncreases" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "SpeciesVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpeciesTrait" (
    "id" TEXT NOT NULL,
    "speciesId" TEXT NOT NULL,
    "variantId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "improvements" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "SpeciesTrait_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpeciesGrantedSpell" (
    "id" TEXT NOT NULL,
    "speciesId" TEXT NOT NULL,
    "variantId" TEXT,
    "spellId" TEXT NOT NULL,
    "gateLevel" INTEGER NOT NULL,

    CONSTRAINT "SpeciesGrantedSpell_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Species_name_edition_key" ON "Species"("name", "edition");

-- CreateIndex
CREATE UNIQUE INDEX "Species_slug_edition_key" ON "Species"("slug", "edition");

-- CreateIndex
CREATE UNIQUE INDEX "SpeciesVariant_speciesId_name_key" ON "SpeciesVariant"("speciesId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "SpeciesVariant_speciesId_slug_key" ON "SpeciesVariant"("speciesId", "slug");

-- CreateIndex
CREATE INDEX "SpeciesGrantedSpell_speciesId_idx" ON "SpeciesGrantedSpell"("speciesId");

-- AddForeignKey
ALTER TABLE "SpeciesVariant" ADD CONSTRAINT "SpeciesVariant_speciesId_fkey" FOREIGN KEY ("speciesId") REFERENCES "Species"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeciesTrait" ADD CONSTRAINT "SpeciesTrait_speciesId_fkey" FOREIGN KEY ("speciesId") REFERENCES "Species"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeciesTrait" ADD CONSTRAINT "SpeciesTrait_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "SpeciesVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeciesGrantedSpell" ADD CONSTRAINT "SpeciesGrantedSpell_speciesId_fkey" FOREIGN KEY ("speciesId") REFERENCES "Species"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeciesGrantedSpell" ADD CONSTRAINT "SpeciesGrantedSpell_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "SpeciesVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeciesGrantedSpell" ADD CONSTRAINT "SpeciesGrantedSpell_spellId_fkey" FOREIGN KEY ("spellId") REFERENCES "Spell"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterRace" ADD CONSTRAINT "CharacterRace_speciesId_fkey" FOREIGN KEY ("speciesId") REFERENCES "Species"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterRace" ADD CONSTRAINT "CharacterRace_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "SpeciesVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
