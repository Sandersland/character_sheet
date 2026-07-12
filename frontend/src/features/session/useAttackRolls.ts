// Per-row roll state + handlers for the attack sheet, plus the AttackEntryView
// bundle each row/card renders from (mirrors the ActionSheetModel pattern in
// lib/turnOptions). Extracted from InlineAttackPicker so its state cluster and
// branching are scored — and testable — as their own unit (#778).

import { useState } from "react";

import { critDamageSpec } from "@/lib/attackMath";
import { isNaturalOne, isNaturalTwenty, keptD20 } from "@/lib/dice";
import type { useRoll } from "@/features/dice/RollContext";
import type { useRollLogger } from "@/features/session/useRollLogger";
import type { RecordedAttack } from "@/features/session/useTurnState";
import type { AttackEntry, DamageRider } from "@/lib/attackMath";
import type { RollResult } from "@/lib/dice";

// Everything one AttackRow / WeaponDamageCard needs, bundled per entry so the
// components take a single `view` prop instead of the full state surface.
export interface AttackEntryView {
  entry: AttackEntry;
  attackTotal: number | null | undefined;
  damageTotal: number | null | undefined;
  lastAttackRoll: RollResult | null;
  lastDamageRoll: RollResult | null;
  /** Effective crit (nat-20 to-hit OR manual toggle). */
  isCrit: boolean;
  /** Manual DM-called crit toggle state. */
  manualCrit: boolean;
  onAttack: () => void;
  onDamage: () => void;
  onToggleCrit: () => void;
  onDamageRider: (rider: DamageRider) => void;
  onRollsUpdated: (newAttackTotal: number | null, newDamageTotal: number | null) => void;
}

export function useAttackRolls({
  roll,
  logRollSafe,
  recordAttack,
  setTallyDamage,
  addTallyDamageRider,
}: {
  roll: ReturnType<typeof useRoll>["roll"];
  logRollSafe: ReturnType<typeof useRollLogger>;
  recordAttack: (recorded: RecordedAttack) => void;
  setTallyDamage: (damage: number) => void;
  addTallyDamageRider: (amount: number) => void;
}) {
  // Per-row last roll results (keyed by weapon item.id, "unarmed", or "improvised").
  const [lastAttackRolls, setLastAttackRolls] = useState<Record<string, RollResult | null>>({});
  const [lastDamageRolls, setLastDamageRolls] = useState<Record<string, RollResult | null>>({});

  // Last rolled total per on-hit rider id (Flame Tongue +2d6), shown inline.
  const [riderTotals, setRiderTotals] = useState<Record<string, number>>({});

  // Auto-summed override totals set by ManeuverPrompt after a die spend.
  const [attackTotals, setAttackTotals] = useState<Record<string, number | null>>({});
  const [damageTotals, setDamageTotals] = useState<Record<string, number | null>>({});

  // DM-called / expanded-crit-range override per row — OR'd with the auto nat-20.
  const [manualCrit, setManualCrit] = useState<Record<string, boolean>>({});

  // A row rolls crit damage when its to-hit kept a nat 20 OR the manual toggle is on.
  function isRowCrit(rowId: string): boolean {
    return Boolean(manualCrit[rowId]) || isNaturalTwenty(lastAttackRolls[rowId]);
  }

  function toggleManualCrit(rowId: string) {
    setManualCrit((prev) => ({ ...prev, [rowId]: !prev[rowId] }));
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
      attack: {
        total: result.total,
        keptFace: keptD20(result)?.value ?? null,
        nat20: isNaturalTwenty(result),
        nat1: isNaturalOne(result),
      },
    });
  }

  // Roll damage for a row: auto-doubles the dice when the row is a crit (nat 20 or
  // manual). Writes/replaces the current tally row's damage slot (never appends).
  function handleDamage(entry: AttackEntry) {
    const spec = isRowCrit(entry.id) ? critDamageSpec(entry.damageSpec) : entry.damageSpec;
    const result = roll(spec, entry.damageRollLabel);
    logRollSafe("damage", entry.logSource, result, spec, entry.damageType);
    setLastDamageRolls((prev) => ({ ...prev, [entry.id]: result }));
    setDamageTotals((prev) => ({ ...prev, [entry.id]: null }));
    setTallyDamage(result.total);
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
    addTallyDamageRider(result.total);
  }

  // Callback for ManeuverPrompt — stores auto-sum overrides per row.
  function makeOnRollsUpdated(rowId: string) {
    return (newAtk: number | null, newDmg: number | null) => {
      if (newAtk !== null) {
        setAttackTotals((prev) => ({ ...prev, [rowId]: newAtk }));
      }
      if (newDmg !== null) {
        setDamageTotals((prev) => ({ ...prev, [rowId]: newDmg }));
        setTallyDamage(newDmg); // keep the tally slot in sync with a maneuver sum
      }
    };
  }

  // Bundle one entry's state + handlers into the view the row/card renders.
  // Rider rolls mirror THIS entry's crit state (the Damage card only shows for
  // the active weapon, so binding to entry.id matches the active-weapon binding).
  function viewFor(entry: AttackEntry): AttackEntryView {
    return {
      entry,
      attackTotal: attackTotals[entry.id],
      damageTotal: damageTotals[entry.id],
      lastAttackRoll: lastAttackRolls[entry.id] ?? null,
      lastDamageRoll: lastDamageRolls[entry.id] ?? null,
      isCrit: isRowCrit(entry.id),
      manualCrit: Boolean(manualCrit[entry.id]),
      onAttack: () => handleAttack(entry),
      onDamage: () => handleDamage(entry),
      onToggleCrit: () => toggleManualCrit(entry.id),
      onDamageRider: (rider) => handleDamageRider(rider, entry.id),
      onRollsUpdated: makeOnRollsUpdated(entry.id),
    };
  }

  return { riderTotals, viewFor };
}
