// Pure logic for the character-creation spell/cantrip picker (#1131). Pick counts
// come ONLY from the reference payload's level1SpellPicks — the frontend never
// re-encodes the SRD 5.2 tables. Eligibility mirrors the backend creation filter:
// a catalog spell on the class's list at exactly level 0 (cantrip) or 1.
import type { CatalogSpell, ClassOption } from "@/types/character";

export interface CreationSpellCounts {
  cantrips: number;
  spells: number;
}

/** The chosen class's level-1 pick counts, or null for a non-caster (from the payload). */
export function creationSpellCounts(selectedClass: ClassOption | undefined): CreationSpellCounts | null {
  return selectedClass?.level1SpellPicks ?? null;
}

/** Catalog cantrips (level 0) on the class's spell list. */
export function eligibleCreationCantrips(catalog: CatalogSpell[] | null, className: string): CatalogSpell[] {
  const cls = className.toLowerCase();
  return (catalog ?? []).filter((s) => s.level === 0 && s.classes.includes(cls));
}

/** Catalog level-1 spells on the class's spell list. */
export function eligibleCreationSpells(catalog: CatalogSpell[] | null, className: string): CatalogSpell[] {
  const cls = className.toLowerCase();
  return (catalog ?? []).filter((s) => s.level === 1 && s.classes.includes(cls));
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
  if (spellIds.length !== counts.spells) missing.push(`Spells: choose ${counts.spells}`);
  return missing;
}
