-- CreateTable
CREATE TABLE "Discipline" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "minLevel" INTEGER NOT NULL DEFAULT 3,
    "alwaysKnown" BOOLEAN NOT NULL DEFAULT false,
    "costKind" TEXT,
    "costPoolKey" TEXT,
    "costBase" INTEGER,
    "costPerStep" INTEGER,
    "effectKind" TEXT,
    "effectDiceCount" INTEGER,
    "effectDiceFaces" INTEGER,
    "effectModifier" INTEGER,
    "damageType" TEXT,
    "attackType" TEXT,
    "saveAbility" TEXT,
    "saveEffect" TEXT,
    "upcastDicePerLevel" INTEGER,
    "cantripScaling" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Discipline_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Discipline_name_key" ON "Discipline"("name");
