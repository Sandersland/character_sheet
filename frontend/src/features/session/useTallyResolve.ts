// The "unresolved = tappable, resolved = final" rule must behave identically in AttackTallyStrip and the Turn-summary banner — kept here so both share it.
// Damage spec is looked up live by formId at resolve time, not persisted on the row — if the form's gone (weapon dropped mid-turn), the roll just isn't offered; verdict buttons still work.

import { useCallback } from "react";

import { useRoll } from "@/features/dice/RollContext";
import { useRollLogger } from "@/features/session/useRollLogger";
import { buildAttackForms, buildOffHandEntry, critDamageSpec } from "@/lib/attackMath";
import { isCritRow } from "@/lib/attackTallySummary";
import type { AttackTallyRow, TallyVerdict } from "@/lib/attackTallySummary";
import type { Character } from "@/types/character";

export interface TallyResolve {
  setVerdict: (index: number, verdict: TallyVerdict | undefined) => void;
  canRollDamage: (row: AttackTallyRow) => boolean;
  rollDamageFor: (index: number, row: AttackTallyRow) => void;
}

export function useTallyResolve({
  character,
  setTallyVerdict,
  setTallyDamageAt,
  onLogChanged,
}: {
  character: Character;
  setTallyVerdict: (index: number, verdict: TallyVerdict | undefined) => void;
  setTallyDamageAt: (index: number, damage: number) => void;
  onLogChanged: () => void;
}): TallyResolve {
  const { roll } = useRoll();
  const logRollSafe = useRollLogger(character.id, onLogChanged);

  // A bonusAction row resolves against the off-hand entry, never the main-hand form (same formId) — told apart by the off-hand flag alone (#813).
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
      // Carries the row's own swingId (#1235/#1354), minted at attack time and threaded onto the row rather than recomputed here.
      logRollSafe("damage", form.logSource, result, spec, form.damageType, { swingId: row.swingId });
      setTallyDamageAt(index, result.total);
    },
    [formFor, roll, logRollSafe, setTallyDamageAt],
  );

  return { setVerdict: setTallyVerdict, canRollDamage, rollDamageFor };
}
