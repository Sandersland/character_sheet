// AttackEntryView + buildManeuverView (#1845) — lifted verbatim out of
// InlineAttackPicker (#1832) so the off-hand/Flurry bonus pickers can share
// the SAME adapter instead of a second copy: ManeuverPrompt (hosted inside
// ManeuversDisclosure) still speaks the pre-#1831 AttackEntryView shape — its
// Precision/damage-maneuver prompts read lastAttackRoll/lastDamageRoll/
// onRollsUpdated, unrelated to useResolution's own rolling — so every
// useResolution-driven picker (main attack, off-hand, Flurry) builds this same
// minimal view off its own ResolutionView once a to-hit roll exists for the
// current swing, mirroring the pre-#1832 useAttackRolls boundView binding.
//
// A maneuver's boost reaches the committed resolveAction op (#1844), not just
// the tally: `onRollsUpdated` folds the Precision (to-hit) half through
// useResolution's `boostToHit` seam, and routes the damage half through the
// existing riders[] seam (#1843) via `recordDamageRider` — an additive
// same-type term merged into the swing's op at commit.

import type { AttackEntry, DamageRider } from "@/lib/attackMath";
import type { AttackTallyRow } from "@/lib/attackTallySummary";
import type { ResolutionView } from "@/features/session/useResolution";
import type { TurnState, TurnStateActions } from "@/features/session/useTurnState";
import type { RollMode, RollResult } from "@/lib/dice";
import type { ResolveActionEventEffect } from "@character-sheet/shared-types";

// Everything one AttackStepCard/ResolutionRail-driven prompt needs, bundled
// per entry so the component takes a single `view` prop instead of the full
// state surface. Historically useAttackRolls' own output shape (#778); kept
// here now that useAttackRolls is retired (#1845) since ManeuverPrompt still
// consumes it.
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

// Stable riders[] key for a damage maneuver's superiority die (#1844) — one
// slot in a picker's local riderEffects map, overwritten if the die is
// respent, cleared with every other rider after commit. Shared so every
// useResolution-driven picker keys the maneuver rider identically.
export const MANEUVER_DAMAGE_RIDER_ID = "maneuver:damage";

export function buildManeuverView(
  resolutionView: ResolutionView,
  armedEntry: AttackEntry,
  currentRow: AttackTallyRow | null,
  turnState: TurnState & TurnStateActions,
  // The riders[] seam (#1843/#1844): a damage maneuver's spent die is recorded
  // as an additive same-type rider so it rides the swing's committed op — the
  // caller owns the local rider map this writes into.
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
        // #1844: fold the Precision boost (die = boosted total − un-boosted
        // roll) into the committed to-hit event, not just the tally display.
        resolutionView.boostToHit(newAttackTotal - (resolutionView.toHitRoll?.total ?? newAttackTotal));
      }
      if (newDamageTotal !== null) {
        turnState.setTallyDamage(currentRow.id, newDamageTotal);
        // #1844: route the damage die through riders[] — its value is the
        // boost over the un-boosted damage roll; same type as the weapon, and
        // not crit-doubled (ManeuverPrompt adds the raw die).
        const die = newDamageTotal - (resolutionView.effectRoll?.total ?? newDamageTotal);
        recordDamageRider({
          spec: `+${die}`,
          faces: [die],
          total: die,
          type: armedEntry.damageType,
          kind: "damage",
          crit: false,
        });
      }
    },
  };
}
