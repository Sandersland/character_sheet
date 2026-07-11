/**
 * InlineOffHandPicker — the Two-Weapon Fighting off-hand attack sheet (#732).
 *
 * A slimmed mirror of InlineAttackPicker scoped to the single off-hand weapon:
 * one AttackRow with Attack / Damage / Critical rolls, its on-hit dice riders,
 * and (for a Battle Master) inline maneuvers. The off-hand attack is a single
 * bonus-action swing — rolling it spends the bonus action (recordTwfAttack);
 * backing out before rolling refunds it (cancelTwf).
 *
 * Off-hand damage omits the ability modifier unless the character has the
 * Two-Weapon Fighting style — that adjustment lives in buildOffHandEntry.
 */

import { useState } from "react";

import { useRoll } from "@/features/dice/RollContext";
import { logRoll } from "@/api/client";
import { formatRollSpec } from "@/lib/dice";
import { buildOffHandEntry, critDamageSpec, hasSuperiorityDice } from "@/lib/attackMath";
import AttackRow from "@/features/session/AttackRow";
import type { AttackEntry, DamageRider } from "@/lib/attackMath";
import type { TurnState, TurnStateActions } from "@/features/session/useTurnState";
import type { Character } from "@/types/character";
import type { RollResult, RollSpec } from "@/lib/dice";

interface InlineOffHandPickerProps {
  character: Character;
  turnState: TurnState & TurnStateActions;
  /** Active session id — off-hand rolls are logged against it. */
  sessionId: string;
  /** Commit and dismiss (bonus action already spent by the roll). */
  onClose: () => void;
  /** Back out before rolling — refunds the bonus action and reopens the menu. */
  onCancel: () => void;
  onUpdate: (c: Character) => void;
  onLogChanged: () => void;
}

export default function InlineOffHandPicker({
  character,
  turnState,
  sessionId,
  onClose,
  onCancel,
  onUpdate,
  onLogChanged,
}: InlineOffHandPickerProps) {
  const { roll } = useRoll();

  // Persist a roll to the Session Log (best-effort — never blocks play).
  function logRollSafe(
    kind: "attack" | "damage",
    source: string,
    result: RollResult,
    spec: RollSpec,
    damageType?: string,
  ) {
    logRoll(character.id, sessionId, {
      kind,
      source,
      total: result.total,
      specLabel: formatRollSpec(spec),
      damageType,
      faces: result.dice.filter((d) => !d.dropped).map((d) => d.value),
    })
      .then(onLogChanged)
      .catch((e) => console.error("roll log failed", e));
  }

  const [lastAttackRoll, setLastAttackRoll] = useState<RollResult | null>(null);
  const [lastDamageRoll, setLastDamageRoll] = useState<RollResult | null>(null);
  const [riderTotals, setRiderTotals] = useState<Record<string, number>>({});
  const [attackTotal, setAttackTotal] = useState<number | null>(null);
  const [damageTotal, setDamageTotal] = useState<number | null>(null);

  const entry = buildOffHandEntry(character);
  const showManeuvers = hasSuperiorityDice(character);

  // The single off-hand swing is spent once recordTwfAttack clears bonusAttack.
  const rolled = turnState.bonusAttack === null;

  // Roll the off-hand attack: log it, retain the result, spend the bonus action.
  function handleAttack(e: AttackEntry) {
    const result = roll(e.attackSpec, e.attackRollLabel);
    logRollSafe("attack", e.logSource, result, e.attackSpec);
    setLastAttackRoll(result);
    setAttackTotal(null);
    turnState.recordTwfAttack();
  }

  function handleDamage(e: AttackEntry) {
    const result = roll(e.damageSpec, e.damageRollLabel);
    logRollSafe("damage", e.logSource, result, e.damageSpec, e.damageType);
    setLastDamageRoll(result);
    setDamageTotal(null);
  }

  function handleCritDamage(e: AttackEntry) {
    const spec = critDamageSpec(e.damageSpec);
    const result = roll(spec, e.damageRollLabel);
    logRollSafe("damage", e.logSource, result, spec, e.damageType);
    setLastDamageRoll(result);
    setDamageTotal(null);
  }

  // Roll one on-hit dice rider (e.g. Flame Tongue +2d6 fire), doubling its dice
  // when the last damage roll was a crit — mirrors the main attack sheet.
  function handleDamageRider(rider: DamageRider) {
    const parentCrit = Boolean(lastDamageRoll?.spec.crit);
    const spec = parentCrit ? critDamageSpec(rider.spec) : rider.spec;
    const result = roll(spec, rider.rollLabel);
    logRollSafe("damage", rider.logSource, result, spec, rider.damageType);
    setRiderTotals((prev) => ({ ...prev, [rider.id]: result.total }));
  }

  function handleRollsUpdated(newAtk: number | null, newDmg: number | null) {
    if (newAtk !== null) setAttackTotal(newAtk);
    if (newDmg !== null) setDamageTotal(newDmg);
  }

  return (
    <div className="flex flex-col divide-y divide-parchment-200">
      <p className="pb-2 text-xs font-semibold uppercase tracking-wide text-parchment-600">
        Off-hand attack · 1 swing
      </p>

      {entry ? (
        <AttackRow
          entry={entry}
          attacksExhausted={rolled}
          showManeuvers={showManeuvers}
          character={character}
          attackTotal={attackTotal}
          damageTotal={damageTotal}
          lastAttackRoll={lastAttackRoll}
          lastDamageRoll={lastDamageRoll}
          riderTotals={riderTotals}
          onAttack={handleAttack}
          onDamage={handleDamage}
          onCritDamage={handleCritDamage}
          onDamageRider={handleDamageRider}
          onRollsUpdated={handleRollsUpdated}
          onUpdate={onUpdate}
        />
      ) : (
        <p className="pb-3 text-sm text-parchment-600">
          No off-hand weapon equipped. Equip a second weapon from the Inventory tab.
        </p>
      )}

      {/* Back (refund) before the swing is rolled; Done once it's committed. */}
      <div className="pt-3">
        {!rolled ? (
          <button
            type="button"
            onClick={onCancel}
            className="w-full rounded-control border border-parchment-300 bg-parchment-50 px-3 py-1.5 text-xs font-semibold text-parchment-700 transition-colors hover:bg-parchment-100"
          >
            ← Back
          </button>
        ) : (
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-control border border-parchment-300 bg-parchment-50 px-3 py-1.5 text-xs font-semibold text-parchment-700 transition-colors hover:bg-parchment-100"
          >
            Done
          </button>
        )}
      </div>
    </div>
  );
}
