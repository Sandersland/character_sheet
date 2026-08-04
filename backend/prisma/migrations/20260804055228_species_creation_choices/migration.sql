-- AlterTable
ALTER TABLE "CharacterRace" ADD COLUMN     "speciesCantripName" TEXT,
ADD COLUMN     "speciesSkills" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "SpeciesTrait" ADD COLUMN     "choice" JSONB;
