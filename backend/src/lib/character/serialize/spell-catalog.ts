// Attaches catalog entitlement metadata to a character's serialized learned
// spells (#1798, epic #1795 3/6) — the read-path half of the resolver wired
// in by lib/catalog/entitlement.ts. Kept out of spellcasting.ts (already at
// the repo's complexity budget) and out of spell-state.ts (a declared "leaf
// module: persisted spellcasting JSON shape" — CatalogMeta is a wire-only
// decoration, never written back to that JSON column).
import type { CatalogMeta } from "@character-sheet/shared-types";

import { prisma } from "@/lib/core/prisma.js";
import { resolveSpellEntryIdsForCharacter } from "@/lib/catalog/entitlement.js";
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
 * resolveSpellEntryIdsForCharacter — never re-derived here (CLAUDE.md "one
 * shared function"). A subclass/species/item-granted entry passes through
 * untouched; those aren't governed by catalog entitlement.
 *
 * Matching a stored entry to the resolver's winning set is two-tier:
 *   1. exact — the entry's OWN catalogEntryId is itself a winner (the common
 *      case: nothing has forked over it).
 *   2. by name — a fork always retains its origin's name (it's a full copy),
 *      so when the entry's own id lost precedence to a fork in its lineage
 *      (pickShadowWinners, entitlement.ts), the fork is found by name and
 *      its metadata is what's served — this is the "DM's CAMPAIGN fork
 *      shadows the original for campaign members" behavior (#1798).
 * An entry matching neither tier has had its entitlement revoked entirely
 * (homebrew un-shared, grant pulled) and is dropped from the served sheet.
 */
export async function attachSpellCatalogMeta(
  row: CharacterWithRelations,
  spells: SpellEntry[],
): Promise<SpellEntryWithCatalog[]> {
  const learned = spells.filter(isCatalogLearned);
  if (learned.length === 0) return spells;
  const storedSpellIds = [...new Set(learned.map((s) => s.spellId))];

  const winningEntryIds = await resolveSpellEntryIdsForCharacter(row);
  if (winningEntryIds.length === 0) {
    return spells.filter((s) => !isCatalogLearned(s));
  }

  const [storedSpells, winningSpells, winningEntries] = await Promise.all([
    prisma.spell.findMany({ where: { id: { in: storedSpellIds } }, select: { id: true, catalogEntryId: true } }),
    prisma.spell.findMany({
      where: { catalogEntryId: { in: winningEntryIds } },
      select: { name: true, catalogEntryId: true },
    }),
    prisma.catalogEntry.findMany({
      where: { id: { in: winningEntryIds } },
      select: { id: true, scope: true, forkedFromId: true },
    }),
  ]);

  const catalogEntryIdBySpellId = new Map(storedSpells.map((s) => [s.id, s.catalogEntryId]));
  const entryById = new Map(winningEntries.map((e) => [e.id, e]));
  const metaByEntryId = new Map<string, CatalogMeta>();
  const metaByName = new Map<string, CatalogMeta>();
  for (const spell of winningSpells) {
    const entry = entryById.get(spell.catalogEntryId);
    if (!entry) continue;
    const meta: CatalogMeta = {
      entryId: entry.id,
      scope: entry.scope,
      isFork: entry.forkedFromId !== null,
      forkedFromId: entry.forkedFromId,
    };
    metaByEntryId.set(entry.id, meta);
    metaByName.set(spell.name.toLowerCase(), meta);
  }

  const decorated: SpellEntryWithCatalog[] = [];
  for (const spell of spells) {
    if (!isCatalogLearned(spell)) {
      decorated.push(spell);
      continue;
    }
    const ownEntryId = catalogEntryIdBySpellId.get(spell.spellId);
    const meta = (ownEntryId ? metaByEntryId.get(ownEntryId) : undefined) ?? metaByName.get(spell.name.toLowerCase());
    if (!meta) continue;
    decorated.push({ ...spell, catalog: meta });
  }
  return decorated;
}
