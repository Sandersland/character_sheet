// Attaches catalog entitlement metadata to a character's serialized learned
// spells (#1798, epic #1795 3/6) — the read-path half of the resolver wired
// in by lib/catalog/entitlement.ts. Kept out of spellcasting.ts (already at
// the repo's complexity budget) and out of spell-state.ts (a declared "leaf
// module: persisted spellcasting JSON shape" — CatalogMeta is a wire-only
// decoration, never written back to that JSON column).
import type { CatalogMeta, SpellComponents } from "@character-sheet/shared-types";

import type { Spell } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { resolveSpellEntitlementForCharacter } from "@/lib/catalog/entitlement.js";
import type { CharacterWithRelations } from "@/lib/character/character-include.js";
import type { SpellEntry } from "@/lib/spellcasting/spell-state.js";

export type SpellEntryWithCatalog = SpellEntry & { catalog?: CatalogMeta };

// Normalize a nullable catalog column to SpellEntry's optional (undefined) —
// same convention catalogSpellToEntry (spellcasting.ts) snapshots with.
const orUndef = <T>(v: T | null): T | undefined => v ?? undefined;

/**
 * Overlay a lineage winner's `Spell` MECHANICS onto an already-learned
 * SpellEntry (#1806, epic #1795 7/7) — every field catalogSpellToEntry
 * (spellcasting.ts) snapshots at learn time EXCEPT the identity/character-
 * state fields that must survive a fork override untouched: the entry's own
 * `id` (per-character operation target), `spellId` (provenance — still
 * points at the ORIGIN Spell row, not the fork's), `prepared`, `source`,
 * `item`, and `castingAbility`. If catalogSpellToEntry's own field list
 * changes, mirror the change here too — same coupling this file's own
 * isCatalogLearned comment already calls out for that function.
 */
function overlaySpellMechanics(spell: SpellEntry, mechanics: Spell): SpellEntry {
  return {
    ...spell,
    name: mechanics.name,
    level: mechanics.level,
    school: mechanics.school,
    castingTime: mechanics.castingTime,
    range: mechanics.range,
    duration: mechanics.duration,
    description: mechanics.description,
    concentration: mechanics.concentration,
    ritual: mechanics.ritual,
    components: orUndef(mechanics.components as SpellComponents | null),
    saveEffect: orUndef(mechanics.saveEffect),
    effectKind: orUndef(mechanics.effectKind),
    effectDiceCount: orUndef(mechanics.effectDiceCount),
    effectDiceFaces: orUndef(mechanics.effectDiceFaces),
    effectModifier: orUndef(mechanics.effectModifier),
    damageType: orUndef(mechanics.damageType),
    attackType: orUndef(mechanics.attackType),
    saveAbility: orUndef(mechanics.saveAbility),
    upcastDicePerLevel: orUndef(mechanics.upcastDicePerLevel),
    cantripScaling: mechanics.cantripScaling,
    buffTarget: orUndef(mechanics.buffTarget),
    buffModifier: orUndef(mechanics.buffModifier),
  };
}

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
 * resolveSpellEntitlementForCharacter (lib/catalog/entitlement.ts) — never
 * re-derived here (CLAUDE.md "one shared function"). A subclass/species/
 * item-granted entry passes through untouched; those aren't governed by
 * catalog entitlement.
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
 *
 * When the resolved winner's own entry id differs from the learned entry's
 * OWN entry id, the lineage has a shadowing fork (#1806, epic #1795 7/7):
 * the winner's `Spell` MECHANICS (overlaySpellMechanics above) are overlaid
 * onto the served entry, replacing the learn-time snapshot. A winner equal to
 * the learned entry's own id (the ordinary, non-forked case) is left alone —
 * the stored snapshot is served as-is, exactly as before this override
 * existed, so an untouched catalog spell is never re-hydrated off the
 * (possibly since-edited) current catalog row.
 */
export async function attachSpellCatalogMeta(
  row: CharacterWithRelations,
  spells: SpellEntry[],
): Promise<SpellEntryWithCatalog[]> {
  const learned = spells.filter(isCatalogLearned);
  if (learned.length === 0) return spells;
  const storedSpellIds = [...new Set(learned.map((s) => s.spellId))];

  // storedSpells is a separate, immutable-once-written lookup (a Spell row's
  // own catalogEntryId never changes post-creation — forking always creates
  // a NEW Spell row, never mutates an old one) so it's safe alongside the
  // entitlement resolution in one Promise.all; META and MECHANICS themselves
  // come from ONE resolveSpellEntitlementForCharacter call (#1815 review
  // finding 3) rather than two independently-snapshotted ones, closing the
  // split-brain window a fork committing mid-request used to open.
  const [storedSpells, { metaByEntryId, mechanicsByEntryId }] = await Promise.all([
    prisma.spell.findMany({ where: { id: { in: storedSpellIds } }, select: { id: true, catalogEntryId: true } }),
    resolveSpellEntitlementForCharacter(row),
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
    const isShadowed = meta.entryId !== ownEntryId;
    const mechanics = isShadowed ? mechanicsByEntryId.get(ownEntryId!) : undefined;
    const served = mechanics ? overlaySpellMechanics(spell, mechanics) : spell;
    decorated.push({ ...served, catalog: meta });
  }
  return decorated;
}
