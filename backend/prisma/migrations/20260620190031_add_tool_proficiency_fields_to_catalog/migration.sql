-- AlterTable
ALTER TABLE "Background" ADD COLUMN     "toolProficiencies" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "CharacterClass" ADD COLUMN     "toolChoiceCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "toolChoices" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "toolProficiencies" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Race" ADD COLUMN     "toolProficiencies" TEXT[] DEFAULT ARRAY[]::TEXT[];
