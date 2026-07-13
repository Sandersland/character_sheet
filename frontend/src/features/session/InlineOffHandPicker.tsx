/**
 * InlineOffHandPicker — the Two-Weapon Fighting off-hand attack sheet (#732).
 *
 * A slimmed mirror of InlineAttackPicker scoped to the single off-hand weapon:
 * one AttackRow with Attack / Damage rolls (auto-crit on a nat 20), its on-hit
 * dice riders, and (for a Battle Master) inline maneuvers. Roll state + handlers
 * come from the shared useAttackRolls hook, with recordAttack wired to
 * recordTwfAttack so the swing spends the bonus action.
 *
 * Off-hand damage omits the ability modifier unless the character has the
 * Two-Weapon Fighting style — that adjustment lives in buildOffHandEntry.
 */

import { useRoll } from "@/features/dice/RollContext";
import { buildOffHandEntry, hasSuperiorityDice } from "@/lib/attackMath";
import AttackRow from "@/features/session/AttackRow";
import { useAttackRolls } from "@/features/session/useAttackRolls";
import { useRollLogger } from "@/features/session/useRollLogger";
import type { TurnState, TurnStateActions } from "@/features/session/useTurnState";
import type { Character } from "@/types/character";

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
  // The off-hand swing is a bonus action, not part of the Attack-action tally —
  // record via recordTwfAttack and no-op the tally writers so it never lands in
  // it. currentRow is null for the same reason: with no tally row there is no
  // verdict, so only a nat-20 crits here until #813 adopts the verdict flow.
  const { riderTotals, viewFor } = useAttackRolls({
    roll,
    logRollSafe,
    recordAttack: () => turnState.recordTwfAttack(),
    setTallyDamage: () => {},
    setTallyAttackTotal: () => {},
    addTallyDamageRider: () => {},
    currentRow: null,
  });

  const entry = buildOffHandEntry(character);
  const showManeuvers = hasSuperiorityDice(character);

  // The single off-hand swing is spent once recordTwfAttack clears bonusAttack.
  const rolled = turnState.bonusAttack === null;

  return (
    <div className="flex flex-col divide-y divide-parchment-200">
      <p className="pb-2 text-xs font-semibold uppercase tracking-wide text-parchment-600">
        Off-hand attack · 1 swing
      </p>

      {entry ? (
        <AttackRow
          view={viewFor(entry)}
          attacksExhausted={rolled}
          showManeuvers={showManeuvers}
          character={character}
          riderTotals={riderTotals}
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
