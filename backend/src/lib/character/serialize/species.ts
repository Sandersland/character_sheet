// Species-granted trait view + improvements layer (#1682) — mirrors #1691's
// ClassFeature improvements layer (buildResourcesView's classFeatureImprovements
// + applyFeatLayer's merge, serialize/classes.ts) but sourced from
// CharacterRace's species/variant selection (#1679) instead of a class
// entry's feature rows. Reuses the SAME deriveImprovementBonuses/
// deriveImprovementProficiencies evaluator (lib/srd/feats.ts) through
// applyFeatLayer's existing merge point — no second helper (class-feature-
// rows.ts's improvementsFromRows JSDoc anticipates exactly this reuse).
import type { FeatImprovement } from "@/lib/classes/resources-state.js";
import type { CharacterWithRelations } from "@/lib/character/character-include.js";

/** The species-granted sheet section's own row shape (#1682) — cited text only. */
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

/**
 * Active trait rows for the character's OWN species/variant selection: every
 * species-level row (variantId: null) plus the picked variant's own rows.
 * `species.traits` is the Species -> SpeciesTrait back-relation, which
 * returns EVERY trait FK'd to this speciesId regardless of variantId (plain
 * Prisma relation semantics) — the `variantId === null` filter below is what
 * narrows it to "this species' OWN traits", not "every trait any of its
 * variants have too". `variant.traits` needs no such filter: SpeciesVariant's
 * own back-relation is already scoped to that one variantId.
 *
 * Legacy `race`-name-only characters (speciesId/variantId both null, #1679's
 * additive migration — the species picker itself ships in #1680) resolve to
 * [] here: no species picked yet, not a bug. `characterInclude` loads
 * `raceSelection.species`/`.variant` unconditionally; Prisma resolves both to
 * null when the FK is null, so this never queries.
 *
 * `improvements` is cast once here (`as unknown as SpeciesTraitRow[]`),
 * mirroring featureRowsOf's identical cast of Prisma's opaque Json column to
 * the FeatImprovement[] shape validated at seed time
 * (speciesTraitSeedSchema, prisma/seed/species-traits-data.ts) — not
 * re-validated on every read.
 */
function activeTraitRows(row: CharacterWithRelations): SpeciesTraitRow[] {
  const species = row.raceSelection?.species;
  if (!species) return [];
  const speciesLevel = (species.traits as unknown as SpeciesTraitRow[]).filter((t) => t.variantId === null);
  const variantLevel = (row.raceSelection?.variant?.traits ?? []) as unknown as SpeciesTraitRow[];
  return [...speciesLevel, ...variantLevel];
}

/**
 * The species-granted sheet section (#1682) — a name + cited-text row per
 * active trait, and the flat FeatImprovement[] applyFeatLayer merges into its
 * combined-improvements list (serialize/classes.ts) ALONGSIDE
 * clampedAdvancements and classFeatureImprovements, through the ONE
 * deriveImprovementBonuses/deriveImprovementProficiencies evaluator. Dwarven
 * Toughness's maxHp-per-level bonus and Mountain Dwarf/Dwarf/Elf weapon-and-
 * armor training all resolve through that shared merge — this function only
 * collects the rows, never sums or dedupes them itself.
 *
 * `traits` carries text only (no rule arithmetic) — the frontend renders it
 * verbatim (CLAUDE.md: rules logic is backend-owned, the frontend never
 * originates a rule).
 */
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
