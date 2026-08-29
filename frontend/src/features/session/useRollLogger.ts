/**
 * Never blocks play — a failed log is caught and only console-logged, not surfaced.
 * Backend derives sessionId from the character's active session — it never rides the wire.
 * Distinct from RollContext's `logSessionRoll`, a no-op unless given both a character and session — this hook's caller always has both.
 */

import { useCallback } from "react";

import { logRollAction } from "@/api/client";
import { formatRollSpec } from "@/lib/dice";
import type { RollResult, RollSpec } from "@/lib/dice";
import type {
  RollEventAttackComponents,
  RollEventDamageComponents,
  RollEventMode,
  RollEventModeSource,
  RollEventVerdict,
} from "@character-sheet/shared-types";

type RollLogKind = "attack" | "damage";

interface RollLogExtra {
  swingId?: string;
  verdict?: RollEventVerdict;
  nat20?: boolean;
  nat1?: boolean;
  crit?: boolean;
  rollMode?: RollEventMode;
  modeSources?: RollEventModeSource[];
  attackComponents?: RollEventAttackComponents;
  damageComponents?: RollEventDamageComponents;
}

export function useRollLogger(characterId: string, onLogChanged: () => void) {
  return useCallback(
    (
      kind: RollLogKind,
      source: string,
      result: RollResult,
      spec: RollSpec,
      damageType?: string,
      extra?: RollLogExtra,
    ) => {
      // Included only when non-empty — an empty droppedFaces on every normal roll would be noise on the wire and in the persisted log.
      const droppedFaces = result.dice.filter((d) => d.dropped).map((d) => d.value);
      logRollAction(characterId, {
        kind,
        source,
        total: result.total,
        specLabel: formatRollSpec(spec),
        damageType,
        faces: result.dice.filter((d) => !d.dropped).map((d) => d.value),
        ...(droppedFaces.length > 0 ? { droppedFaces } : {}),
        ...extra,
      })
        .then(onLogChanged)
        .catch((e) => console.error("roll log failed", e));
    },
    [characterId, onLogChanged],
  );
}
