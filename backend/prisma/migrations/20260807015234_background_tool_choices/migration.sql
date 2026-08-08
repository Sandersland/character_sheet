-- AlterTable
ALTER TABLE "Background" ADD COLUMN     "toolChoiceCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "toolChoices" TEXT[] DEFAULT ARRAY[]::TEXT[];
