// Pure spell-list derivation for SpellsSection — no JSX.
import { isMulticlass } from "@/lib/multiclass";
import { availableArcanaLevels, availableSlotLevels } from "@/lib/spellPicker";
import type { ActiveBuff, Character, Spell } from "@/types/character";

export interface SpellListDerivation {
  availableSlotLevels: number[];
  availableArcanaLevels: number[];
  learnedSpellIds: Set<string>;
  sortedSpells: Spell[];
  spellLevels: number[];
  dismissibleSpellBuffs: ActiveBuff[];
  slotsArePactMagic: boolean;
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
    availableSlotLevels: availableSlotLevels(slots),
    availableArcanaLevels: availableArcanaLevels(arcana),
    learnedSpellIds: new Set(spells.flatMap((s) => (s.spellId ? [s.spellId] : []))),
    sortedSpells,
    spellLevels: [...new Set(sortedSpells.map((s) => s.level))].sort((a, b) => a - b),
    dismissibleSpellBuffs,
    slotsArePactMagic,
  };
}

