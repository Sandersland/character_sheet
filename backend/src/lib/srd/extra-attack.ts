import { resolveSubclassSlug, type SubclassIdentityInput } from "@/lib/classes/subclass-slug.js";

// Attacks made when taking the Attack action, by class + level (PHB Extra
// Attack). Multiclass takes the MAX across classes — Extra Attack never stacks.
export function deriveAttacksPerAction(
  classEntries: ReadonlyArray<SubclassIdentityInput & { name: string; level: number }>,
): number {
  return classEntries.reduce(
    (best, e) => Math.max(best, attacksForClass(e.name, e.level, e)),
    1,
  );
}

// Extra Attack progression by class (PHB), as (minLevel, attacks) tiers ordered
// highest-first. A class absent from this table — or below its first tier —
// makes 1 attack. Bard is special-cased below (subclass-gated), not tabled.
const EXTRA_ATTACK_TIERS: Record<string, ReadonlyArray<readonly [number, number]>> = {
  fighter: [[20, 4], [11, 3], [5, 2]],
  barbarian: [[5, 2]],
  monk: [[5, 2]],
  paladin: [[5, 2]],
  ranger: [[5, 2]],
};

function attacksForClass(name: string, level: number, entry: SubclassIdentityInput): number {
  const cls = name.toLowerCase();
  // College of Valor bard gains Extra Attack at bard level 6. Resolved via
  // slug (#1277), not a substring — was matched on the word "valor", which
  // let a homebrew "College of Valorous Deeds" inherit Extra Attack it never earned.
  if (cls === "bard") {
    return level >= 6 && resolveSubclassSlug(cls, entry) === "bard-college-of-valor" ? 2 : 1;
  }
  for (const [minLevel, attacks] of EXTRA_ATTACK_TIERS[cls] ?? []) {
    if (level >= minLevel) return attacks;
  }
  return 1;
}
