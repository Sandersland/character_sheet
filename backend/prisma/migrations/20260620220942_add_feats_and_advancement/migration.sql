-- AlterEnum
ALTER TYPE "CharacterEventCategory" ADD VALUE 'advancement';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CharacterEventType" ADD VALUE 'abilityScoreImprovement';
ALTER TYPE "CharacterEventType" ADD VALUE 'featTaken';
ALTER TYPE "CharacterEventType" ADD VALUE 'advancementRemoved';
ALTER TYPE "CharacterEventType" ADD VALUE 'advancementsReconciled';

-- CreateTable
CREATE TABLE "Feat" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "prerequisite" TEXT,
    "abilityOptions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "abilityIncrease" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Feat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Feat_name_key" ON "Feat"("name");
