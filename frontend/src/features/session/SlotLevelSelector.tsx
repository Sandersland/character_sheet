/** Upcast slot selector: a level strip when several slots are available, else a label. */

import type { Spell } from "@/types/character";

interface SlotLevelSelectorProps {
  spell: Spell;
  availableSlots: number[];
  spellSlot: number | undefined;
  usesArcanum: boolean;
  onSelect: (level: number) => void;
}

export default function SlotLevelSelector({
  spell,
  availableSlots,
  spellSlot,
  usesArcanum,
  onSelect,
}: SlotLevelSelectorProps) {
  if (availableSlots.length === 0) return null;

  if (availableSlots.length === 1) {
    return (
      <span className="text-[11px] text-parchment-600">
        {usesArcanum ? "Mystic Arcanum" : `Slot: L${availableSlots[0]}`}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] text-parchment-600">Slot:</span>
      {availableSlots.map((lvl) => (
        <button
          key={lvl}
          type="button"
          onClick={() => onSelect(lvl)}
          className={`rounded px-1.5 py-0.5 text-[11px] font-semibold transition-colors ${
            spellSlot === lvl
              ? "bg-arcane-700 text-parchment-50"
              : "bg-arcane-100 text-arcane-800 hover:bg-arcane-200"
          }`}
        >
          L{lvl}
          {lvl !== spell.level && <span className="ml-0.5 opacity-60">↑</span>}
        </button>
      ))}
    </div>
  );
}
