import { useState } from "react";

import { rollAbilityScoreSet } from "@/lib/abilityGen";
import type { RollSpec } from "@/lib/dice";
import DiceRollSequence from "@/features/dice/DiceRollSequence";
import PhysicsDiceRoller from "@/features/dice/PhysicsDiceRoller";
import { useDiceRollStyle } from "@/features/dice/DiceRollStyleProvider";

interface AbilityRollTrayProps {
  pool: number[] | null;
  /** Whether any slot is already assigned — hides Reroll to avoid wiping the spread. */
  hasAssignments: boolean;
  onRolled: (pool: number[]) => void;
}

const ROLL_SPEC: RollSpec = { count: 4, faces: 6, dropLowest: 1 };
const POOL_SIZE = 6;

/**
 * The roll-4d6 stage for the ability panel (#1161). Honors the Dice-rolls
 * preference (#945): `animated` plays the shared DiceRollSequence with the
 * physics roller (4d6 drop-lowest, six sets one at a time), `quick` fills the
 * pool instantly. Either way the settled totals flow up via `onRolled` — the
 * panel's chip bar is the pool display, so this only owns the roll itself.
 */
export default function AbilityRollTray({ pool, hasAssignments, onRolled }: AbilityRollTrayProps) {
  const { style } = useDiceRollStyle();
  const [nonce, setNonce] = useState(0);

  function handleRoll() {
    if (style === "quick") onRolled(rollAbilityScoreSet());
    else setNonce((n) => n + 1);
  }

  return (
    <div className="flex flex-col gap-3 rounded-card border border-black/20 bg-ink p-3">
      {!hasAssignments && (
        <button
          type="button"
          onClick={handleRoll}
          className="self-start rounded-control bg-garnet-700 px-3 py-1.5 text-sm font-semibold text-parchment-50 transition-colors hover:bg-garnet-800"
        >
          {pool ? "Reroll all" : "Roll scores"}
        </button>
      )}
      {style === "animated" && (
        <DiceRollSequence
          spec={ROLL_SPEC}
          count={POOL_SIZE}
          triggerKey={nonce > 0 ? nonce : undefined}
          restoredTotals={pool ?? undefined}
          roller={PhysicsDiceRoller}
          onComplete={(results) => onRolled(results.map((r) => r.total))}
        />
      )}
    </div>
  );
}
