-- #1546 Part B chunk 3: ClassFeature.saveDcAbilities — the ability list a
-- row's announced save DC is computed from (8 + proficiency bonus + the
-- higher of the named ability modifiers). A plain ADD COLUMN with a default
-- against a populated table — no cast, no backfill, not part of any unique
-- index, so no populated-data failure mode. Hand-written for consistency with
-- this migration family (Prisma 7 prompts interactively on
-- `migrate dev --create-only`), though this one needed no NULLS NOT DISTINCT
-- clause or other DSL gap.

-- AlterTable
ALTER TABLE "ClassFeature" ADD COLUMN "saveDcAbilities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
