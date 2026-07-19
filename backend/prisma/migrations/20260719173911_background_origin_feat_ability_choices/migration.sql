-- AlterTable
ALTER TABLE "Background" ADD COLUMN     "abilityChoices" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "originFeatId" TEXT;

-- AddForeignKey
ALTER TABLE "Background" ADD CONSTRAINT "Background_originFeatId_fkey" FOREIGN KEY ("originFeatId") REFERENCES "Feat"("id") ON DELETE SET NULL ON UPDATE CASCADE;
