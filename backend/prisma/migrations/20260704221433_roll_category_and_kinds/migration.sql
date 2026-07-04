-- AlterEnum
ALTER TYPE "CharacterEventCategory" ADD VALUE 'roll';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CharacterEventType" ADD VALUE 'checkRoll';
ALTER TYPE "CharacterEventType" ADD VALUE 'saveRoll';
ALTER TYPE "CharacterEventType" ADD VALUE 'initiativeRoll';

-- Re-home existing attack/damage roll events from the `combat` category to the
-- new `roll` category so the whole roll taxonomy lives under one category.
UPDATE "CharacterEvent" SET "category" = 'roll' WHERE "type" IN ('attackRoll', 'damageRoll');
