// Pure logic for the level-up New Spells step (#890): reads the plan step's
// meta, filters the catalog to the spells this level can scribe, and toggles the
// draft's learnSpell ops under a hard cap. The spell-level ceiling itself is
// derived on the backend (maxSpellLevelForClass) and rides in step.meta — never
// re-encoded here.
import type { CatalogSpell, ForgetSpellOperation, LearnSpellOperation, LevelUpStep, Spell } from "@/types/character";

export interface NewSpellsMeta {
  count: number;
  maxSpellLevel: number;
  magicalSecrets: boolean;
  /** #1101/#1127: an onLevelUp-cadence caster may swap one prepared spell this level-up. */
  canSwap: boolean;
}

/** Safe reads of the newSpells step: count, the derived ceiling, secrets, and swap flags. */
export function readNewSpellsMeta(step: LevelUpStep): NewSpellsMeta {
  const max = step.meta?.maxSpellLevel;
  return {
    count: step.count ?? 0,
    maxSpellLevel: typeof max === "number" ? max : 0,
    magicalSecrets: step.meta?.magicalSecrets === true,
    canSwap: step.meta?.canSwap === true,
  };
}

/** Swappable prepared spells (#1101/#1127): a user-learned (source null) leveled spell — not a cantrip or granted/item spell. */
export function swappableKnownSpells(spells: Spell[]): Spell[] {
  return spells.filter((s) => s.source == null && s.level > 0);
}

// Bard Magical Secrets (SRD 5.2): from level 10, picks may come from any of these
// spell lists (not the whole multiverse as in 2014). The backend flags the level;
// this is the display filter for the picker, mirroring the class-list filter below.
const MAGICAL_SECRETS_LISTS = ["bard", "cleric", "druid", "wizard"];

/**
 * Toggle the single optional swap forget (#1101). Selecting sets/replaces the one
 * forget (cap rises to count + 1, learns untouched); deselecting the same entry
 * clears it and trims spellsLearned back to `count` — the server requires an
 * exact learns === count + forgotten match.
 */
export function toggleForgetSpell(
  draft: { spellsForgotten?: ForgetSpellOperation[]; spellsLearned?: LearnSpellOperation[] },
  entryId: string,
  count: number,
): { spellsForgotten: ForgetSpellOperation[]; spellsLearned: LearnSpellOperation[] } {
  const learned = draft.spellsLearned ?? [];
  if (draft.spellsForgotten?.[0]?.entryId === entryId) {
    return { spellsForgotten: [], spellsLearned: learned.slice(0, count) };
  }
  return { spellsForgotten: [{ type: "forgetSpell", entryId }], spellsLearned: learned };
}

/**
 * Catalog spells learnable at this level: a leveled spell (cantrips excluded) at
 * or below the ceiling, on the class's list — unless Magical Secrets broadens the
 * filter to the Bard/Cleric/Druid/Wizard lists (still level-gated).
 */
export function eligibleNewSpells(
  catalog: CatalogSpell[] | null,
  opts: { className: string; maxSpellLevel: number; magicalSecrets: boolean },
): CatalogSpell[] {
  const className = opts.className.toLowerCase();
  const onList = (s: CatalogSpell) =>
    opts.magicalSecrets ? s.classes.some((c) => MAGICAL_SECRETS_LISTS.includes(c)) : s.classes.includes(className);
  return (catalog ?? []).filter((s) => s.level >= 1 && s.level <= opts.maxSpellLevel && onList(s));
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
