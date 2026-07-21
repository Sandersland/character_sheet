/**
 * Upcast slot picker (#1163): the level already reads off the section header,
 * so this renders nothing in the single-slot case — only when a spell has
 * more than one legal slot does the player need to choose one.
 */

import type { Spell } from "@/types/character";

interface SlotLevelSelectorProps {
  spell: Spell;
  availableSlots: number[];
  spellSlot: number | undefined;
  onSelect: (level: number) => void;
}

export default function SlotLevelSelector({
  spell,
  availableSlots,
  spellSlot,
  onSelect,
}: SlotLevelSelectorProps) {
  if (availableSlots.length <= 1) return null;

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
