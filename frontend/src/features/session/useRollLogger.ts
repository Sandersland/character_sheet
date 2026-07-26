/**
 * useRollLogger — the shared best-effort "persist this attack/damage roll to the
 * Session Log" helper used by the attack sheets (InlineAttackPicker,
 * InlineOffHandPicker). Fires `logRoll` for an explicit character + session and
 * calls `onLogChanged` on success; never blocks play (errors are logged only).
 *
 * (Distinct from RollContext's `logSessionRoll`, which is a no-op unless the
 * provider was handed a character + session — these pickers always have both.)
 */

import { useCallback } from "react";

import { logRoll } from "@/api/client";
import { formatRollSpec } from "@/lib/dice";
import type { RollResult, RollSpec } from "@/lib/dice";
import type {
  RollEventAttackComponents,
  RollEventDamageComponents,
  RollEventModeSource,
  RollEventVerdict,
} from "@character-sheet/shared-types";

type RollLogKind = "attack" | "damage";

/**
 * The #1235 combat-log decomposition fields — optional so every non-weapon
 * caller (spells, tally-resolve maneuvers) can keep calling logRollSafe with
 * just the original five args. Only useAttackRolls populates this today.
 */
export interface RollLogExtra {
  swingId?: string;
  verdict?: RollEventVerdict;
  nat20?: boolean;
  nat1?: boolean;
  crit?: boolean;
  modeSources?: RollEventModeSource[];
  attackComponents?: RollEventAttackComponents;
  damageComponents?: RollEventDamageComponents;
}

export function useRollLogger(characterId: string, sessionId: string, onLogChanged: () => void) {
  return useCallback(
    (
      kind: RollLogKind,
      source: string,
      result: RollResult,
      spec: RollSpec,
      damageType?: string,
      extra?: RollLogExtra,
    ) => {
      logRoll(characterId, sessionId, {
        kind,
        source,
        total: result.total,
        specLabel: formatRollSpec(spec),
        damageType,
        faces: result.dice.filter((d) => !d.dropped).map((d) => d.value),
        ...extra,
      })
        .then(onLogChanged)
        .catch((e) => console.error("roll log failed", e));
    },
    [characterId, sessionId, onLogChanged],
  );
}
