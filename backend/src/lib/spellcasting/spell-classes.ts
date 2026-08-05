/**
 * Shared read-side shape for the Spell↔SpellClass join (#1711, F2 of epic
 * #1517's 2014 catalog fork). Every membership READ composes
 * SPELL_CLASS_MEMBERSHIP_SELECT into its own `select`/`include` and flattens
 * the result back to `classes: string[]` with `classesOf` — the wire/served
 * shape every caller (route JSON, level-up eligibility, creation picks) still
 * exposes, so the join stays an internal storage detail (CLAUDE.md: the
 * frontend never originates a rule, and never re-derives one).
 */
export const SPELL_CLASS_MEMBERSHIP_SELECT = {
  classMemberships: { select: { className: true } },
} as const;

/** Flattens a row's `classMemberships` relation to the served `classes: string[]` shape. */
export function classesOf(spell: { classMemberships: { className: string }[] }): string[] {
  return spell.classMemberships.map((m) => m.className);
}
