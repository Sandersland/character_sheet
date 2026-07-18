// Bespoke ASI grid for the level-up ceremony (#888) — mockup-faithful two-column
// steppers. All point math (2-point cap, per-score cap-20) stays in useAsiDraft.

import type { AsiDraft } from "@/features/advancement/useAsiDraft";
import { ABILITY_OPTIONS, abilityModifier, formatModifier } from "@/lib/abilities";

const ABILITY_CAP = 20;

const ROW = "flex items-center gap-3 rounded-lg border bg-parchment-50 px-3 py-2.5";
const STEP =
  "flex h-7 w-7 shrink-0 items-center justify-center rounded-control border border-parchment-300 bg-parchment-50 text-base font-bold text-parchment-600 transition-colors hover:bg-parchment-100 disabled:opacity-30";

export default function AsiAbilityGrid({ asi, currentScores }: { asi: AsiDraft; currentScores: Record<string, number> }) {
  return (
    <>
      <p className="mt-3 text-center text-[12.5px] text-parchment-600">
        Assign 2 points · <b className="font-bold text-garnet-700">{asi.pointsLeft} remaining</b>
      </p>

      <div className="mx-auto mt-3.5 grid max-w-lg grid-cols-2 gap-2.5">
        {ABILITY_OPTIONS.map(({ key, label }) => {
          const current = currentScores[key] ?? 10;
          const bonus = asi.increases[key] ?? 0;
          const newVal = current + bonus;
          const raised = bonus > 0;
          return (
            <div key={key} className={`${ROW} ${raised ? "border-garnet-600 ring-2 ring-garnet-50" : "border-parchment-300"}`}>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-bold uppercase tracking-wide text-parchment-600">{label}</div>
                <div className="font-display text-base font-bold text-parchment-900">
                  {current}
                  {raised && <span className="text-vitality-700"> → {newVal}</span>}
                  <span className="ml-1.5 text-xs font-semibold text-parchment-600">
                    ({formatModifier(abilityModifier(newVal))})
                  </span>
                </div>
              </div>
              <button
                type="button"
                aria-label={`Decrease ${label}`}
                disabled={bonus <= 0}
                onClick={() => asi.adjust(key, -1, current)}
                className={STEP}
              >
                −
              </button>
              <button
                type="button"
                aria-label={`Increase ${label}`}
                disabled={asi.pointsLeft <= 0 || newVal >= ABILITY_CAP}
                onClick={() => asi.adjust(key, +1, current)}
                className={`${STEP} border-garnet-100 text-garnet-700`}
              >
                +
              </button>
            </div>
          );
        })}
      </div>

      <p className="mx-auto mt-3.5 max-w-xl text-center text-[12.5px] italic text-parchment-500">
        ⚔ Prefer a feat? Switch the toggle to browse Great Weapon Master, Sentinel, Resilient…
      </p>
    </>
  );
}
