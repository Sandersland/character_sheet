// Counting and selection helpers for the character-creation spell/cantrip picker
// (#1131). Everything numeric here arrives from the reference payload's
// level1SpellPicks. Since #1377 that includes the highest learnable level, and
// eligibility itself is applied by GET /api/spells — no rule lives in this file.
import type { CatalogSpell, ClassOption } from "@/types/character";

/** The served level-1 pick budget: two caps plus the legal level ceiling. */
export type CreationSpellCounts = NonNullable<ClassOption["level1SpellPicks"]>;

/**
 * Split an already-eligible catalog into the picker's two groups by the served
 * `level` field. This is not the eligibility rule — the class list and the level
 * ceiling were applied by GET /api/spells before these rows arrived (#1377).
 */
export function splitCreationCatalog(catalog: CatalogSpell[] | null): {
  cantrips: CatalogSpell[];
  spells: CatalogSpell[];
} {
  const rows = catalog ?? [];
  return { cantrips: rows.filter((s) => s.level === 0), spells: rows.filter((s) => s.level > 0) };
}

/** The chosen class's level-1 pick counts, or null for a non-caster (from the payload). */
export function creationSpellCounts(selectedClass: ClassOption | undefined): CreationSpellCounts | null {
  return selectedClass?.level1SpellPicks ?? null;
}

/**
 * The leveled-spell pick cap for creation (#1513): `spellbookSize` when served
 * (the Wizard split — its creation pick count is a spellbook size, not its
 * prepared cap), else `spells`. Mirrors the server gate's own precedence
 * (`creationSpellCountError` reads the same `level1SpellPicksFor` object) so
 * the cap can never be read two ways — the number itself is served, never
 * derived here.
 */
export function creationLeveledPickCap(counts: CreationSpellCounts): number {
  return counts.spellbookSize ?? counts.spells;
}

/** Toggle an id in a selection list; refuses to add past `cap` (deselect always allowed). */
export function toggleCreationPick(current: string[], id: string, cap: number): string[] {
  if (current.includes(id)) return current.filter((x) => x !== id);
  if (current.length >= cap) return current;
  return [...current, id];
}

/**
 * Unmet creation spell requirements as short display labels ("Cantrips: choose 2").
 * Empty for a non-caster (null counts) or when both lists match their counts.
 */
export function creationSpellsMissing(
  counts: CreationSpellCounts | null,
  cantripIds: string[],
  spellIds: string[],
): string[] {
  if (!counts) return [];
  const missing: string[] = [];
  if (cantripIds.length !== counts.cantrips) missing.push(`Cantrips: choose ${counts.cantrips}`);
  const spellsCap = creationLeveledPickCap(counts);
  if (spellIds.length !== spellsCap) missing.push(`Spells: choose ${spellsCap}`);
  return missing;
}
