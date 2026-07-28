// Pure logic for the level-up New Spells step (#890): reads the plan step's
// meta, filters the catalog to the spells this level can scribe, and toggles the
// draft's learnSpell ops under a hard cap. The spell-level ceiling and the class
// lists (#1440: spellLists/cantripLists, Magical Secrets-aware and edition-forked
// via magicalSecretsSpellLists) are both derived on the backend and ride in
// step.meta — never re-encoded here. This module is a display filter over a
// server-authoritative decision; the real enforcement is
// assertPickSpellEligibility on the transaction endpoint.
import type { CatalogSpell, ForgetSpellOperation, LearnSpellOperation, LevelUpStep, Spell } from "@/types/character";

export interface NewSpellsMeta {
  count: number;
  maxSpellLevel: number;
  magicalSecrets: boolean;
  /** #1101/#1127: an onLevelUp-cadence caster may swap one prepared spell this level-up. */
  canSwap: boolean;
  /** #1131: new cantrips to pick this level (0 when the cantrips-known column is flat). */
  cantrips: number;
  /**
   * #1440: class lists a leveled pick may come from, served by
   * magicalSecretsSpellLists (backend). `null` = unrestricted (PHB'14 Bard "from
   * any class"). Branch on `=== null`, never truthiness — `[]` is truthy.
   */
  spellLists: string[] | null;
  /** #1440: class lists a cantrip pick may come from — a SEPARATE served value
   * from spellLists (2024 Magical Secrets never broadens cantrips; a qualifying
   * 2014 Bard is unrestricted on both facets). */
  cantripLists: string[] | null;
}

/** Safe reads of the newSpells step: count, the derived ceiling, secrets, swap, cantrip count, and the served lists. */
export function readNewSpellsMeta(step: LevelUpStep): NewSpellsMeta {
  const max = step.meta?.maxSpellLevel;
  const cantrips = step.meta?.cantrips;
  return {
    count: step.count ?? 0,
    maxSpellLevel: typeof max === "number" ? max : 0,
    magicalSecrets: step.meta?.magicalSecrets === true,
    canSwap: step.meta?.canSwap === true,
    cantrips: typeof cantrips === "number" ? cantrips : 0,
    spellLists: (step.meta?.spellLists as string[] | null | undefined) ?? null,
    cantripLists: (step.meta?.cantripLists as string[] | null | undefined) ?? null,
  };
}

/** Swappable prepared spells (#1101/#1127): a user-learned (source null) leveled spell — not a cantrip or granted/item spell. */
export function swappableKnownSpells(spells: Spell[]): Spell[] {
  return spells.filter((s) => s.source == null && s.level > 0);
}

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
 * or below the ceiling, on ONE of the served `spellLists` — `null` admits any
 * class (PHB'14 unrestricted Bard Magical Secrets). This is a DISPLAY FILTER over
 * a server-authoritative list computed by `magicalSecretsSpellLists` (backend)
 * and enforced by `assertPickSpellEligibility`; it never originates the rule.
 */
export function eligibleNewSpells(
  catalog: CatalogSpell[] | null,
  opts: { maxSpellLevel: number; spellLists: string[] | null },
): CatalogSpell[] {
  const onList = (s: CatalogSpell) =>
    opts.spellLists === null || s.classes.some((c) => opts.spellLists!.includes(c));
  return (catalog ?? []).filter((s) => s.level >= 1 && s.level <= opts.maxSpellLevel && onList(s));
}

/**
 * Catalog cantrips (level 0) on ONE of the served `cantripLists` — `null` admits
 * any class (PHB'14 "...or a cantrip"). A display filter, same contract as
 * `eligibleNewSpells` — `cantripLists` is a SEPARATE served value, never derived
 * from `spellLists` (2024 Magical Secrets broadens spells but not cantrips).
 */
export function eligibleNewCantrips(
  catalog: CatalogSpell[] | null,
  opts: { cantripLists: string[] | null },
): CatalogSpell[] {
  return (catalog ?? []).filter(
    (s) => s.level === 0 && (opts.cantripLists === null || s.classes.some((c) => opts.cantripLists!.includes(c))),
  );
}

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Display label for a served class-list facet (spellLists or cantripLists):
 * `null` → "any class's" (PHB'14 unrestricted); one class → its capitalized name;
 * several → comma-joined with an Oxford "or" (matches the 2024 Magical Secrets
 * "Bard, Cleric, Druid, or Wizard" phrasing).
 */
export function spellListsLabel(lists: string[] | null): string {
  if (lists === null) return "any class's";
  const names = lists.map(capitalize);
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} or ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, or ${names[names.length - 1]}`;
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
