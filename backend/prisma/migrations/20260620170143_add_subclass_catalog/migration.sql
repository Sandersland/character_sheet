-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CharacterEventCategory" ADD VALUE 'class';
ALTER TYPE "CharacterEventCategory" ADD VALUE 'resources';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CharacterEventType" ADD VALUE 'subclassChosen';
ALTER TYPE "CharacterEventType" ADD VALUE 'spendResource';
ALTER TYPE "CharacterEventType" ADD VALUE 'restoreResource';
ALTER TYPE "CharacterEventType" ADD VALUE 'learnManeuver';
ALTER TYPE "CharacterEventType" ADD VALUE 'forgetManeuver';

-- AlterTable
ALTER TABLE "Character" ADD COLUMN     "resources" JSONB;

-- AlterTable
ALTER TABLE "CharacterClass" ADD COLUMN     "subclassLevel" INTEGER NOT NULL DEFAULT 3;

-- AlterTable
ALTER TABLE "CharacterClassEntry" ADD COLUMN     "subclassId" TEXT;

-- CreateTable
CREATE TABLE "Subclass" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "Subclass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Maneuver" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "Maneuver_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Subclass_classId_name_key" ON "Subclass"("classId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Maneuver_name_key" ON "Maneuver"("name");

-- AddForeignKey
ALTER TABLE "Subclass" ADD CONSTRAINT "Subclass_classId_fkey" FOREIGN KEY ("classId") REFERENCES "CharacterClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterClassEntry" ADD CONSTRAINT "CharacterClassEntry_subclassId_fkey" FOREIGN KEY ("subclassId") REFERENCES "Subclass"("id") ON DELETE SET NULL ON UPDATE CASCADE;
