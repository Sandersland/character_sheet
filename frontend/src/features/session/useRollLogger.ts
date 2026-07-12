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

type RollLogKind = "attack" | "damage";

export function useRollLogger(characterId: string, sessionId: string, onLogChanged: () => void) {
  return useCallback(
    (kind: RollLogKind, source: string, result: RollResult, spec: RollSpec, damageType?: string) => {
      logRoll(characterId, sessionId, {
        kind,
        source,
        total: result.total,
        specLabel: formatRollSpec(spec),
        damageType,
        faces: result.dice.filter((d) => !d.dropped).map((d) => d.value),
      })
        .then(onLogChanged)
        .catch((e) => console.error("roll log failed", e));
    },
    [characterId, sessionId, onLogChanged],
  );
}
