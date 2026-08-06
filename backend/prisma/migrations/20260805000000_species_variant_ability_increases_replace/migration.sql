-- Astral Elf (#1751): a variant whose ability increases REPLACE the base
-- species' rather than stacking (fetchMergedAbilityIncreases). Default false
-- keeps every existing subrace additive.
ALTER TABLE "SpeciesVariant" ADD COLUMN "abilityIncreasesReplace" BOOLEAN NOT NULL DEFAULT false;
