/**
 * ResourcePoolRow — displays a single resource pool (e.g. Superiority Dice)
 * with spend and restore controls. Dice are rolled client-side via dice.ts;
 * the result is shown as an inline banner, mirroring SpellsSection's cast
 * result pattern.
 */

import { useState } from "react";

import { rollSpec } from "@/lib/dice";
import type { ResourceOperation, ResourcePool } from "@/types/character";
import MeterBar from "@/components/ui/MeterBar";

interface Props {
  characterId: string;
  pool: ResourcePool;
  busy: boolean;
  onOperations: (ops: ResourceOperation[]) => void;
}

function rechargeLabel(recharge: ResourcePool["recharge"]): string {
  switch (recharge) {
    case "short-or-long": return "Short or long rest";
    case "longRest":      return "Long rest";
    case "shortRest":     return "Short rest";
    case "none":          return "Manual";
  }
}

export default function ResourcePoolRow({ pool, busy, onOperations }: Props) {
  const [rollResult, setRollResult] = useState<number | null>(null);

  const diceFaces = pool.die ? parseInt(pool.die.replace("d", ""), 10) : null;

  function handleSpend() {
    const roll = diceFaces
      ? rollSpec({ count: 1, faces: diceFaces }).total
      : null;
    if (roll !== null) setRollResult(roll);
    const op: ResourceOperation = {
      type: "spendResource",
      key: pool.key,
      amount: 1,
      ...(roll !== null ? { roll } : {}),
    };
    onOperations([op]);
  }

  function handleRestore() {
    setRollResult(null);
    onOperations([{ type: "restoreResource", key: pool.key, amount: 1 }]);
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Label row */}
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-semibold text-parchment-800">
          {pool.label}
          {pool.die && (
            <span className="ml-1.5 text-xs font-normal text-parchment-500">
              · {pool.die}
            </span>
          )}
        </span>
        <span className="text-xs tabular-nums text-parchment-500">
          {pool.remaining}/{pool.total}
        </span>
      </div>

      {/* Meter */}
      <MeterBar
        current={pool.remaining}
        max={pool.total}
        tone="gold"
        label={`${pool.label}: ${pool.remaining} of ${pool.total} remaining`}
      />

      {/* Controls */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={busy || pool.remaining === 0}
          onClick={handleSpend}
          className="rounded-control bg-gold-100 px-2.5 py-1 text-xs font-semibold text-gold-800 hover:bg-gold-200 disabled:opacity-30"
          title={`Spend one ${pool.label}`}
        >
          − Spend
        </button>
        <button
          type="button"
          disabled={busy || pool.used === 0}
          onClick={handleRestore}
          className="rounded-control bg-gold-100 px-2.5 py-1 text-xs font-semibold text-gold-800 hover:bg-gold-200 disabled:opacity-30"
          title={`Restore one ${pool.label}`}
        >
          + Restore
        </button>
        <span className="ml-auto text-[11px] text-parchment-400">
          {rechargeLabel(pool.recharge)}
        </span>
      </div>

      {/* Inline roll result banner */}
      {rollResult !== null && (
        <div className="flex items-center justify-between rounded-control bg-gold-50 px-3 py-2 text-gold-800">
          <p className="text-sm">
            <span className="font-semibold">{pool.label}</span>
            {" — "}
            <span className="font-display text-lg font-semibold">{rollResult}</span>
            {pool.die && (
              <span className="ml-1 text-xs opacity-70">{pool.die}</span>
            )}
          </p>
          <button
            type="button"
            onClick={() => setRollResult(null)}
            className="ml-3 text-xs opacity-60 hover:opacity-100"
            aria-label="Dismiss roll result"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
