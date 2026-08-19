-- CreateEnum
CREATE TYPE "InboxFlagKind" AS ENUM ('DUPLICATE_CLUSTER', 'NEEDS_CHRONICLING');

-- (#1571) The Spell_catalogEntryId_fkey DropForeignKey `prisma migrate dev`
-- generated here is stripped on purpose, same as
-- 20260815014400_fix_catalog_entry_index_name: that FK is hand-written onto a
-- deliberately relationless scalar (Spell.catalogEntryId has no Prisma
-- @relation), so every diff proposes dropping it — applying that would
-- destroy real integrity.

-- CreateTable
CREATE TABLE "InboxDismissal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "kind" "InboxFlagKind" NOT NULL,
    "signature" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InboxDismissal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InboxDismissal_userId_campaignId_idx" ON "InboxDismissal"("userId", "campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "InboxDismissal_userId_kind_signature_key" ON "InboxDismissal"("userId", "kind", "signature");

-- AddForeignKey
ALTER TABLE "InboxDismissal" ADD CONSTRAINT "InboxDismissal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboxDismissal" ADD CONSTRAINT "InboxDismissal_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
