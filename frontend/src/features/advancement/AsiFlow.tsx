import type { AsiDraft } from "@/features/advancement/useAsiDraft";
import { ABILITY_OPTIONS } from "@/lib/abilities";

const ABILITY_CAP = 20;

interface Props {
  currentScores: Record<string, number>;
  busy: boolean;
  asi: AsiDraft;
  onApply: () => void;
}

export default function AsiFlow({ currentScores, busy, asi, onApply }: Props) {
  return (
    <div>
      <p className="mb-3 text-xs text-parchment-600">
        Distribute <span className="font-semibold">{asi.pointsLeft} point{asi.pointsLeft !== 1 ? "s" : ""}</span> remaining across any abilities (max 20 per score).
      </p>
      <div className="flex flex-col gap-2">
        {ABILITY_OPTIONS.map(({ key, label }) => {
          const current = currentScores[key] ?? 10;
          const bonus = asi.increases[key] ?? 0;
          const newVal = current + bonus;
          const canIncrease = asi.pointsLeft > 0 && newVal < ABILITY_CAP;
          const canDecrease = bonus > 0;

          return (
            <div key={key} className="flex items-center justify-between gap-2">
              <span className="w-28 text-sm text-parchment-900">{label}</span>
              <span className="tabular-nums text-sm text-parchment-600">
                {current}
                {bonus > 0 && (
                  <span className="ml-1 font-semibold text-gold-800">→ {newVal}</span>
                )}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  aria-label={`Decrease ${label}`}
                  disabled={!canDecrease || busy}
                  onClick={() => asi.adjust(key, -1, current)}
                  className="flex h-6 w-6 items-center justify-center rounded-control border border-parchment-300 text-sm text-parchment-600 hover:bg-parchment-100 disabled:opacity-30"
                >
                  −
                </button>
                <span className="w-4 text-center text-sm font-semibold text-gold-800">
                  {bonus > 0 ? `+${bonus}` : ""}
                </span>
                <button
                  type="button"
                  aria-label={`Increase ${label}`}
                  disabled={!canIncrease || busy}
                  onClick={() => asi.adjust(key, +1, current)}
                  className="flex h-6 w-6 items-center justify-center rounded-control border border-parchment-300 text-sm text-parchment-600 hover:bg-parchment-100 disabled:opacity-30"
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        disabled={asi.totalPoints !== 2 || busy}
        onClick={onApply}
        className="mt-4 w-full rounded-control bg-gold-400 px-4 py-2 text-sm font-semibold text-ink hover:bg-gold-500 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Apply ASI
      </button>
    </div>
  );
}
