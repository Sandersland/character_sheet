import type { FeatImprovement } from "@/lib/classes/resources-state.js";
import type { CharacterWithRelations } from "@/lib/character/character-include.js";
import { buildSpeciesGrantedSpellSource, type GrantedSpellSource } from "@/lib/spellcasting/granted-spells.js";

export interface SpeciesTraitView {
  name: string;
  description: string;
}

interface SpeciesTraitRow {
  name: string;
  description: string;
  variantId: string | null;
  improvements: FeatImprovement[] | null;
}

// species.traits is Species's unfiltered back-relation (every trait FK'd to this speciesId, any variantId) — the variantId === null filter below narrows to this species' OWN traits. variant.traits needs no such filter (already scoped to one variantId). Legacy race-name-only characters (speciesId/variantId both null) resolve to [] here — no species picked yet, not a bug.
function activeTraitRows(row: CharacterWithRelations): SpeciesTraitRow[] {
  const species = row.raceSelection?.species;
  if (!species) return [];
  const speciesLevel = (species.traits as unknown as SpeciesTraitRow[]).filter((t) => t.variantId === null);
  const variantLevel = (row.raceSelection?.variant?.traits ?? []) as unknown as SpeciesTraitRow[];
  return [...speciesLevel, ...variantLevel];
}

// This function only collects trait rows — applyFeatLayer sums/dedupes their improvements through the shared deriveImprovementBonuses/deriveImprovementProficiencies evaluator. traits carries description text only, rendered verbatim by the frontend — no rule arithmetic here.
export function buildSpeciesTraitsView(row: CharacterWithRelations): {
  traits: SpeciesTraitView[];
  improvements: FeatImprovement[];
} {
  const active = activeTraitRows(row);
  return {
    traits: active.map((t) => ({ name: t.name, description: t.description })),
    improvements: active.flatMap((t) => t.improvements ?? []),
  };
}

// Feeds buildSpeciesGrantedSpellSource — the SAME shared function subclass grants also resolve through.
export function buildSpeciesGrantedSpellSourceFor(row: CharacterWithRelations): GrantedSpellSource | null {
  const { species, variant, castingAbility } = row.raceSelection ?? {};
  if (!species) return null;
  return buildSpeciesGrantedSpellSource({
    name: variant?.name ?? species.name,
    castingAbility: castingAbility ?? null,
    speciesGrantedSpells: species.grantedSpells,
    variantGrantedSpells: variant?.grantedSpells ?? [],
  });
}
