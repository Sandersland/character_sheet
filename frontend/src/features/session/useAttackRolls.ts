// Per-row roll state + handlers for the attack sheet, plus the AttackEntryView
// bundle each row/card renders from (mirrors the ActionSheetModel pattern in
// lib/turnOptions). Extracted from InlineAttackPicker so its state cluster and
// branching are scored — and testable — as their own unit (#778).
//
// Crit authority (#811): the current tally row's VERDICT is the only crit
// source — nat-20 auto-verdicts at record time, "Crit!" sets it manually. The
// old `manualCrit` checkbox state is gone; damage doubling reads the verdict.

import { useState } from "react";

import { critDamageSpec } from "@/lib/attackMath";
import { isCritRow } from "@/lib/attackTallySummary";
import { isNaturalOne, isNaturalTwenty, keptD20 } from "@/lib/dice";
import type { useRoll } from "@/features/dice/RollContext";
import type { useRollLogger } from "@/features/session/useRollLogger";
import type { RecordedAttack } from "@/features/session/useTurnState";
import type { AttackTallyRow, TallyRowSource } from "@/lib/attackTallySummary";
import type { AttackEntry, DamageRider } from "@/lib/attackMath";
import type { RollResult } from "@/lib/dice";

// Everything one AttackRow / AttackStepCard needs, bundled per entry so the
// components take a single `view` prop instead of the full state surface.
export interface AttackEntryView {
  entry: AttackEntry;
  attackTotal: number | null | undefined;
  damageTotal: number | null | undefined;
  lastAttackRoll: RollResult | null;
  lastDamageRoll: RollResult | null;
  /** Effective crit — the current tally row's verdict is `crit` (#811). */
  isCrit: boolean;
  onAttack: () => void;
  onDamage: () => void;
  onDamageRider: (rider: DamageRider) => void;
  onRollsUpdated: (newAttackTotal: number | null, newDamageTotal: number | null) => void;
}

