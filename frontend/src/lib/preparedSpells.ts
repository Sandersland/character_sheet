// The castable spells shown in the spellcasting block: at-will cantrips plus
// prepared leveled spells, each sorted for the quick-cast list.
import { deriveSpellRow } from "@/lib/spellRow";
import { availableSlotsForSpell } from "@/lib/spellPicker";
import type { Character, Spell } from "@/types/character";

type Spellcasting = NonNullable<Character["spellcasting"]>;

export interface PreparedCastable {
  cantrips: Spell[];
  prepared: Spell[];
}

function byName(a: Spell, b: Spell) {
  return a.name.localeCompare(b.name);
}

function byLevelThenName(a: Spell, b: Spell) {
  return a.level - b.level || byName(a, b);
}

export function derivePreparedCastable(sc: Spellcasting): PreparedCastable {
  const spells = sc.spells ?? [];
  return {
    cantrips: spells.filter((s) => s.level === 0).sort(byName),
    prepared: spells.filter((s) => s.level > 0 && s.prepared).sort(byLevelThenName),
  };
}

/**
 * The Cast door's list (#1162): at-will cantrips plus prepared leveled spells
 * that currently have a slot to spend — everything else (unprepared, or
 * prepared but out of slots) stays off the list rather than surfacing a
 * disabled/error-prone row.
 */
export function deriveCastableSpells(
  character: Character,
  availableSlotLevels: number[],
  availableArcanaLevels: number[],
): Spell[] {
  const { cantrips, prepared } = derivePreparedCastable(character.spellcasting!);
  const castableLeveled = prepared.filter(
    (s) => !deriveSpellRow(s, availableSlotsForSpell(s, availableSlotLevels, availableArcanaLevels)).noBudget,
  );
  return [...cantrips, ...castableLeveled];
}
