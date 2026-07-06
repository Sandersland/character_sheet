/**
 * Target picker for a spell row. Damage spells toggle self/other (other relays
 * to the DM). Healing spells offer self plus one button per opted-in ally, so a
 * rolled heal lands on that party member's sheet (#462). Locked to self when the
 * spell's range is exactly "Self".
 */

import { isAllyTarget, type AllyOption, type Target } from "@/lib/spellMeta";

interface SpellTargetToggleProps {
  target: Target;
  locked: boolean;
  disabled: boolean;
  healing: boolean;
  allies: AllyOption[];
  onSelect: (target: Target) => void;
}

const PILL = "rounded px-1.5 py-0.5 text-[11px] font-semibold transition-colors disabled:opacity-40";

export default function SpellTargetToggle({ target, locked, disabled, healing, allies, onSelect }: SpellTargetToggleProps) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      <span className="text-[11px] text-parchment-600">Target:</span>
      <button
        type="button"
        disabled={locked || disabled}
        onClick={() => onSelect("self")}
        className={`${PILL} ${
          target === "self"
            ? "bg-vitality-600 text-parchment-50"
            : "bg-parchment-100 text-parchment-600 hover:bg-parchment-200"
        }`}
      >
        self
      </button>

      {healing
        ? allies.map((ally) => {
            const selected = isAllyTarget(target) && target.characterId === ally.characterId;
            return (
              <button
                key={ally.characterId}
                type="button"
                disabled={locked || disabled}
                onClick={() => onSelect(ally)}
                className={`${PILL} ${
                  selected
                    ? "bg-vitality-600 text-parchment-50"
                    : "bg-parchment-100 text-parchment-600 hover:bg-parchment-200"
                }`}
              >
                {ally.name}
              </button>
            );
          })
        : (
            <button
              type="button"
              disabled={locked || disabled}
              onClick={() => onSelect("other")}
              className={`${PILL} ${
                target === "other"
                  ? "bg-garnet-600 text-parchment-50"
                  : "bg-parchment-100 text-parchment-600 hover:bg-parchment-200"
              }`}
            >
              other
            </button>
          )}
    </div>
  );
}
