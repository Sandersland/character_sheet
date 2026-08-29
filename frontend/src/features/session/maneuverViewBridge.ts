import type { AttackEntry, DamageRider } from "@/lib/attackMath";
import type { AttackTallyRow } from "@/lib/attackTallySummary";
import type { ResolutionView } from "@/features/session/useResolution";
import type { TurnState, TurnStateActions } from "@/features/session/useTurnState";
import type { RollMode, RollResult } from "@/lib/dice";
import type { ResolveActionEventEffect } from "@character-sheet/shared-types";

export interface AttackEntryView {
  entry: AttackEntry;
  attackTotal: number | null | undefined;
  damageTotal: number | null | undefined;
  lastAttackRoll: RollResult | null;
  lastDamageRoll: RollResult | null;
  isCrit: boolean;
  attackChip: string;
  attackMode: RollMode;
  onAttack: () => void;
  onDamage: () => void;
  onDamageRider: (rider: DamageRider) => void;
  onRollsUpdated: (newAttackTotal: number | null, newDamageTotal: number | null) => void;
}

// Shared across every useResolution-driven picker so they key the maneuver rider identically.
export const MANEUVER_DAMAGE_RIDER_ID = "maneuver:damage";

export function buildManeuverView(
  resolutionView: ResolutionView,
  armedEntry: AttackEntry,
  currentRow: AttackTallyRow | null,
  turnState: TurnState & TurnStateActions,
  // Caller owns the local rider map this writes into; the recorded rider must be additive and same-type so it rides the swing's committed op.
  recordDamageRider: (effect: ResolveActionEventEffect) => void,
): AttackEntryView | null {
  if (!resolutionView.toHitRoll) return null;
  return {
    entry: armedEntry,
    attackTotal: null,
    damageTotal: null,
    lastAttackRoll: resolutionView.toHitRoll,
    lastDamageRoll: resolutionView.effectRoll,
    isCrit: resolutionView.isCrit,
    attackChip: resolutionView.attackChip,
    attackMode: resolutionView.attackMode,
    onAttack: () => {},
    onDamage: () => {},
    onDamageRider: () => {},
    onRollsUpdated: (newAttackTotal, newDamageTotal) => {
      if (!currentRow) return;
      if (newAttackTotal !== null) {
        turnState.setTallyAttackTotal(currentRow.id, newAttackTotal);
        // Fold the Precision boost (boosted total minus the unboosted roll) into the committed to-hit event, not just the tally display.
        resolutionView.boostToHit(newAttackTotal - (resolutionView.toHitRoll?.total ?? newAttackTotal));
      }
      if (newDamageTotal !== null) {
        turnState.setTallyDamage(currentRow.id, newDamageTotal);
        // Routes the damage die through riders[]: it's the boost over the unboosted roll, same type as the weapon, and not crit-doubled — ManeuverPrompt adds the raw die separately.
        const die = newDamageTotal - (resolutionView.effectRoll?.total ?? newDamageTotal);
        recordDamageRider({
          spec: `+${die}`,
          faces: [die],
          total: die,
          type: armedEntry.damageType,
          kind: "damage",
          crit: false,
          source: "Maneuver",
        });
      }
    },
  };
}
