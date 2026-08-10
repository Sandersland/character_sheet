-- AlterTable
ALTER TABLE "Feat" ADD COLUMN     "classes" TEXT[] DEFAULT ARRAY[]::TEXT[];
