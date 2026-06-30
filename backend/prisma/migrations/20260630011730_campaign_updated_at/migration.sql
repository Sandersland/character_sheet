-- AlterTable: backfill existing rows with the current timestamp via a transient
-- default, then drop it so @updatedAt is application-managed going forward.
ALTER TABLE "Campaign" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Campaign" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "CampaignMembership" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "CampaignMembership" ALTER COLUMN "updatedAt" DROP DEFAULT;
