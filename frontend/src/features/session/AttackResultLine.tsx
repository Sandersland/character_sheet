// Persistent inline roll result for one attack row (#745). After a player taps
// Attack / Damage / Critical, the 3D-dice animation + toast are transient — this
// keeps the number on the row so they can read it back to their DM. Presentational
// only: the crit/miss/total/tone derivation lives in resultLineView (#778).

import { resultLineView } from "@/lib/attackResult";
import type { RollResult } from "@/lib/dice";

interface AttackResultLineProps {
  result: RollResult;
  kind: "attack" | "damage";
  /** Damage type shown after the total (damage rolls only). */
  damageType?: string;
  /** Maneuver-summed total; overrides the raw roll total when set (non-null). */
  overrideTotal?: number | null;
}

export default function AttackResultLine({
  result,
  kind,
  damageType,
  overrideTotal,
}: AttackResultLineProps) {
  const { keptDice, faces, modifier, total, critHit, miss, critSpec, hasOverride, tone } =
    resultLineView(result, kind, overrideTotal);

  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-parchment-700">
      {keptDice.map((d, i) => (
        <span
          key={i}
          className={`inline-flex flex-col items-center justify-center rounded-control border px-2 py-0.5 font-display leading-tight tabular-nums ${tone.box}`}
        >
          <span className="text-sm font-semibold">{d.value}</span>
          <span className="text-[9px] font-normal uppercase tracking-wide opacity-70">
            d{faces}
          </span>
        </span>
      ))}
      {modifier !== 0 && (
        <span className="tabular-nums text-parchment-600">
          {modifier > 0 ? "+" : "−"} {Math.abs(modifier)}
        </span>
      )}
      <span className="text-parchment-500">=</span>
      <span className={`font-display text-base font-semibold tabular-nums ${tone.total}`}>
        {total}
      </span>
      {kind === "damage" && damageType && (
        <span className="text-parchment-600">{damageType}</span>
      )}
      {critSpec && (
        <span className="rounded-control bg-gold-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gold-800">
          crit
        </span>
      )}
      {critHit && (
        <span className="rounded-control bg-garnet-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-garnet-800">
          Critical hit!
        </span>
      )}
      {miss && (
        <span className="rounded-control bg-parchment-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-parchment-600">
          Miss
        </span>
      )}
      {hasOverride && (
        <span className="text-xs text-parchment-500">(+maneuver)</span>
      )}
    </p>
  );
}
