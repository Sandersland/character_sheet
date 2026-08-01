// PHB'24 class-table "Primary Ability" per class — the ability(ies) the creation
// ability panel flags as recommended (#1161). Deliberately its own column, NOT
// derived from MULTICLASS_PREREQUISITES/multiclassPrerequisitesMet: the two
// tables agree today but answer different questions (a class's spellcasting/
// attack ability vs. its multiclass entry gate), so coupling them would be a
// coincidence, not a rule. Sourced from CharacterClass.primaryAbilities
// (#1529) — a 2024-only class-table column with no PHB'14 counterpart (PHB'14
// uses Quick Build suggestions instead), not an edition agreement.
type AbilityName =
  | "strength"
  | "dexterity"
  | "constitution"
  | "intelligence"
  | "wisdom"
  | "charisma";

/** The class's PHB'24 primary ability/abilities; [] for a homebrew/unknown class. */
export function primaryAbilities(abilities: readonly string[] | null | undefined): AbilityName[] {
  return (abilities ?? []) as AbilityName[];
}
