import { CHIP_BASE } from "@/features/character-create/ability-assignment/constants";
import type { AbilityMethod } from "@/hooks/useCharacterDraft";

const METHOD_CHIPS: [AbilityMethod, string][] = [
  ["manual", "Manual entry"],
  ["roll", "Roll 4d6"],
  ["standardArray", "Standard array"],
  ["pointBuy", "Point buy"],
];

export function MethodChips({ method, onSelect }: { method: AbilityMethod; onSelect: (m: AbilityMethod) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {METHOD_CHIPS.map(([value, label]) => (
        <button
          key={value}
          type="button"
          onClick={() => onSelect(value)}
          className={`${CHIP_BASE} ${
            method === value
              ? "border-arcane-500 bg-arcane-50 text-arcane-800"
              : "border-parchment-300 text-parchment-600 hover:border-arcane-400"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function PoolChips({
  pool,
  used,
  held,
  onHold,
}: {
  pool: number[];
  used: Set<number>;
  held: number | null;
  onHold: (index: number | null) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Ability score pool">
      {pool.map((value, index) => {
        const isUsed = used.has(index);
        const isHeld = held === index;
        return (
          <button
            key={index}
            type="button"
            aria-label={`Assign ${value}`}
            disabled={isUsed}
            onClick={() => onHold(isHeld ? null : index)}
            className={`inline-flex h-9 w-11 items-center justify-center rounded-control border font-display text-sm tabular-nums transition-colors ${
              isUsed
                ? "border-parchment-300 bg-parchment-100 text-parchment-400 line-through"
                : isHeld
                  ? "border-garnet-surface bg-garnet-surface text-garnet-on-surface"
                  : "border-arcane-400 bg-arcane-50 text-arcane-800 hover:border-garnet-600"
            }`}
          >
            {value}
          </button>
        );
      })}
    </div>
  );
}
