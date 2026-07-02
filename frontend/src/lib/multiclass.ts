import type { AbilityScores, ClassOption } from "@/types/character";

/** True when the character has more than one class entry. */
export function isMulticlass(classes: readonly unknown[] | undefined): boolean {
  return (classes?.length ?? 0) > 1;
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
