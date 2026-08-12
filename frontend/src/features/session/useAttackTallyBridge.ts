// useAttackTallyBridge (epic #1827 Slice 5, #1832; generalized #1845) — feeds
// a live-in-progress swing into turnState.attackTally the INSTANT each roll
// lands (to-hit, then damage, then any explicit verdict call), rather than
// waiting for the swing to fully commit, and re-arms useResolution for the
// next swing in the same economy slot once the current one completes.
// Extracted out of InlineAttackPicker (fallow flagged the component's own
// complexity — every hook call this component makes directly adds
// "hook-density" cognitive weight, #1832 review) — bundling the four related
// effects into ONE hook call is the lever, not merely moving code around.
//
// Generalized (#1845) to drive the off-hand/Flurry bonus pickers too: `source`
// picks which tally column this swing belongs to, and `record` is the
// turnState action that both appends the row AND advances that source's own
// economy counter in one call (`recordAttack` for the Action's Extra Attack
// loop, `recordTwfAttack`/`recordFlurryAttack` for a bonusAction swing) — all
// three share the exact same `(recorded?: RecordedAttack) => void` shape.
//
// Why the tally row fires this early, not at commit: SneakAttack/
// StunningStrike/QuiveringPalm/ManeuversDisclosure all need `currentRow` to
// exist DURING the swing (their prompts hang off "the current hit"), not
// only after useResolution's single onComplete — mirrors the pre-#1832
// useAttackRolls timing, where recordAttack fired on the to-hit click itself.
//
// Why the re-arm is an effect, not inline inside commit(): commit() fires
// from inside useResolution's own onComplete, which unconditionally calls
// `setCompleted(true)` immediately AFTER commit() returns; calling reset()
// (which sets completed:false) synchronously from within commit() would just
// get overwritten by that trailing setCompleted(true) in the same batch.
// Deferring to an effect lets the "completed" render land first, then
// re-arms in the render after.

import { useEffect } from "react";

import type { AttackEntry } from "@/lib/attackMath";
import type { AttackTallyRow, TallyRowSource } from "@/lib/attackTallySummary";
import type { ResolutionView } from "@/features/session/useResolution";
import type { RecordedAttack, TurnState, TurnStateActions } from "@/features/session/useTurnState";

export function useAttackTallyBridge(
  turnState: TurnState & TurnStateActions,
  armedEntry: AttackEntry,
  resolutionView: ResolutionView,
  completedSwings: number,
  totalSwings: number,
  reset: () => void,
  source: TallyRowSource = "action",
  record: (recorded?: RecordedAttack) => void = turnState.recordAttack,
): { currentRow: AttackTallyRow | null } {
  const currentRowIndex = turnState.attackTally.map((r) => r.source).lastIndexOf(source);
  const currentRow = currentRowIndex >= 0 ? turnState.attackTally[currentRowIndex] : null;

  // Provisional-row effect: appends the tally row the instant a to-hit roll
  // lands. `resolutionView.attack` is already the exact TallyAttackRoll
  // snapshot (useResolution's own toHitSnapshot call) — no reconstruction.
  const toHitTotal = resolutionView.toHitRoll?.total;
  useEffect(() => {
    if (toHitTotal === undefined || !resolutionView.attack) return;
    record({
      formId: armedEntry.id,
      formName: armedEntry.name,
      source,
      attack: resolutionView.attack,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires once per NEW to-hit roll (toHitTotal identity); record/armedEntry/source read fresh via closure
  }, [toHitTotal]);

  // Damage effect: writes the effect roll's total into the row just created
  // above — mirrors setTallyDamage's own auto-hit fill (withAutoHit), so an
  // implicit hit (verdict was unset) resolves the same way it always has.
  const effectTotal = resolutionView.effectRoll?.total;
  useEffect(() => {
    if (effectTotal === undefined || !currentRow) return;
    turnState.setTallyDamage(currentRow.id, effectTotal);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires once per NEW damage roll (effectTotal identity)
  }, [effectTotal]);

  // Verdict effect: syncs an explicit call ("it Missed" / manual "Crit!")
  // onto the row. A die-forced verdict is already baked into the row at
  // creation (autoVerdict reads the SAME TallyAttackRoll); a miss needs this
  // because no damage roll follows to trigger setTallyDamage's own
  // auto-hit-fill, and a manual crit called before damage needs it recorded
  // before that damage roll's auto-hit-fill would otherwise leave it unset.
  const verdict = resolutionView.verdict;
  useEffect(() => {
    if (verdict === undefined || currentRowIndex < 0) return;
    turnState.setTallyVerdict(currentRowIndex, verdict);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires once per NEW verdict value
  }, [verdict]);

  // Multi-swing loop (Extra Attack, epic #1827; Flurry's 2+ strikes, #1845):
  // re-arms the SAME useResolution instance for the next swing once one
  // completes with this slot's swings still unspent.
  useEffect(() => {
    if (resolutionView.completed && completedSwings < totalSwings) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `reset` is a fresh closure every render (useResolution doesn't memoize it); gating on resolutionView.completed/completedSwings/totalSwings alone is what keeps this effect idempotent
  }, [resolutionView.completed, completedSwings, totalSwings]);

  return { currentRow };
}
