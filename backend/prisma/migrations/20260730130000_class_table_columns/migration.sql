-- #1529: class-table content still keyed by class NAME in lib/srd/ Record<string,...>
-- literals moves onto CharacterClass columns. Plain ADD COLUMN ... DEFAULT — every
-- new column is either an array (defaults to an empty Postgres array), a nullable
-- scalar (defaults to NULL), or a JSONB column defaulting to an empty JSON array —
-- so this has no populated-data failure mode: every existing CharacterClass row gets
-- the default, then prisma/seed.ts backfills the real per-class values on next seed.
-- Hand-written (not `prisma migrate dev`) because this tree's local dev database had
-- migration-history drift unrelated to this change; a plain ADD COLUMN set carries no
-- risk that `migrate dev`'s shadow-database diff would have caught anyway.

-- AlterTable
ALTER TABLE "CharacterClass"
  ADD COLUMN "armorProficiencies" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "weaponProficiencies" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "extraAsiLevels" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  ADD COLUMN "fightingStyleFeatLevel" INTEGER,
  ADD COLUMN "multiclassPrerequisites" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "primaryAbilities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
