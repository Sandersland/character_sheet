-- CreateEnum
CREATE TYPE "FeatCategory" AS ENUM ('origin', 'general', 'fighting_style', 'epic_boon');

-- AlterTable
ALTER TABLE "Feat" ADD COLUMN     "category" "FeatCategory" NOT NULL DEFAULT 'general',
ADD COLUMN     "levelPrerequisite" INTEGER,
ADD COLUMN     "repeatable" BOOLEAN NOT NULL DEFAULT false;
