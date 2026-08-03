/*
  Warnings:

  - You are about to drop the column `portraitUrl` on the `CampaignEntity` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "CampaignEntity" DROP COLUMN "portraitUrl",
ADD COLUMN     "portraitKey" TEXT;