export function useAttackRolls({
  roll,
  logRollSafe,
  recordAttack,
  setTallyDamage,
  setTallyAttackTotal,
  addTallyDamageRider,
  currentRow,
  source = "action",
}: {
  roll: ReturnType<typeof useRoll>["roll"];
  logRollSafe: ReturnType<typeof useRollLogger>;
  recordAttack: (recorded: RecordedAttack) => void;
  setTallyDamage: (rowId: string, damage: number) => void;
  setTallyAttackTotal: (rowId: string, total: number) => void;
  addTallyDamageRider: (rowId: string, amount: number) => void;
  /** The most-recent tally row for THIS source — its verdict drives crit doubling and its id targets writes (#811/#813). */
  currentRow: AttackTallyRow | null;
  /** Which economy slot these rolls record into — `action` (default) or `bonusAction` for the off-hand (#813). */
  source?: TallyRowSource;
}) {
  // Per-row last roll results (keyed by weapon item.id, "unarmed", or "improvised").
  const [lastAttackRolls, setLastAttackRolls] = useState<Record<string, RollResult | null>>({});
  const [lastDamageRolls, setLastDamageRolls] = useState<Record<string, RollResult | null>>({});

  // Last rolled total per on-hit rider id (Flame Tongue +2d6), shown inline.
  const [riderTotals, setRiderTotals] = useState<Record<string, number>>({});

  // Auto-summed override totals set by ManeuverPrompt after a die spend.
  const [attackTotals, setAttackTotals] = useState<Record<string, number | null>>({});
  const [damageTotals, setDamageTotals] = useState<Record<string, number | null>>({});

  // A row rolls crit damage when it IS the current tally row and that row's
  // verdict is crit (nat-20 auto or manual "Crit!"). The direct nat-20 check
  // covers tally-less surfaces (the off-hand sheet passes currentRow: null
  // until #813) — for tallied rows it's redundant with the auto-verdict.
  function isRowCrit(rowId: string): boolean {
    if (isNaturalTwenty(lastAttackRolls[rowId])) return true;
    return currentRow !== null && currentRow.formId === rowId && isCritRow(currentRow);
  }

  // Roll an attack for a row: log it, retain the result, clear any override, spend
  // one attack, and append the tally row for this action (#802).
  function handleAttack(entry: AttackEntry) {
    const result = roll(entry.attackSpec, entry.attackRollLabel);
    logRollSafe("attack", entry.logSource, result, entry.attackSpec);
    setLastAttackRolls((prev) => ({ ...prev, [entry.id]: result }));
    setAttackTotals((prev) => ({ ...prev, [entry.id]: null }));
    recordAttack({
      formId: entry.id,
      formName: entry.name,
      source,
      attack: {
        total: result.total,
        keptFace: keptD20(result)?.value ?? null,
        nat20: isNaturalTwenty(result),
        nat1: isNaturalOne(result),
      },
    });
  }

  // Roll damage for a row: auto-doubles the dice when the row is a crit. Writes/
  // replaces the current tally row's damage slot (never appends) — which also
  // resolves an unset verdict to hit (#811, implicit hit).
  function handleDamage(entry: AttackEntry) {
    const spec = isRowCrit(entry.id) ? critDamageSpec(entry.damageSpec) : entry.damageSpec;
    const result = roll(spec, entry.damageRollLabel);
    logRollSafe("damage", entry.logSource, result, spec, entry.damageType);
    setLastDamageRolls((prev) => ({ ...prev, [entry.id]: result }));
    setDamageTotals((prev) => ({ ...prev, [entry.id]: null }));
    if (currentRow) setTallyDamage(currentRow.id, result.total);
  }

  // Roll one on-hit dice rider (e.g. Flame Tongue +2d6 fire) as its own typed term.
  // On a crit the rider's dice double too — mirror the parent row's crit state.
  function handleDamageRider(rider: DamageRider, parentEntryId: string | null) {
    const parentCrit = parentEntryId
      ? isRowCrit(parentEntryId) || Boolean(lastDamageRolls[parentEntryId]?.spec.crit)
      : false;
    const spec = parentCrit ? critDamageSpec(rider.spec) : rider.spec;
    const result = roll(spec, rider.rollLabel);
    logRollSafe("damage", rider.logSource, result, spec, rider.damageType);
    setRiderTotals((prev) => ({ ...prev, [rider.id]: result.total }));
    if (currentRow) addTallyDamageRider(currentRow.id, result.total);
  }

  // Callback for ManeuverPrompt — stores auto-sum overrides per entry, and folds
  // the boosted totals into THIS source's current tally row (targeted by id, so a
  // second interleaved source never gets the override — #813).
  function makeOnRollsUpdated(entryId: string) {
    return (newAtk: number | null, newDmg: number | null) => {
      if (newAtk !== null) {
        setAttackTotals((prev) => ({ ...prev, [entryId]: newAtk }));
        if (currentRow) setTallyAttackTotal(currentRow.id, newAtk);
      }
      if (newDmg !== null) {
        setDamageTotals((prev) => ({ ...prev, [entryId]: newDmg }));
        if (currentRow) setTallyDamage(currentRow.id, newDmg);
      }
    };
  }

  // Bundle one entry's state + handlers into the view the row/card renders.
  // Rider rolls mirror THIS entry's crit state (the damage step only shows for
  // the active weapon, so binding to entry.id matches the active-weapon binding).
  function viewFor(entry: AttackEntry): AttackEntryView {
    return {
      entry,
      attackTotal: attackTotals[entry.id],
      damageTotal: damageTotals[entry.id],
      lastAttackRoll: lastAttackRolls[entry.id] ?? null,
      lastDamageRoll: lastDamageRolls[entry.id] ?? null,
      isCrit: isRowCrit(entry.id),
      onAttack: () => handleAttack(entry),
      onDamage: () => handleDamage(entry),
      onDamageRider: (rider) => handleDamageRider(rider, entry.id),
      onRollsUpdated: makeOnRollsUpdated(entry.id),
    };
  }

  return { riderTotals, viewFor };
}
