// One-time migration (#1127): the 2024 rules unify every caster into the prepared
// model. In 2014 the "known" casters (Bard/Sorcerer/Ranger/Warlock and the
// Eldritch Knight / Arcane Trickster third casters) stored their learned spells
// UNPREPARED — every known spell was castable, so the prepared flag was cosmetic.
// Under 2024 rules casting reads the prepared set, so this flips those learned
// spells to prepared up to the new per-class cap (oldest first), so nobody loses
// access. Prepared casters (Cleric/Druid/Paladin/Wizard) already stored the flag
// correctly and are skipped.
//
// Idempotent: a character already at/over its cap of prepared entries is a no-op.
// Each changed character gets one undoable "prepareSpell" event (full spellcasting
// before/after snapshots, restored by the spellcasting revert branch in activity.ts).
//
// Run with the application OFFLINE/idle: the up-front fetch is written back
// verbatim per character, so a cast landing mid-run would be overwritten.
//
// Imports only lib/ rule functions + prisma (no route/serialize code), per the
// migration-script rule in CLAUDE.md.
import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@/generated/prisma/client.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma as defaultPrisma } from "@/lib/core/prisma.js";
import { logEvent } from "@/lib/activity/events.js";
import { levelForExperience } from "@/lib/leveling/experience.js";
import { clampPreparedToLimit, normalizeSpellcastingMutable } from "@/lib/spellcasting/spell-state.js";
import { derivePreparedSpellLimit } from "@/lib/srd/spellcasting-tables.js";

// Frozen set of 2014 known-caster classes + third-caster subclasses — the only
// entries whose learned spells were stored unprepared. Hardcoded (not derived
// from a rule function) because it is a historical data fact about the pre-2024
// storage shape, not a live rule; it must not drift with future table edits.
const KNOWN_CASTER_CLASSES = new Set(["bard", "sorcerer", "ranger", "warlock"]);
const KNOWN_THIRD_SUBCLASSES = new Set(["eldritch knight", "arcane trickster"]);

interface MigrationEntry {
  name: string;
  level: number;
  subclass: string | null;
}

function hasKnownCasterEntry(entries: MigrationEntry[]): boolean {
  return entries.some(
    (e) => KNOWN_CASTER_CLASSES.has(e.name.toLowerCase()) || KNOWN_THIRD_SUBCLASSES.has((e.subclass ?? "").toLowerCase()),
  );
}

// Entry-level resolution mirrors buildSpellcastingOp: single-class uses the
// XP-derived level (the per-class column can be stale); multiclass uses per-entry.
function limitEntriesFor(experiencePoints: number, entries: MigrationEntry[]): MigrationEntry[] {
  if (entries.length === 1) {
    return [{ name: entries[0].name, level: levelForExperience(experiencePoints), subclass: entries[0].subclass }];
  }
  return entries;
}

// Flip the first (cap − alreadyPrepared) user-learned leveled entries to prepared,
// in array order. Returns the new spells array + how many were newly prepared.
function prepareUpToCap(
  spells: Array<{ prepared: boolean; level: number; source?: string }>,
  limit: number,
): { spells: typeof spells; preparedAdded: number } {
  let prepared = spells.filter((s) => s.prepared && s.level > 0 && s.source == null).length;
  let preparedAdded = 0;
  const next = spells.map((s) => {
    if (prepared >= limit) return s;
    if (s.level > 0 && s.source == null && !s.prepared) {
      prepared++;
      preparedAdded++;
      return { ...s, prepared: true };
    }
    return s;
  });
  return { spells: next, preparedAdded };
}

export interface MigrationResult {
  scannedCharacters: number;
  changedCharacters: string[];
}

/**
 * Marks known-caster learned spells prepared up to the 2024 cap. Pass a Prisma
 * client (the default connects via DATABASE_URL); returns which characters changed.
 */
export async function migrateKnownCastersPrepared(prisma: PrismaClient = defaultPrisma): Promise<MigrationResult> {
  const characters = await prisma.character.findMany({
    where: {
      classEntries: {
        some: {
          OR: [
            { name: { in: [...KNOWN_CASTER_CLASSES] } },
            { subclass: { in: ["Eldritch Knight", "Arcane Trickster", "eldritch knight", "arcane trickster"] } },
          ],
        },
      },
    },
    select: {
      id: true,
      experiencePoints: true,
      spellcasting: true,
      classEntries: { orderBy: { position: "asc" as const }, select: { name: true, level: true, subclass: true } },
    },
  });

  const changedCharacters: string[] = [];

  for (const character of characters) {
    if (!hasKnownCasterEntry(character.classEntries)) continue;

    const limit = derivePreparedSpellLimit(limitEntriesFor(character.experiencePoints, character.classEntries));
    if (limit == null) continue;

    const state = normalizeSpellcastingMutable(character.spellcasting);
    // clampPreparedToLimit guarantees we never exceed the cap; prepareUpToCap raises
    // the prepared set toward it. Compose so an over-cap blob is first trimmed.
    const trimmed = clampPreparedToLimit(state.spells, limit).spells;
    const { spells, preparedAdded } = prepareUpToCap(trimmed, limit);
    if (preparedAdded === 0) continue;

    const snapshot = (list: typeof state.spells) => ({
      spellcasting: {
        slotsUsed: { ...state.slotsUsed },
        arcanumUsed: { ...state.arcanumUsed },
        spells: [...list],
        concentratingOn: state.concentratingOn ? { ...state.concentratingOn } : null,
      },
    });
    const before = snapshot(state.spells);
    const after = snapshot(spells as typeof state.spells);
    const batchId = randomUUID();

    await prisma.$transaction(async (tx) => {
      await tx.character.update({
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
      await logEvent(tx, {
        characterId: character.id,
        category: "spellcasting",
        type: "prepareSpell",
        summary: `2024 rules migration: ${preparedAdded} spell${preparedAdded > 1 ? "s" : ""} marked prepared`,
        before,
        after,
        data: { migration: "prepared-2024", preparedAdded, limit },
        batchId,
      });
    });

    changedCharacters.push(character.id);
  }

  return { scannedCharacters: characters.length, changedCharacters };
}

// Thin CLI: run the migration against DATABASE_URL and report the outcome.
if (import.meta.url === `file://${process.argv[1]}`) {
  migrateKnownCastersPrepared()
    .then((result) => {
      console.log(`Scanned ${result.scannedCharacters} known-caster character(s); updated ${result.changedCharacters.length}.`);
      return defaultPrisma.$disconnect();
    })
    .catch(async (err) => {
      console.error(err);
      await defaultPrisma.$disconnect();
      process.exit(1);
    });
}
