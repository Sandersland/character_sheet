-- #1522/#1523: ClassFeature — a seeded home for the per-class feature text that
-- lived in twelve lib/classes/*.ts modules as DerivedFeature[]. Hand-written
-- because Prisma 7 prompts interactively on `migrate dev --create-only`, and
-- its DSL cannot express the NULLS NOT DISTINCT clause below.
--
-- This migration only CREATEs a table (plus two FK constraints) on a database
-- where it doesn't exist yet — no cast, no narrowing, no backfill, no USING —
-- so it has no populated-data failure mode; scripts/check-enum-narrowing.sh's
-- guard does not apply here (a plain CREATE TABLE referencing the existing
-- RulesEdition enum triggers neither of that guard's two detection signals:
-- no replacement enum type is created, and no enum value is relabeled).

-- CreateTable
CREATE TABLE "ClassFeature" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "subclassId" TEXT,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "edition" "RulesEdition" NOT NULL,

    "resourceKey" TEXT,
    "resourceLabel" TEXT,
    "resourceRecharge" TEXT,
    "resourceTotals" JSONB,
    "resourceDieTiers" JSONB,

    "activationCost" TEXT,
    "resolverKind" TEXT,
    "requiresUnarmored" BOOLEAN NOT NULL DEFAULT false,
    "regrants" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],

    "costKind" TEXT,
    "costPoolKey" TEXT,
    "costBase" INTEGER,
    "costPerStep" INTEGER,

    "effectKind" TEXT,
    "effectDiceCount" INTEGER,
    "effectDiceFaces" INTEGER,
    "effectDieSource" TEXT,
    "effectModifier" INTEGER,
    "effectModifierSource" TEXT,
    "damageType" TEXT,
    "attackType" TEXT,
    "saveAbility" TEXT,
    "saveEffect" TEXT,
    "buffTarget" TEXT,
    "buffModifier" INTEGER,

    "derivedStat" TEXT,
    "derivedStatTiers" JSONB,

    CONSTRAINT "ClassFeature_pkey" PRIMARY KEY ("id")
);

-- NULLS NOT DISTINCT (Postgres 15+; this repo runs postgres:17-alpine) is
-- hand-written because Prisma's DSL cannot express it. `subclassId` is NULLABLE
-- and base-class features carry NULL there, so without this clause the
-- constraint enforces NOTHING for the majority of the 522 rows: two identical
-- (fighter, NULL, 'Second Wind', 'EDITION_2024') rows would both insert.
CREATE UNIQUE INDEX "ClassFeature_classId_subclassId_name_edition_key"
  ON "ClassFeature"("classId", "subclassId", "name", "edition") NULLS NOT DISTINCT;

-- CreateIndex
CREATE INDEX "ClassFeature_subclassId_idx" ON "ClassFeature"("subclassId");

-- AddForeignKey
ALTER TABLE "ClassFeature" ADD CONSTRAINT "ClassFeature_classId_fkey"
  FOREIGN KEY ("classId") REFERENCES "CharacterClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassFeature" ADD CONSTRAINT "ClassFeature_subclassId_fkey"
  FOREIGN KEY ("subclassId") REFERENCES "Subclass"("id") ON DELETE CASCADE ON UPDATE CASCADE;
