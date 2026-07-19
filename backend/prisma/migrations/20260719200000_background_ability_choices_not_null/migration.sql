-- Corrective: 20260719173911 omitted NOT NULL on abilityChoices, drifting from
-- the non-nullable Prisma schema. Backfill any raw NULLs, then lock the column.
UPDATE "Background" SET "abilityChoices" = ARRAY[]::TEXT[] WHERE "abilityChoices" IS NULL;
ALTER TABLE "Background" ALTER COLUMN "abilityChoices" SET NOT NULL;
