-- AlterTable
ALTER TABLE "Spell" ADD COLUMN     "ownerId" TEXT;

-- CreateIndex
CREATE INDEX "Spell_ownerId_idx" ON "Spell"("ownerId");

-- AddForeignKey
ALTER TABLE "Spell" ADD CONSTRAINT "Spell_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
