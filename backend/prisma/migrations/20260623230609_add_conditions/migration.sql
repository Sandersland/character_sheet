-- AlterEnum
ALTER TYPE "CharacterEventCategory" ADD VALUE 'conditions';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CharacterEventType" ADD VALUE 'conditionApplied';
ALTER TYPE "CharacterEventType" ADD VALUE 'conditionRemoved';
ALTER TYPE "CharacterEventType" ADD VALUE 'exhaustionSet';

-- AlterTable
ALTER TABLE "Character" ADD COLUMN     "conditions" JSONB;
