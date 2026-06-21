-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('active', 'ended');

-- AlterEnum
ALTER TYPE "CharacterEventCategory" ADD VALUE 'session';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CharacterEventType" ADD VALUE 'equipped';
ALTER TYPE "CharacterEventType" ADD VALUE 'unequipped';
ALTER TYPE "CharacterEventType" ADD VALUE 'sessionStarted';
ALTER TYPE "CharacterEventType" ADD VALUE 'sessionEnded';

-- AlterTable
ALTER TABLE "CharacterEvent" ADD COLUMN     "sessionId" TEXT;

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'active',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "title" TEXT,
    "summary" JSONB,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Session_characterId_status_idx" ON "Session"("characterId", "status");

-- CreateIndex
CREATE INDEX "CharacterEvent_sessionId_createdAt_idx" ON "CharacterEvent"("sessionId", "createdAt");

-- AddForeignKey
ALTER TABLE "CharacterEvent" ADD CONSTRAINT "CharacterEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;
