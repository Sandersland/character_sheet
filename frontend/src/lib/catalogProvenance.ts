// Pure display logic for catalog entitlement metadata (#1801, epic #1795
// 6/6): the scope/fork badges the picker and manage list render, and the
// eligibility check that decides whether "Fork" is even offered on a row. No
// JSX — SpellCatalogRow, SpellPickerRow, and HomebrewSpellManageRow are the
// consumers. `catalog` is optional on CatalogSpell (see that type's own
// comment), so every helper here treats a missing value as "no metadata to
// show" rather than throwing.
import type { CatalogSpell } from "@/types/character";

/** A short badge label for a row's scope, or null for GLOBAL/no-metadata rows (the default, unbadged case). */
export function scopeBadgeLabel(spell: CatalogSpell): string | null {
  if (!spell.catalog) return null;
  if (spell.catalog.scope === "USER") {
    return spell.ownerId !== undefined ? "My homebrew" : "Shared homebrew";
  }
  if (spell.catalog.scope === "CAMPAIGN") return "Campaign homebrew";
  return null;
}

/** Whether a row is a fork of another catalog entry — a badge, not an action. */
export function isForkedSpell(spell: CatalogSpell): boolean {
  return spell.catalog?.isFork === true;
}

// A row is forkable when the caller doesn't already own it outright: seeded
// (GLOBAL) content, a campaign-mate's shared homebrew, or a DM's campaign
// homebrew are all "make your own version" candidates. `ownerId` is the
// server's own signal for "editable in place by me" (custom-spells.ts's own
// comment) — a row I already own has Edit/Delete instead, so forking it here
// would just be a confusing second path to the same content.
export function isForkable(spell: CatalogSpell): boolean {
  return spell.catalog !== undefined && spell.ownerId === undefined;
}
