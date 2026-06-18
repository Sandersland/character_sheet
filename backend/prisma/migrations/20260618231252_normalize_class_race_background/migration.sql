-- AlterTable
ALTER TABLE "Character" DROP COLUMN "background",
DROP COLUMN "class",
DROP COLUMN "race",
DROP COLUMN "subclass";

-- CreateTable
CREATE TABLE "Race" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "speed" INTEGER NOT NULL,

    CONSTRAINT "Race_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterClass" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hitDie" TEXT NOT NULL,
    "savingThrows" TEXT[],
    "skillChoiceCount" INTEGER NOT NULL,
    "skillChoices" TEXT[],
    "isSpellcaster" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CharacterClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Background" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "skillProficiencies" TEXT[],

    CONSTRAINT "Background_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterRace" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "raceId" TEXT,
    "name" TEXT NOT NULL,

    CONSTRAINT "CharacterRace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterBackground" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "backgroundId" TEXT,
    "name" TEXT NOT NULL,

    CONSTRAINT "CharacterBackground_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterClassEntry" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "classId" TEXT,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "subclass" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CharacterClassEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Race_name_key" ON "Race"("name");

-- CreateIndex
CREATE UNIQUE INDEX "CharacterClass_name_key" ON "CharacterClass"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Background_name_key" ON "Background"("name");

-- CreateIndex
CREATE UNIQUE INDEX "CharacterRace_characterId_key" ON "CharacterRace"("characterId");

-- CreateIndex
CREATE UNIQUE INDEX "CharacterBackground_characterId_key" ON "CharacterBackground"("characterId");

-- AddForeignKey
ALTER TABLE "CharacterRace" ADD CONSTRAINT "CharacterRace_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterRace" ADD CONSTRAINT "CharacterRace_raceId_fkey" FOREIGN KEY ("raceId") REFERENCES "Race"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterBackground" ADD CONSTRAINT "CharacterBackground_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterBackground" ADD CONSTRAINT "CharacterBackground_backgroundId_fkey" FOREIGN KEY ("backgroundId") REFERENCES "Background"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterClassEntry" ADD CONSTRAINT "CharacterClassEntry_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterClassEntry" ADD CONSTRAINT "CharacterClassEntry_classId_fkey" FOREIGN KEY ("classId") REFERENCES "CharacterClass"("id") ON DELETE SET NULL ON UPDATE CASCADE;

