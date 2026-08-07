-- AlterTable
ALTER TABLE "Spell" ADD COLUMN     "ownerId" TEXT;

-- CreateIndex
CREATE INDEX "Spell_ownerId_idx" ON "Spell"("ownerId");

-- AddForeignKey
ALTER TABLE "Spell" ADD CONSTRAINT "Spell_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Widen the (name, edition) business key to (name, edition, ownerId) so two
-- users can each homebrew a same-named spell, and a homebrew spell can share
-- a name with a seeded one — see the schema's why-comment on this index.
-- Hand-written (not `prisma migrate dev`-generated) because Prisma's DSL
-- cannot express NULLS NOT DISTINCT (Postgres 15+); the clause is carried
-- forward from 20260804223111_spell_edition so seeded (ownerId: NULL) rows
-- keep enforcing global (name, edition) uniqueness among themselves — without
-- it, Postgres would treat every NULL ownerId as distinct and admit
-- unbounded duplicate seeded rows sharing a name.

-- DropIndex
DROP INDEX "Spell_name_edition_key";

-- CreateIndex
CREATE UNIQUE INDEX "Spell_name_edition_ownerId_key" ON "Spell"("name", "edition", "ownerId") NULLS NOT DISTINCT;
