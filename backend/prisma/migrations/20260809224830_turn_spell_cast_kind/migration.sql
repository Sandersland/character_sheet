-- CreateEnum
CREATE TYPE "SpellCastKind" AS ENUM ('cantrip', 'leveled');

-- AlterTable
ALTER TABLE "SessionParticipant" ADD COLUMN     "spellCastAsAction" "SpellCastKind",
ADD COLUMN     "spellCastAsBonus" "SpellCastKind",
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
