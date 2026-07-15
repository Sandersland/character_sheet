// The castable spells shown in the spellcasting block: at-will cantrips plus
// prepared leveled spells, each sorted for the quick-cast list.
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
