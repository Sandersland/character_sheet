-- AlterTable: backfill existing rows' updatedAt via a transient default, then
-- drop it so @updatedAt stays application-managed (mirrors the Campaign/
-- CampaignMembership updatedAt migration).
ALTER TABLE "Session" ADD COLUMN     "combatActive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "round" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Session" ALTER COLUMN "updatedAt" DROP DEFAULT;
