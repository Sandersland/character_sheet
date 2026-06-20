/*
  Warnings:

  - Added the required column `toolProficiencies` to the `Character` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable: default [] for existing rows, then remove the server default
-- so the application always supplies the value.
ALTER TABLE "Character" ADD COLUMN "toolProficiencies" JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "Character" ALTER COLUMN "toolProficiencies" DROP DEFAULT;
