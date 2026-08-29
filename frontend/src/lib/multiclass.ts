import type { AbilityScores, Character, ClassOption } from "@/types/character";

export function isMulticlass(classes: readonly unknown[] | undefined): boolean {
  return (classes?.length ?? 0) > 1;
}

/**
 * PHB'14 ch.6 p.163–164 / SRD 5.2 Multiclassing: a class feature scales on class level, edition-invariant (XP cost and proficiency bonus are the only character-level exceptions).
 * Mirrors backend `effectiveEntryLevel`'s policy exactly — if one changes, change the other.
 * The absent-`classes` fallback reproduces `deriveRoster`'s (classFeatures.ts) synthesized entry rather than importing it, since that helper isn't exported.
 * Matching is case-insensitive: served class names are title case, callers pass a lowercase key.
 */
export function classEntryLevel(character: Character, className: string): number {
  const roster = character.classes?.length
    ? character.classes
    : [{ name: character.class, level: character.level }];
  const entry = roster.find((e) => e.name?.toLowerCase() === className.toLowerCase());
  if (!entry) return 0;
  return roster.length <= 1 ? character.level : entry.level;
}

export function classSummary(
  classes: Array<{ name: string; level: number; subclass?: string }> | undefined,
  fallback: { name: string; subclass?: string },
): string {
  if (!classes || classes.length <= 1) {
    const only = classes?.[0];
    const name = only?.name ?? fallback.name;
    const subclass = only?.subclass ?? fallback.subclass;
    return subclass ? `${name} (${subclass})` : name;
  }
  return classes
    .map((c) => (c.subclass ? `${c.name} ${c.level} (${c.subclass})` : `${c.name} ${c.level}`))
    .join(" / ");
}

// Thresholds come from the backend (ClassOption.multiclassPrerequisite) — abilities within an option are AND-ed, options are OR-ed; no rules table is duplicated here.
export function multiclassPrereqMet(
  option: ClassOption["multiclassPrerequisite"],
  scores: AbilityScores,
): boolean {
  if (!option || option.options.length === 0) return true;
  return option.options.some((opt) =>
    Object.entries(opt).every(
      ([ability, min]) => (scores[ability as keyof AbilityScores] ?? 0) >= min,
    ),
  );
}
