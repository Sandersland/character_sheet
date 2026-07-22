// The Flurry of Blows sheet (#1217): SRD 5.2 Focus — "Expend 1 Focus Point to
// make two Unarmed Strikes as a Bonus Action" (three at Heightened Focus, monk
// L10, #1244 — not yet built). Modeled on InlineOffHandPicker's step-rail
// shell but looping over `turnState.bonusAttack.total` strikes instead of
// TWF's fixed single swing: forms is always [Unarmed Strike]
// (buildUnarmedOnlyForms), so AttackStepCard's "Attacking with" selector never
// renders — no weapon toggle, matching the 2024 rule (unlike the pre-#1217
// generic attack-picker this replaced). The roll/miss/crit/skip/next wiring is
// shared with InlineOffHandPicker via useBonusAttackSheet.

import { useState } from "react";

import { useIsBelowMd } from "@/hooks/useIsBelowMd";

import RollModeChoice from "@/features/dice/RollModeChoice";
import type { RollMode } from "@/lib/dice";
import { attacksExhausted as computeAttacksExhausted, buildUnarmedOnlyForms } from "@/lib/attackMath";
import { useBonusAttackSheet } from "@/features/session/useBonusAttackSheet";
import AttackStepCard, { AttackKickerPips } from "@/features/session/AttackStepCard";
import AttackSheetFooter from "@/features/session/AttackSheetFooter";
import type { TurnState, TurnStateActions } from "@/features/session/useTurnState";
import type { Character } from "@/types/character";

interface InlineFlurryPickerProps {
  character: Character;
  turnState: TurnState & TurnStateActions;
  /** Active session id — attack/damage rolls are logged against it. */
  sessionId: string;
  /** Commit and dismiss (bonus action already spent on open). */
  onClose: () => void;
  /** Back out before rolling any strike — refunds the bonus action + Focus spend. */
  onCancel: () => void;
  /** Required for ManeuversDisclosure to push resource spend results back up. */
  onUpdate: (c: Character) => void;
  /** Called after a roll is logged so the Session Log can refresh. */
  onLogChanged: () => void;
}

export default function InlineFlurryPicker({
  character,
  turnState,
  sessionId,
  onClose,
  onCancel,
  onUpdate,
  onLogChanged,
}: InlineFlurryPickerProps) {
  // The sheet's own ADV/DIS choice (#958), same as the main Attack sheet.
  const [attackMode, setAttackMode] = useState<RollMode>("normal");

  const forms = buildUnarmedOnlyForms(character);
  const entry = forms[0];
  const attack = turnState.bonusAttack;
  const attacksExhausted = computeAttacksExhausted(attack);

  const {
    currentRow,
    riderTotals,
    viewFor,
    boundView,
    handleRollToHit,
    handleCallMiss,
    handleCallCrit,
    handleSkip,
    handleNext,
    tallyStrip,
    maneuversDisclosure,
  } = useBonusAttackSheet({
    character,
    turnState,
    sessionId,
    entry,
    recordAttack: turnState.recordFlurryAttack,
    attacksExhausted,
    onUpdate,
    onLogChanged,
    manualMode: attackMode,
  });

  const isMobile = useIsBelowMd();

  const rollModeRow = (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-parchment-600">
        Roll to hit
      </span>
      <RollModeChoice selected={attackMode} onSelect={setAttackMode} ariaLabel="Attack roll mode" />
    </div>
  );
  const stepCard = (
    <AttackStepCard
      forms={forms}
      selectedId={entry.id}
      onSelect={() => {}}
      selectedView={viewFor(entry)}
      boundView={boundView}
      currentRow={currentRow}
      attack={attack}
      attacksExhausted={attacksExhausted}
      onRollToHit={handleRollToHit}
      onCallMiss={handleCallMiss}
      onCallCrit={handleCallCrit}
      onSkip={handleSkip}
      onNext={handleNext}
      riderTotals={riderTotals}
      showKicker={isMobile}
    />
  );
  const footer = (
    <AttackSheetFooter
      preRoll={attack !== null && attack.used === 0}
      attacksRemain={attack !== null && attack.used > 0 && attack.used < attack.total}
      onCancel={onCancel}
      onClose={onClose}
      refundLabel="Cancel — refund bonus action"
    />
  );

  if (isMobile) {
    return (
      <div className="flex flex-col gap-2">
        {tallyStrip}
        {rollModeRow}
        {stepCard}
        {maneuversDisclosure}
        {footer}
      </div>
    );
  }

  return (
    <div className="flex items-start gap-4">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {rollModeRow}
        {stepCard}
        {footer}
      </div>
      <div className="flex w-60 shrink-0 flex-col gap-2">
        <AttackKickerPips attack={attack} />
        {tallyStrip}
        {maneuversDisclosure}
      </div>
    </div>
  );
}
