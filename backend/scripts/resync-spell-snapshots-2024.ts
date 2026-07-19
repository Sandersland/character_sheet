// One-time migration (#1132): the SRD 5.2 catalog resweep renamed spells
// (Tasha's Hideous Laughter → Hideous Laughter), rebalanced dice, and changed
// schools/durations. A character's learned spells are FULL learn-time snapshots
// in spellcasting.spells — not live references — so a catalog edit alone does not
// reach them. This refreshes every entry that still resolves to a catalog Spell
// (by spellId) to the current catalog text/dice, preserving the per-character
// entry id, spellId, and prepared flag. It also un-strands the double-listing
// mergeGrantedSpells could produce after a rename (stale name vs new grant name).
//
// Custom entries (no spellId) and dangling spellIds (catalog row gone, e.g. Toll
// the Dead) are left untouched — those snapshots keep working forever as-is.
//
// Idempotent: a character whose snapshots already match the catalog is a no-op.
// Logs a summary (no undoable event) — this is a text/data refresh, not a
// gameplay mutation. Imports only lib/ + prisma, per the migration-script rule.
import type { PrismaClient, Spell } from "@/generated/prisma/client.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma as defaultPrisma } from "@/lib/core/prisma.js";
import { normalizeSpellcastingMutable, type SpellEntry } from "@/lib/spellcasting/spell-state.js";

// The catalog-derived fields refreshed on resync. Excludes the per-character
// entry identity (id, spellId, prepared, source, item) so those survive the
// spread that overwrites everything else.
function catalogSnapshotFields(spell: Spell) {
  return {
    name: spell.name,
    level: spell.level,
    school: spell.school,
    castingTime: spell.castingTime,
    range: spell.range,
    duration: spell.duration,
    description: spell.description,
    concentration: spell.concentration,
    ritual: spell.ritual,
    components: spell.components as SpellEntry["components"],
    saveEffect: spell.saveEffect,
    effectKind: spell.effectKind,
    effectDiceCount: spell.effectDiceCount,
    effectDiceFaces: spell.effectDiceFaces,
    effectModifier: spell.effectModifier,
    damageType: spell.damageType,
    attackType: spell.attackType,
    saveAbility: spell.saveAbility,
    upcastDicePerLevel: spell.upcastDicePerLevel,
    cantripScaling: spell.cantripScaling,
    buffTarget: spell.buffTarget,
    buffModifier: spell.buffModifier,
  };
}

// Refresh each entry that still resolves to a catalog Spell; leave custom /
// dangling entries as-is. The entry spread comes first so id/spellId/prepared/
// source/item (absent from catalogSnapshotFields) are preserved.
function resyncEntries(spells: SpellEntry[], byId: Map<string, Spell>): SpellEntry[] {
  return spells.map((entry) => {
    if (!entry.spellId) return entry;
    const spell = byId.get(entry.spellId);
    if (!spell) return entry;
    return { ...entry, ...catalogSnapshotFields(spell) };
  });
}

export interface ResyncResult {
  scannedCharacters: number;
  changedCharacters: string[];
}

/**
 * Refreshes learned SpellEntry snapshots from the current catalog. Pass a Prisma
 * client (the default connects via DATABASE_URL); returns which characters changed.
 */
export async function resyncSpellSnapshots(prisma: PrismaClient = defaultPrisma): Promise<ResyncResult> {
  const catalog = await prisma.spell.findMany();
  const byId = new Map(catalog.map((s) => [s.id, s]));

  // No where-filter on the JSON column: a null spellcasting normalizes to an
  // empty spell list, so it resyncs to itself (a skipped no-op).
  const characters = await prisma.character.findMany({
    select: { id: true, spellcasting: true },
  });

  const changedCharacters: string[] = [];

  for (const character of characters) {
    const state = normalizeSpellcastingMutable(character.spellcasting);
    const spells = resyncEntries(state.spells, byId);
    if (JSON.stringify(spells) === JSON.stringify(state.spells)) continue;

    await prisma.character.update({
      where: { id: character.id },
      data: {
        spellcasting: {
          slotsUsed: state.slotsUsed,
          arcanumUsed: state.arcanumUsed,
          spells,
          concentratingOn: state.concentratingOn,
        } as unknown as Prisma.InputJsonValue,
      },
    });
    changedCharacters.push(character.id);
  }

  return { scannedCharacters: characters.length, changedCharacters };
}

// Thin CLI: run the resync against DATABASE_URL and report the outcome.
if (import.meta.url === `file://${process.argv[1]}`) {
  resyncSpellSnapshots()
    .then((result) => {
      console.log(`Scanned ${result.scannedCharacters} character(s) with spellcasting; refreshed ${result.changedCharacters.length}.`);
      return defaultPrisma.$disconnect();
    })
    .catch(async (err) => {
      console.error(err);
      await defaultPrisma.$disconnect();
      process.exit(1);
    });
}
