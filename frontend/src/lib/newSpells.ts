// Pure logic for the level-up New Spells step (#890): reads the plan step's
// meta, filters the catalog to the spells this level can scribe, and toggles the
// draft's learnSpell ops under a hard cap. The spell-level ceiling itself is
// derived on the backend (maxSpellLevelForClass) and rides in step.meta — never
// re-encoded here.
import type { CatalogSpell, LearnSpellOperation, LevelUpStep } from "@/types/character";

export interface NewSpellsMeta {
  count: number;
  maxSpellLevel: number;
  magicalSecrets: boolean;
}

/** Safe reads of the newSpells step: count, the derived ceiling, and the secrets flag. */
export function readNewSpellsMeta(step: LevelUpStep): NewSpellsMeta {
  const max = step.meta?.maxSpellLevel;
  return {
    count: step.count ?? 0,
    maxSpellLevel: typeof max === "number" ? max : 0,
    magicalSecrets: step.meta?.magicalSecrets === true,
  };
}

/**
 * Catalog spells learnable at this level: a leveled spell (cantrips excluded) at
 * or below the ceiling, on the class's list — unless Magical Secrets waives the
 * class filter (any list, still level-gated).
 */
export function eligibleNewSpells(
  catalog: CatalogSpell[] | null,
  opts: { className: string; maxSpellLevel: number; magicalSecrets: boolean },
): CatalogSpell[] {
  const className = opts.className.toLowerCase();
  return (catalog ?? []).filter(
    (s) =>
      s.level >= 1 &&
      s.level <= opts.maxSpellLevel &&
      (opts.magicalSecrets || s.classes.includes(className)),
  );
}

/** Toggle a catalog spell in the draft's learnSpell ops; refuses to add past `cap`. */
export function toggleLearnSpell(
  current: LearnSpellOperation[],
  spellId: string,
  cap: number,
): LearnSpellOperation[] {
  if (current.some((op) => op.spellId === spellId)) {
    return current.filter((op) => op.spellId !== spellId);
  }
  if (current.length >= cap) return current;
  return [...current, { type: "learnSpell", spellId }];
}

/** Catalog spellIds currently selected (custom ops carry no spellId). */
export function selectedSpellIds(ops: LearnSpellOperation[] | undefined): string[] {
  return (ops ?? []).flatMap((op) => (op.spellId ? [op.spellId] : []));
}
