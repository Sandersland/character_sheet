// Slot-level picker for leveled spells with multiple available slots (upcast-aware).
import { upcastSlotOptions } from "@/lib/spellRow";
import type { Spell } from "@/types/character";

interface SpellSlotPickerProps {
  spell: Spell;
  characterLevel: number;
  availableSlots: number[];
  busy: boolean;
  onPick: (slotLevel: number) => void;
  onCancel: () => void;
}

export default function SpellSlotPicker({
  spell, characterLevel, availableSlots, busy, onPick, onCancel,
}: SpellSlotPickerProps) {
  const options = upcastSlotOptions(spell, characterLevel, availableSlots);
  return (
    <div className="mt-2 flex flex-wrap items-start gap-2">
      <span className="py-0.5 text-xs text-parchment-600">Cast with slot:</span>
      {options.map(({ slotLevel, isUpcast, effect }) => (
        <button
          key={slotLevel}
          type="button"
          disabled={busy}
          onClick={() => onPick(slotLevel)}
          className="flex flex-col items-center rounded bg-arcane-100 px-2 py-0.5 text-xs font-semibold text-arcane-800 hover:bg-arcane-200 disabled:opacity-40"
          title={isUpcast ? `Upcast ${spell.name} with a level ${slotLevel} slot` : `Cast ${spell.name} with a level ${slotLevel} slot`}
        >
          <span>
            L{slotLevel}
            {isUpcast && <span aria-hidden="true"> ↑</span>}
          </span>
          {isUpcast && effect && (
            <span className="font-normal text-[10px] text-arcane-800">{effect}</span>
          )}
        </button>
      ))}
      <button
        type="button"
        onClick={onCancel}
        className="py-0.5 text-xs text-parchment-600 hover:text-parchment-700"
      >
        cancel
      </button>
    </div>
  );
}
