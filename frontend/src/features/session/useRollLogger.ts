/**
 * useRollLogger — the shared best-effort "persist this roll to the Session Log"
 * helper. Since #1861 its only caller is the tally-resolve inline damage roll
 * (useTallyResolve); it commits through the resolve-action resolver
 * (`logRollAction`, the `logRoll` op) as a real batched, trivially-undoable
 * event and calls `onLogChanged` on success — never blocking play (errors are
 * logged only). The backend derives the sessionId from the character's active
 * session, so none rides on the wire.
 *
 * (Distinct from RollContext's `logSessionRoll`, which is a no-op unless the
 * provider was handed a character + session — this hook's caller always has both.)
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

/**
 * The #1235 combat-log decomposition fields — optional so every non-weapon
 * caller (spells, tally-resolve maneuvers) can keep calling logRollSafe with
 * just the original five args.
 */
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
      // Non-empty only: an empty droppedFaces on every normal roll would be
      // pure noise on the wire and in the persisted event log.
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
