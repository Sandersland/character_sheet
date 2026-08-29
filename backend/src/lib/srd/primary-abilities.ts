// PHB'24 class-table "Primary Ability" per class (#1161) — deliberately its own column, not derived from multiclassPrerequisitesMet: the two answer different questions and coincide today, not by rule.
// 2024-only column, no PHB'14 counterpart (PHB'14 uses Quick Build suggestions instead).
type AbilityName =
  | "strength"
  | "dexterity"
  | "constitution"
  | "intelligence"
  | "wisdom"
  | "charisma";

export function primaryAbilities(abilities: readonly string[] | null | undefined): AbilityName[] {
  return (abilities ?? []) as AbilityName[];
}
