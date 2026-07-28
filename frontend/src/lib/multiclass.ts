import type { AbilityScores, Character, ClassOption } from "@/types/character";

/** True when the character has more than one class entry. */
export function isMulticlass(classes: readonly unknown[] | undefined): boolean {
  return (classes?.length ?? 0) > 1;
}

/**
 * A character's level *in one class* (PHB'14 ch.6 p.163–164 / SRD 5.2
 * Multiclassing — a class feature scales on class level; XP cost and
 * proficiency bonus are the only character-level exceptions, neither of which
 * this helper serves). No `edition` parameter: both texts agree.
 *
 * Mirrors backend `effectiveEntryLevel`'s policy exactly (single-class ⇒ the
 * XP-derived `character.level`, because the per-entry `level` column can be
 * stale and self-heals lazily on HP level-up; multiclass ⇒ the entry's own
 * level) — if one changes, change the other. The absent-`classes` fallback
 * reproduces `deriveRoster`'s (classFeatures.ts) synthesized single entry
 * rather than importing it, since that helper isn't exported.
 *
 * Matching is case-insensitive: served `classes[].name` / `character.class`
 * are catalog display names (title case, e.g. "Monk"), while callers here
 * pass a lowercase key.
 *
 * #1379/#1380/#1435 are expected to move these reads server-side onto
 * `DERIVED_ACTIONS`/the level-up HP meta — this helper keeps that move an
 * honest "no behaviour change" refactor by being correct in the meantime.
 */
export function classEntryLevel(character: Character, className: string): number {
  const roster = character.classes?.length
    ? character.classes
    : [{ name: character.class, level: character.level }];
  const entry = roster.find((e) => e.name?.toLowerCase() === className.toLowerCase());
  if (!entry) return 0;
  return roster.length <= 1 ? character.level : entry.level;
}

/**
 * Renders the class line shown wherever the UI previously showed one class.
 * Single-class → just the name (with subclass in parens) so those sheets look
 * unchanged; multiclass → per-class levels joined "Wizard 5 / Cleric 3".
 */
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

/**
 * Whether `scores` satisfy a class's 5e multiclass ability prerequisite. The
 * option thresholds come from the backend (ClassOption.multiclassPrerequisite),
 * so no rules table is duplicated here — abilities within an option are AND-ed,
 * options are OR-ed. No prerequisite (homebrew) = always met.
 */
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
