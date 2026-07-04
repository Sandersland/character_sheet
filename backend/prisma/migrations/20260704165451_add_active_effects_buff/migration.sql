-- AlterEnum
ALTER TYPE "CharacterEventCategory" ADD VALUE 'effects';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CharacterEventType" ADD VALUE 'buffApplied';
ALTER TYPE "CharacterEventType" ADD VALUE 'buffCleared';

-- AlterTable
ALTER TABLE "Character" ADD COLUMN     "activeEffects" JSONB;

-- AlterTable
ALTER TABLE "GrantedAbility" ADD COLUMN     "buffModifier" INTEGER,
ADD COLUMN     "buffTarget" TEXT;
