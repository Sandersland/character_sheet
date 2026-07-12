/**
 * InlineOffHandPicker — the Two-Weapon Fighting off-hand attack sheet (#732).
 *
 * A slimmed mirror of InlineAttackPicker scoped to the single off-hand weapon:
 * one AttackRow with Attack / Damage rolls (auto-crit on a nat 20), its on-hit
 * dice riders, and (for a Battle Master) inline maneuvers. The off-hand is a single
 * bonus-action swing — rolling it spends the bonus action (recordTwfAttack);
 * backing out before rolling refunds it (cancelTwf).
 *
 * Off-hand damage omits the ability modifier unless the character has the
 * Two-Weapon Fighting style — that adjustment lives in buildOffHandEntry.
 */

import { useState } from "react";

import { useRoll } from "@/features/dice/RollContext";
import { buildOffHandEntry, critDamageSpec, hasSuperiorityDice } from "@/lib/attackMath";
import AttackRow from "@/features/session/AttackRow";
import { useRollLogger } from "@/features/session/useRollLogger";
import { isNaturalTwenty } from "@/lib/dice";
import type { AttackEntry, DamageRider } from "@/lib/attackMath";
import type { TurnState, TurnStateActions } from "@/features/session/useTurnState";
import type { Character } from "@/types/character";
import type { RollResult } from "@/lib/dice";

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
  const logRollSafe = useRollLogger(character.id, sessionId, onLogChanged);

  const [lastAttackRoll, setLastAttackRoll] = useState<RollResult | null>(null);
  const [lastDamageRoll, setLastDamageRoll] = useState<RollResult | null>(null);
  const [riderTotals, setRiderTotals] = useState<Record<string, number>>({});
  const [attackTotal, setAttackTotal] = useState<number | null>(null);
  const [damageTotal, setDamageTotal] = useState<number | null>(null);
  const [manualCrit, setManualCrit] = useState(false);

  const entry = buildOffHandEntry(character);
  const showManeuvers = hasSuperiorityDice(character);

  // Off-hand swing crits on a nat-20 to-hit or the manual DM toggle.
  const isCrit = manualCrit || isNaturalTwenty(lastAttackRoll);

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

  // Auto-doubles the dice when the swing is a crit (nat 20 or manual toggle).
  function handleDamage(e: AttackEntry) {
    const spec = isCrit ? critDamageSpec(e.damageSpec) : e.damageSpec;
    const result = roll(spec, e.damageRollLabel);
    logRollSafe("damage", e.logSource, result, spec, e.damageType);
    setLastDamageRoll(result);
    setDamageTotal(null);
  }

  // Roll one on-hit dice rider (e.g. Flame Tongue +2d6 fire), doubling its dice
  // when the swing is a crit — mirrors the main attack sheet.
  function handleDamageRider(rider: DamageRider) {
    const parentCrit = isCrit || Boolean(lastDamageRoll?.spec.crit);
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
          isCrit={isCrit}
          manualCrit={manualCrit}
          onAttack={handleAttack}
          onDamage={handleDamage}
          onToggleCrit={() => setManualCrit((v) => !v)}
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
