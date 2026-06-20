-- CreateEnum
CREATE TYPE "SpellSchool" AS ENUM ('abjuration', 'conjuration', 'divination', 'enchantment', 'evocation', 'illusion', 'necromancy', 'transmutation');

-- AlterEnum
ALTER TYPE "CharacterEventCategory" ADD VALUE 'spellcasting';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CharacterEventType" ADD VALUE 'castSpell';
ALTER TYPE "CharacterEventType" ADD VALUE 'expendSlot';
ALTER TYPE "CharacterEventType" ADD VALUE 'restoreSlot';
ALTER TYPE "CharacterEventType" ADD VALUE 'learnSpell';
ALTER TYPE "CharacterEventType" ADD VALUE 'forgetSpell';
ALTER TYPE "CharacterEventType" ADD VALUE 'prepareSpell';
ALTER TYPE "CharacterEventType" ADD VALUE 'unprepareSpell';

-- CreateTable
CREATE TABLE "Spell" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "school" "SpellSchool" NOT NULL,
    "castingTime" TEXT NOT NULL,
    "range" TEXT NOT NULL,
    "duration" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "concentration" BOOLEAN NOT NULL DEFAULT false,
    "ritual" BOOLEAN NOT NULL DEFAULT false,
    "classes" TEXT[],
    "effectKind" TEXT,
    "effectDiceCount" INTEGER,
    "effectDiceFaces" INTEGER,
    "effectModifier" INTEGER,
    "damageType" TEXT,
    "attackType" TEXT,
    "saveAbility" TEXT,
    "upcastDicePerLevel" INTEGER,
    "cantripScaling" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Spell_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Spell_name_key" ON "Spell"("name");
