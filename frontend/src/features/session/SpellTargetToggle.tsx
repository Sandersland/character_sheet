/** self/other target toggle for a spell row (locked to self when range is "Self"). */

import type { Target } from "@/lib/spellMeta";

interface SpellTargetToggleProps {
  target: Target;
  locked: boolean;
  disabled: boolean;
  onSelect: (target: Target) => void;
}

export default function SpellTargetToggle({ target, locked, disabled, onSelect }: SpellTargetToggleProps) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[11px] text-parchment-600">Target:</span>
      <button
        type="button"
        disabled={locked || disabled}
        onClick={() => onSelect("self")}
        className={`rounded px-1.5 py-0.5 text-[11px] font-semibold transition-colors disabled:opacity-40 ${
          target === "self"
            ? "bg-vitality-600 text-parchment-50"
            : "bg-parchment-100 text-parchment-600 hover:bg-parchment-200"
        }`}
      >
        self
      </button>
      <button
        type="button"
        disabled={locked || disabled}
        onClick={() => onSelect("other")}
        className={`rounded px-1.5 py-0.5 text-[11px] font-semibold transition-colors disabled:opacity-40 ${
          target === "other"
            ? "bg-garnet-600 text-parchment-50"
            : "bg-parchment-100 text-parchment-600 hover:bg-parchment-200"
        }`}
      >
        other
      </button>
    </div>
  );
}
