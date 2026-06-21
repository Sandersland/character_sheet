-- CreateEnum
CREATE TYPE "ActionCost" AS ENUM ('action', 'bonusAction', 'reaction', 'free', 'special');

-- CreateTable
CREATE TABLE "Action" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "cost" "ActionCost" NOT NULL,
    "universal" BOOLEAN NOT NULL DEFAULT false,
    "grantClass" TEXT,
    "grantSubclass" TEXT,
    "grantLevel" INTEGER,
    "resourceKey" TEXT,
    "resourceAmount" INTEGER,

    CONSTRAINT "Action_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Action_key_key" ON "Action"("key");
