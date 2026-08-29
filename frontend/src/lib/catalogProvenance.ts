// Reads only catalog (server-computed, backend isCatalogEntryEditable) — never ownerId, which is the GRANTER's id on a shared/granted row, not the viewer's (#1815).
import type { CatalogSpell } from "@/types/character";

export function scopeBadgeLabel(spell: CatalogSpell): string | null {
  if (!spell.catalog) return null;
  if (spell.catalog.scope === "USER") {
    return spell.catalog.editable ? "My homebrew" : "Shared homebrew";
  }
  if (spell.catalog.scope === "CAMPAIGN") return "Campaign homebrew";
  return null;
}

export function isForkedSpell(spell: CatalogSpell): boolean {
  return spell.catalog?.isFork === true;
}

// Forkable = editable is false — anything the viewer can't already edit in place (seeded, shared, DM's campaign homebrew).
export function isForkable(spell: CatalogSpell): boolean {
  return spell.catalog !== undefined && spell.catalog.editable === false;
}
