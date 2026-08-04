/**
 * Slot-level picker (#1163): the level already reads off the section header,
 * so this renders nothing in the single-slot case — only when more than one
 * legal slot exists does the player need to choose one. Generalized past
 * spell-casting (#1676, Bladesinger's Song of Defense) to `baseLevel: number`
 * instead of a full `Spell` — the only spell-specific bit was `spell.level`,
 * used purely as the "is this an upcast?" comparison baseline, which a
 * non-spell ability (Song of Defense's own minLevel) needs identically.
 */

interface SlotLevelSelectorProps {
  /** The level a choice above this one renders the "↑" marker for. */
  baseLevel: number;
  availableSlots: number[];
  spellSlot: number | undefined;
  onSelect: (level: number) => void;
}

export default function SlotLevelSelector({
  baseLevel,
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
          {lvl !== baseLevel && <span className="ml-0.5 opacity-60">↑</span>}
        </button>
      ))}
    </div>
  );
}
