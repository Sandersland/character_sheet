-- CreateEnum
CREATE TYPE "EntityVisibility" AS ENUM ('HIDDEN', 'REVEALED');

-- AlterTable
ALTER TABLE "CampaignEntity" ADD COLUMN     "visibility" "EntityVisibility" NOT NULL DEFAULT 'REVEALED';
