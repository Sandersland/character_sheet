// `source` picks the tally column; `record` both appends the row and advances that source's economy counter (recordAttack / recordTwfAttack / recordFlurryAttack).
// The tally row is created as soon as the to-hit roll lands, not at commit, because SneakAttack/StunningStrike/QuiveringPalm/ManeuversDisclosure need `currentRow` to exist during the swing.

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
  /** True while this swing's resolveAction mutation hasn't settled — see the re-arm effect below. */
  commitPending: boolean,
  source: TallyRowSource = "action",
  record: (recorded?: RecordedAttack) => void = turnState.recordAttack,
): { currentRow: AttackTallyRow | null } {
  const currentRowIndex = turnState.attackTally.map((r) => r.source).lastIndexOf(source);
  const currentRow = currentRowIndex >= 0 ? turnState.attackTally[currentRowIndex] : null;

  // resolutionView.attack is already the exact TallyAttackRoll snapshot — no reconstruction needed here.
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

  // Mirrors setTallyDamage's own auto-hit fill (withAutoHit) so an implicit hit (verdict unset) resolves the same way it always has.
  const effectTotal = resolutionView.effectRoll?.total;
  useEffect(() => {
    if (effectTotal === undefined || !currentRow) return;
    turnState.setTallyDamage(currentRow.id, effectTotal);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires once per NEW damage roll (effectTotal identity)
  }, [effectTotal]);

  // Needed for a miss (no damage roll follows to trigger setTallyDamage's auto-hit-fill) and for a manual crit called before damage (so it's recorded before that fill would otherwise leave it unset).
  const verdict = resolutionView.verdict;
  useEffect(() => {
    if (verdict === undefined || currentRowIndex < 0) return;
    turnState.setTallyVerdict(currentRowIndex, verdict);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires once per NEW verdict value
  }, [verdict]);

  // The re-arm runs in an effect, not inside commit(), because a synchronous reset() would be overwritten by onComplete's trailing setCompleted(true) in the same batch.
  // Gating on !commitPending avoids re-arming for a phantom next swing before the resolveAction mutation has settled (completedSwings only advances on SUCCESS).
  useEffect(() => {
    if (resolutionView.completed && !commitPending && completedSwings < totalSwings) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `reset` is a fresh closure every render (useResolution doesn't memoize it); gating on resolutionView.completed/commitPending/completedSwings/totalSwings alone is what keeps this effect idempotent
  }, [resolutionView.completed, commitPending, completedSwings, totalSwings]);

  return { currentRow };
}
