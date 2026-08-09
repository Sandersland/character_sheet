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
// KNOWN GAP (unchanged from #1832, not a regression introduced here): a
// maneuver-boosted total writes into the tally (so the tally strip / turn-
// summary banner display the boosted number) but NOT into the resolveAction
// event already built from useResolution's own (un-boosted) roll state — the
// persisted audit log keeps the raw die total. This is IDENTICAL to the
// pre-migration behavior (the old useAttackRolls' onRollsUpdated also only
// ever wrote the tally, never re-logged the roll) — fixing it needs an
// override seam on useResolution itself (#1831/#1844), out of this slice's
// scope for all three pickers alike.

import type { AttackEntry, DamageRider } from "@/lib/attackMath";
import type { AttackTallyRow } from "@/lib/attackTallySummary";
import type { ResolutionView } from "@/features/session/useResolution";
import type { TurnState, TurnStateActions } from "@/features/session/useTurnState";
import type { RollMode, RollResult } from "@/lib/dice";

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

export function buildManeuverView(
  resolutionView: ResolutionView,
  armedEntry: AttackEntry,
  currentRow: AttackTallyRow | null,
  turnState: TurnState & TurnStateActions,
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
      if (newAttackTotal !== null) turnState.setTallyAttackTotal(currentRow.id, newAttackTotal);
      if (newDamageTotal !== null) turnState.setTallyDamage(currentRow.id, newDamageTotal);
    },
  };
}
