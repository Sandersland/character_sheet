// Shared resolve handlers for tally rows (#811): the "unresolved = tappable,
// resolved = final (quiet Change)" rule renders in two places — the in-sheet
// AttackTallyStrip and the Turn-summary banner — and both must behave
// identically, so the verdict writes and the inline damage roll live here.
//
// The damage spec is DERIVED at resolve time from the row's formId against the
// live inventory (buildAttackForms) rather than persisted on the row — if the
// form no longer exists (weapon dropped mid-turn), the inline roll is simply
// not offered and the verdict buttons still work.

import { useCallback } from "react";

import { useRoll } from "@/features/dice/RollContext";
import { useRollLogger } from "@/features/session/useRollLogger";
import { buildAttackForms, buildOffHandEntry, critDamageSpec } from "@/lib/attackMath";
import { isCritRow } from "@/lib/attackTallySummary";
import type { AttackTallyRow, TallyVerdict } from "@/lib/attackTallySummary";
import type { Character } from "@/types/character";

export interface TallyResolve {
  /** Write a verdict on row `index`; nat-locked rows refuse in state. */
  setVerdict: (index: number, verdict: TallyVerdict | undefined) => void;
  /** Whether the inline damage roll can be offered for this row. */
  canRollDamage: (row: AttackTallyRow) => boolean;
  /** Roll the row's damage (crit-doubled for crit rows), log it, write the tally. */
  rollDamageFor: (index: number, row: AttackTallyRow) => void;
}

export function useTallyResolve({
  character,
  sessionId,
  setTallyVerdict,
  setTallyDamageAt,
  onLogChanged,
}: {
  character: Character;
  sessionId: string;
  setTallyVerdict: (index: number, verdict: TallyVerdict | undefined) => void;
  setTallyDamageAt: (index: number, damage: number) => void;
  onLogChanged: () => void;
}): TallyResolve {
  const { roll } = useRoll();
  const logRollSafe = useRollLogger(character.id, sessionId, onLogChanged);

  // A bonusAction row resolves against the off-hand entry (no ability mod unless
  // the TWF style) — never the main-hand form of the same weapon id (#813).
  const formFor = useCallback(
    (row: AttackTallyRow) => {
      if (row.source === "bonusAction") {
        const off = buildOffHandEntry(character);
        return off && off.id === row.formId ? off : null;
      }
      return buildAttackForms(character).find((f) => f.id === row.formId) ?? null;
    },
    [character],
  );

  const canRollDamage = useCallback(
    (row: AttackTallyRow) => formFor(row) !== null,
    [formFor],
  );

  const rollDamageFor = useCallback(
    (index: number, row: AttackTallyRow) => {
      const form = formFor(row);
      if (!form) return;
      const spec = isCritRow(row) ? critDamageSpec(form.damageSpec) : form.damageSpec;
      const result = roll(spec, form.damageRollLabel);
      logRollSafe("damage", form.logSource, result, spec, form.damageType);
      setTallyDamageAt(index, result.total);
    },
    [formFor, roll, logRollSafe, setTallyDamageAt],
  );

  return { setVerdict: setTallyVerdict, canRollDamage, rollDamageFor };
}
