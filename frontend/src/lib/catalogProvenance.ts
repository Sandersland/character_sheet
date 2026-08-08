// Pure display logic for catalog entitlement metadata (#1801, epic #1795
// 6/6): the scope/fork badges the picker and manage list render, and the
// eligibility check that decides whether "Fork" is even offered on a row. No
// JSX — SpellCatalogRow, SpellPickerRow, and HomebrewSpellManageRow are the
// consumers. `catalog` is optional on CatalogSpell (see that type's own
// comment), so every helper here treats a missing value as "no metadata to
// show" rather than throwing.
//
// Every helper below reads ONLY `catalog` (server-computed), never `ownerId`
// (#1815 review findings 2/10): `ownerId` is set to the CatalogEntry's raw
// owner, which for a row granted/shared into the viewer's campaign is the
// GRANTER's id, not "mine" — an ownerId-driven rule here would show the
// wrong scope badge and hide the Fork button on exactly the row this epic's
// primary use case is about (a member forking a spell shared into their
// campaign). `catalog.editable` already IS "can the viewer edit this in
// place" (isCatalogEntryEditable, backend lib/catalog/entitlement.ts) — the
// single source of truth both helpers below key off, correct for granted
// entries because it was computed against the real viewer, not derived
// client-side from an incidental id.
import type { CatalogSpell } from "@/types/character";

/** A short badge label for a row's scope, or null for GLOBAL/no-metadata rows (the default, unbadged case). */
export function scopeBadgeLabel(spell: CatalogSpell): string | null {
  if (!spell.catalog) return null;
  if (spell.catalog.scope === "USER") {
    return spell.catalog.editable ? "My homebrew" : "Shared homebrew";
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
// homebrew are all "make your own version" candidates — exactly the rows
// `catalog.editable` is false for (a row the viewer CAN already edit in
// place has Edit/Delete instead; forking it here would just be a confusing
// second path to the same content).
export function isForkable(spell: CatalogSpell): boolean {
  return spell.catalog !== undefined && spell.catalog.editable === false;
}
