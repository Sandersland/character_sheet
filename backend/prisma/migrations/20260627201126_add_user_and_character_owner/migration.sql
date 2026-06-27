-- Add the identity/ownership models and backfill Character.ownerId.
--
-- A plain schema-diff would emit `ADD COLUMN "ownerId" TEXT NOT NULL`, which
-- fails on any non-empty Character table. This migration is hand-ordered to be
-- safe on a database that already holds characters:
--   1. create the identity tables + their indexes
--   2. add ownerId as NULLABLE
--   3. guarded backfill — only if ownerless characters exist, mint one
--      bootstrap User and point every ownerless character at it
--   4. promote ownerId to NOT NULL, then add its index + FK
-- After this runs there are ZERO ownerless characters, so the NOT NULL +
-- cascade FK apply cleanly.

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "expiresAt" INTEGER,
    "tokenType" TEXT,
    "scope" TEXT,
    "idToken" TEXT,
    "passwordHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AuthAccount_provider_providerAccountId_key" ON "AuthAccount"("provider", "providerAccountId");

-- CreateIndex
CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("userId");

-- AlterTable: add ownerId as nullable first so existing rows survive.
ALTER TABLE "Character" ADD COLUMN "ownerId" TEXT;

-- Backfill: only when ownerless characters exist, mint a single emailless
-- bootstrap user. (No-op on a fresh/empty database — matches the app-layer
-- resolveBootstrapOwnerId() behaviour.)
INSERT INTO "User" ("id", "email", "name", "createdAt", "updatedAt")
SELECT gen_random_uuid(), NULL, 'Bootstrap Owner', now(), now()
WHERE EXISTS (SELECT 1 FROM "Character" WHERE "ownerId" IS NULL);

-- Point every ownerless character at that bootstrap user (the only user that
-- can exist at this point on a previously-userless database).
UPDATE "Character"
SET "ownerId" = (SELECT "id" FROM "User" ORDER BY "createdAt" ASC, "id" ASC LIMIT 1)
WHERE "ownerId" IS NULL;

-- Now that no NULLs remain, enforce NOT NULL.
ALTER TABLE "Character" ALTER COLUMN "ownerId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Character_ownerId_idx" ON "Character"("ownerId");

-- AddForeignKey
ALTER TABLE "Character" ADD CONSTRAINT "Character_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthAccount" ADD CONSTRAINT "AuthAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
