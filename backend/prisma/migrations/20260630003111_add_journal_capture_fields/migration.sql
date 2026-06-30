-- CreateEnum
CREATE TYPE "JournalEntryKind" AS ENUM ('NOTE', 'ENTRY');

-- CreateEnum
CREATE TYPE "EntryVisibility" AS ENUM ('PRIVATE', 'CAMPAIGN');

-- AlterTable: additive/backward-compatible. authorUserId is added nullable,
-- backfilled from each row's character owner, then enforced NOT NULL — so
-- existing ENTRY rows keep their title and gain a valid author.
ALTER TABLE "JournalEntry" ADD COLUMN     "authorUserId" TEXT,
ADD COLUMN     "kind" "JournalEntryKind" NOT NULL DEFAULT 'ENTRY',
ADD COLUMN     "loggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "visibility" "EntryVisibility" NOT NULL DEFAULT 'PRIVATE',
ALTER COLUMN "title" DROP NOT NULL;

-- Backfill authorUserId from the owning character.
UPDATE "JournalEntry" e
SET "authorUserId" = c."ownerId"
FROM "Character" c
WHERE e."characterId" = c."id";

-- Enforce NOT NULL now that every existing row has an author.
ALTER TABLE "JournalEntry" ALTER COLUMN "authorUserId" SET NOT NULL;
