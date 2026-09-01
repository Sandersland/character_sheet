import type { CatalogMeta, SpellComponents } from "@character-sheet/shared-types";

import type { Spell } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { resolveSpellEntitlementForCharacter } from "@/lib/catalog/entitlement.js";
import type { CharacterWithRelations } from "@/lib/character/character-include.js";
import type { SpellEntry } from "@/lib/spellcasting/spell-state.js";

export type SpellEntryWithCatalog = SpellEntry & { catalog?: CatalogMeta };

// Same null-to-undefined convention catalogSpellToEntry uses.
const orUndef = <T>(v: T | null): T | undefined => v ?? undefined;

// Overlays winner Spell MECHANICS onto a learned entry — every field EXCEPT the identity/character-state fields (id, spellId, prepared, source, item, castingAbility) survives untouched. If catalogSpellToEntry's own field list changes, mirror the change here too.
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
    instanceCount: orUndef(mechanics.instanceCount),
    instanceRoll: orUndef(mechanics.instanceRoll),
    upcastInstancesPerLevel: orUndef(mechanics.upcastInstancesPerLevel),
    buffTarget: orUndef(mechanics.buffTarget),
    buffModifier: orUndef(mechanics.buffModifier),
  };
}

// item-granted entries carry a spellId too, but it's the capability's own reference slug (ItemSpellMeta), not a real Spell.id — must never be looked up against the catalog.
function isCatalogLearned(spell: SpellEntry): spell is SpellEntry & { spellId: string } {
  return Boolean(spell.spellId) && !spell.source;
}

// Resolved through resolveSpellEntitlementForCharacter — never re-derived here.
// Looked up by id only, never by name — a prior version matched by spell name, which a same-named-but-unrelated lineage could collide with (regression, see the pinning test).
// Only overlaid when shadowed (meta.entryId !== ownEntryId) — an untouched entry stays pinned to its learn-time snapshot, never re-hydrated off the current catalog row.
export async function attachSpellCatalogMeta(
  row: CharacterWithRelations,
  spells: SpellEntry[],
): Promise<SpellEntryWithCatalog[]> {
  const learned = spells.filter(isCatalogLearned);
  if (learned.length === 0) return spells;
  const storedSpellIds = [...new Set(learned.map((s) => s.spellId))];

  // storedSpells is safe alongside entitlement resolution in one Promise.all: a Spell row's catalogEntryId never changes post-creation (forking creates a NEW row). META and MECHANICS come from ONE resolveSpellEntitlementForCharacter call (#1815), closing a split-brain window a fork committing mid-request could open.
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
