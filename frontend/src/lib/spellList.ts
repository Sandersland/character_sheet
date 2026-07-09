// Pure spell-list derivation for SpellsSection — no JSX.
import { isMulticlass } from "@/lib/multiclass";
import type { ActiveBuff, Character, Spell, SpellSlots } from "@/types/character";

export interface SpellListDerivation {
  availableSlotLevels: number[];
  availableArcanaLevels: number[];
  learnedSpellIds: Set<string>;
  sortedSpells: Spell[];
  spellLevels: number[];
  dismissibleSpellBuffs: ActiveBuff[];
  slotsArePactMagic: boolean;
}

// Spell levels with at least one slot remaining, ascending.
function slotLevelsWithRemaining(slots: SpellSlots[]): number[] {
  return slots.filter((s) => s.used < s.total).map((s) => s.level).sort((a, b) => a - b);
}

// Mystic Arcanum spell levels with a charge remaining (Warlock 6th–9th).
function arcanaLevelsWithRemaining(arcana: SpellSlots[]): number[] {
  return arcana.filter((a) => a.used < a.total).map((a) => a.level);
}

export function deriveSpellList(character: Character): SpellListDerivation {
  const spellcasting = character.spellcasting!;
  const { slots = [], arcana = [], spells = [] } = spellcasting;

  const sortedSpells = [...spells].sort(
    (a, b) => a.level - b.level || a.name.localeCompare(b.name),
  );

  // Single-class warlocks keep Pact Magic slots in the merged `slots` block, so it
  // carries the "Pact Magic" label; a multiclass warlock's pact slots live separately.
  const slotsArePactMagic =
    (character.classes?.[0]?.name ?? "").toLowerCase() === "warlock" &&
    !isMulticlass(character.classes);

  // while-active self-buffs (e.g. Mage Armor) sourced from a spell in this book.
  const dismissibleSpellBuffs = (character.activeEffects?.buffs ?? []).filter(
    (b) => b.duration === "while-active" && spells.some((s) => s.id === b.sourceEntryId),
  );

  return {
    availableSlotLevels: slotLevelsWithRemaining(slots),
    availableArcanaLevels: arcanaLevelsWithRemaining(arcana),
    learnedSpellIds: new Set(spells.flatMap((s) => (s.spellId ? [s.spellId] : []))),
    sortedSpells,
    spellLevels: [...new Set(sortedSpells.map((s) => s.level))].sort((a, b) => a - b),
    dismissibleSpellBuffs,
    slotsArePactMagic,
  };
}

// Valid slot levels for casting a spell: levels >= spell.level with a remaining
// slot, plus a matching Mystic Arcanum charge (the backend routes a same-level
// cast to the arcanum since Pact slots cap at level 5).
export function availableSlotsForSpell(
  spell: Spell,
  availableSlotLevels: number[],
  availableArcanaLevels: number[],
): number[] {
  if (spell.level === 0) return [];
  const levels = availableSlotLevels.filter((l) => l >= spell.level);
  if (availableArcanaLevels.includes(spell.level) && !levels.includes(spell.level)) {
    levels.push(spell.level);
  }
  return levels.sort((a, b) => a - b);
}
