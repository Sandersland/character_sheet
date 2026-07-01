import { useState } from "react";
import { Minus, Plus } from "lucide-react";

export default function RestControls({
  availableDice,
  pending,
  onShortRest,
  onLongRest,
}: {
  availableDice: number;
  pending: boolean;
  onShortRest: (n: number) => void;
  onLongRest: () => void;
}) {
  const [diceToSpend, setDiceToSpend] = useState("1");

  return (
    <div className="flex flex-wrap items-end gap-3 border-t border-parchment-200 pt-3">
      {/* Short rest */}
      <div className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-parchment-600">
        <span>Short rest — dice to spend</span>
        <div className="flex gap-2">
          <div className="inline-flex items-center rounded-control border border-parchment-300 bg-parchment-50">
            <button
              type="button"
              disabled={pending || availableDice === 0}
              onClick={() =>
                setDiceToSpend(String(Math.max(1, (parseInt(diceToSpend, 10) || 1) - 1)))
              }
              aria-label="Decrease dice to spend"
              className="flex h-8 w-8 items-center justify-center rounded-control text-parchment-600 transition-colors hover:bg-parchment-100 disabled:opacity-50"
            >
              <Minus aria-hidden="true" className="h-4 w-4" />
            </button>
            <input
              type="number"
              min={1}
              max={availableDice}
              step={1}
              value={diceToSpend}
              onChange={(e) => setDiceToSpend(e.target.value)}
              disabled={pending || availableDice === 0}
              aria-label="Dice to spend"
              className="w-12 border-0 bg-transparent text-center text-lg tabular-nums text-parchment-900 disabled:opacity-50"
            />
            <button
              type="button"
              disabled={pending || availableDice === 0}
              onClick={() =>
                setDiceToSpend(
                  String(Math.min(availableDice, (parseInt(diceToSpend, 10) || 1) + 1)),
                )
              }
              aria-label="Increase dice to spend"
              className="flex h-8 w-8 items-center justify-center rounded-control text-parchment-600 transition-colors hover:bg-parchment-100 disabled:opacity-50"
            >
              <Plus aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
          <button
            type="button"
            disabled={pending || availableDice === 0}
            onClick={() => onShortRest(parseInt(diceToSpend, 10))}
            className="rounded-control bg-parchment-300 px-3 py-1.5 text-sm font-semibold text-parchment-800 transition-colors hover:bg-parchment-400 disabled:opacity-50"
          >
            Rest
          </button>
        </div>
      </div>

      {/* Long rest */}
      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-parchment-600">
          Long rest
        </span>
        <button
          type="button"
          disabled={pending}
          onClick={onLongRest}
          className="rounded-control bg-arcane-100 px-3 py-1.5 text-sm font-semibold text-arcane-800 transition-colors hover:bg-arcane-200 disabled:opacity-50"
        >
          Full rest
        </button>
      </div>
    </div>
  );
}
