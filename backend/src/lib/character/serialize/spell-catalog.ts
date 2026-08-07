// Attaches catalog entitlement metadata to a character's serialized learned
// spells (#1798, epic #1795 3/6) — the read-path half of the resolver wired
// in by lib/catalog/entitlement.ts. Kept out of spellcasting.ts (already at
// the repo's complexity budget) and out of spell-state.ts (a declared "leaf
// module: persisted spellcasting JSON shape" — CatalogMeta is a wire-only
// decoration, never written back to that JSON column).
import type { CatalogMeta } from "@character-sheet/shared-types";

import { prisma } from "@/lib/core/prisma.js";
import { resolveSpellEntitlementMetaForCharacter } from "@/lib/catalog/entitlement.js";
import type { CharacterWithRelations } from "@/lib/character/character-include.js";
import type { SpellEntry } from "@/lib/spellcasting/spell-state.js";

export type SpellEntryWithCatalog = SpellEntry & { catalog?: CatalogMeta };

// A genuinely catalog-learned entry: `spellId` set AND no `source` tag.
// `source` (subclass/species/item, spell-state.ts) marks a DERIVED grant —
// item-granted entries carry a `spellId` too, but it's the capability's own
// spell-reference slug (ItemSpellMeta), not necessarily a real Spell.id, so
// it must never be looked up against the catalog; only a plain player-learned
// entry (catalogSpellToEntry's own shape, no `source`) is catalog-governed.
function isCatalogLearned(spell: SpellEntry): spell is SpellEntry & { spellId: string } {
  return Boolean(spell.spellId) && !spell.source;
}

/**
 * Attach `catalog.{scope,isFork,forkedFromId}` to every catalog-backed
 * learned spell (isCatalogLearned above), resolved through
 * resolveSpellEntitlementMetaForCharacter (lib/catalog/entitlement.ts) —
 * never re-derived here (CLAUDE.md "one shared function"). A
 * subclass/species/item-granted entry passes through untouched; those
 * aren't governed by catalog entitlement.
 *
 * The lookup is a single hop, by id only: the entry's OWN catalogEntryId,
 * looked up in the meta map the resolver already keys by EVERY visible
 * candidate id (winners and shadowed lineage members alike) to its
 * lineage's winner. That is what lets a stale pre-shadow id resolve straight
 * to a DM's later CAMPAIGN fork — the "shadows the original for campaign
 * members" behavior (#1798) — with no second, name-based precedence path at
 * this call site (a prior version fell back to matching by spell name,
 * which a same-named-but-unrelated lineage could collide with — see the
 * regression test pinning that exact scenario).
 *
 * An entry whose catalogEntryId isn't in the map at all has had its
 * entitlement revoked entirely (homebrew un-shared, grant pulled) and is
 * dropped from the served sheet.
 */
export async function attachSpellCatalogMeta(
  row: CharacterWithRelations,
  spells: SpellEntry[],
): Promise<SpellEntryWithCatalog[]> {
  const learned = spells.filter(isCatalogLearned);
  if (learned.length === 0) return spells;
  const storedSpellIds = [...new Set(learned.map((s) => s.spellId))];

  const [storedSpells, metaByEntryId] = await Promise.all([
    prisma.spell.findMany({ where: { id: { in: storedSpellIds } }, select: { id: true, catalogEntryId: true } }),
    resolveSpellEntitlementMetaForCharacter(row),
  ]);
  const catalogEntryIdBySpellId = new Map(storedSpells.map((s) => [s.id, s.catalogEntryId]));

  const decorated: SpellEntryWithCatalog[] = [];
  for (const spell of spells) {
    if (!isCatalogLearned(spell)) {
      decorated.push(spell);
      continue;
    }
    const ownEntryId = catalogEntryIdBySpellId.get(spell.spellId);
    const meta = ownEntryId ? metaByEntryId.get(ownEntryId) : undefined;
    if (!meta) continue;
    decorated.push({ ...spell, catalog: meta });
  }
  return decorated;
}
