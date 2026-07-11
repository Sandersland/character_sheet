// Persistent inline roll result for one attack row (#745). After a player taps
// Attack / Damage / Critical, the 3D-dice animation + toast are transient — this
// keeps the number on the row so they can read it back to their DM. Presentational
// only: it takes the RollResult the attack sheet already holds; no rolling here.
// A maneuver-summed override total (Battle Master superiority die) wins over the
// raw total when present.

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
  const keptDice = result.dice.filter((d) => !d.dropped);
  const { faces } = result.spec;
  const mod = result.modifier;
  const total = overrideTotal ?? result.total;
  // Arcane (magic-neutral) for the to-hit d20, garnet for weapon damage — per the
  // palette intent in index.css. Box and total share one tone so an attack roll
  // doesn't mix arcane boxes with a garnet total.
  const tone =
    kind === "attack"
      ? { box: "border-arcane-400 bg-arcane-50 text-arcane-800", total: "text-arcane-800" }
      : { box: "border-garnet-300 bg-garnet-50 text-garnet-800", total: "text-garnet-800" };

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
      {mod !== 0 && (
        <span className="tabular-nums text-parchment-600">
          {mod > 0 ? "+" : "−"} {Math.abs(mod)}
        </span>
      )}
      <span className="text-parchment-500">=</span>
      <span className={`font-display text-base font-semibold tabular-nums ${tone.total}`}>
        {total}
      </span>
      {kind === "damage" && damageType && (
        <span className="text-parchment-600">{damageType}</span>
      )}
      {result.spec.crit && (
        <span className="rounded-control bg-gold-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gold-800">
          crit
        </span>
      )}
      {overrideTotal != null && (
        <span className="text-xs text-parchment-500">(+maneuver)</span>
      )}
    </p>
  );
}
