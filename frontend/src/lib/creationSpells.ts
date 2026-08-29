// Eligibility itself is applied by GET /api/spells — no rule lives in this file.
import type { CatalogSpell, ClassOption } from "@/types/character";

export type CreationSpellCounts = NonNullable<ClassOption["level1SpellPicks"]>;

export function splitCreationCatalog(catalog: CatalogSpell[] | null): {
  cantrips: CatalogSpell[];
  spells: CatalogSpell[];
} {
  const rows = catalog ?? [];
  return { cantrips: rows.filter((s) => s.level === 0), spells: rows.filter((s) => s.level > 0) };
}

export function creationSpellCounts(selectedClass: ClassOption | undefined): CreationSpellCounts | null {
  return selectedClass?.level1SpellPicks ?? null;
}

// Mirrors creationSpellCountError's own precedence over the same level1SpellPicksFor object, so the cap can never be read two ways — the number itself is served, never derived here.
export function creationLeveledPickCap(counts: CreationSpellCounts): number {
  return counts.spellbookSize ?? counts.spells;
}

export function toggleCreationPick(current: string[], id: string, cap: number): string[] {
  if (current.includes(id)) return current.filter((x) => x !== id);
  if (current.length >= cap) return current;
  return [...current, id];
}

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
