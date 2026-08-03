/*
  Warnings:

  - You are about to drop the column `portraitUrl` on the `Character` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Character" DROP COLUMN "portraitUrl",
ADD COLUMN     "portraitKey" TEXT;
