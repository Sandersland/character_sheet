-- CreateTable
CREATE TABLE "Character" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "race" TEXT NOT NULL,
    "class" TEXT NOT NULL,
    "subclass" TEXT,
    "background" TEXT NOT NULL,
    "alignment" TEXT NOT NULL,
    "portraitUrl" TEXT,
    "experiencePoints" INTEGER NOT NULL DEFAULT 0,
    "armorClass" INTEGER NOT NULL,
    "initiativeBonus" INTEGER NOT NULL,
    "speed" INTEGER NOT NULL,
    "hitPoints" JSONB NOT NULL,
    "hitDice" JSONB NOT NULL,
    "abilityScores" JSONB NOT NULL,
    "savingThrowProficiencies" TEXT[],
    "skills" JSONB NOT NULL,
    "inventory" JSONB NOT NULL,
    "currency" JSONB NOT NULL,
    "spellcasting" JSONB,
    "journal" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Character_pkey" PRIMARY KEY ("id")
);
