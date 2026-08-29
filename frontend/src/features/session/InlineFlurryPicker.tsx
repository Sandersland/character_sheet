// SRD 5.2 Focus: "Expend 1 Focus Point to make two Unarmed Strikes as a Bonus Action."
// The Focus spend is deferred to the first strike roll (onCommitFocusSpend), not fired on open, so cancelling before rolling any strike costs no Focus.

import { useState } from "react";

import { useIsBelowMd } from "@/hooks/useIsBelowMd";

import RollModeChoice from "@/features/dice/RollModeChoice";
import type { RollMode } from "@/lib/dice";
import { buildUnarmedOnlyForms, flurryStrikeCount } from "@/lib/attackMath";
import { useBonusAttackSheet } from "@/features/session/useBonusAttackSheet";
import ResolutionRail from "@/features/session/ResolutionRail";
import { AttackKickerPips, DamageRidersPanel } from "@/features/session/railPrimitives";
import AttackSheetFooter from "@/features/session/AttackSheetFooter";
import OpenHandTechniqueSection from "@/features/session/OpenHandTechniqueSection";
import type { TurnState, TurnStateActions } from "@/features/session/useTurnState";
import { useCurrentCharacter } from "@/hooks/CurrentCharacterProvider";

interface InlineFlurryPickerProps {
  turnState: TurnState & TurnStateActions;
  onClose: () => void;
  onCancel: () => void;
  onLogChanged: () => void;
  onCommitFocusSpend: () => void;
}

export default function InlineFlurryPicker({
  turnState,
  onClose,
  onCancel,
  onLogChanged,
  onCommitFocusSpend,
}: InlineFlurryPickerProps) {
  const { character } = useCurrentCharacter();
  const [attackMode, setAttackMode] = useState<RollMode>("normal");

  const forms = buildUnarmedOnlyForms(character);
  const entry = forms[0];
  const attack = turnState.bonusAttack;
  const totalSwings = attack?.total ?? flurryStrikeCount(character);

  const {
    currentRow,
    resolutionView,
    riderTotals,
    onDamageRider,
    completedSwings,
    tallyStrip,
    maneuversDisclosure,
    commitError,
  } = useBonusAttackSheet({
      character,
      turnState,
      entry,
      totalSwings,
      record: turnState.recordFlurryAttack,
      onFirstStrike: onCommitFocusSpend,
      onLogChanged,
      manualMode: attackMode,
    });

  const isMobile = useIsBelowMd();

  const openHandTechnique = currentRow && (
    <OpenHandTechniqueSection turnState={turnState} currentRow={currentRow} />
  );

  const rollModeRow = (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-parchment-600">
        Roll to hit
      </span>
      <RollModeChoice selected={attackMode} onSelect={setAttackMode} ariaLabel="Attack roll mode" />
    </div>
  );
  const stepCard = (
    <div className="flex flex-col gap-2">
      {isMobile && <AttackKickerPips attack={attack} />}
      <ResolutionRail view={resolutionView} />
      <DamageRidersPanel
        resolutionView={resolutionView}
        armedEntry={entry}
        riderTotals={riderTotals}
        onDamageRider={onDamageRider}
      />
      {commitError && <p className="text-xs font-semibold text-garnet-700">{commitError}</p>}
    </div>
  );
  // Keyed off completedSwings, not turnState.bonusAttack.used, which ticks the instant to-hit rolls — avoids the footer flipping to Done/Close ahead of ResolutionRail's own completion tap.
  const preRoll = completedSwings === 0 && !resolutionView.toHitRoll;
  const attacksRemain = !preRoll && completedSwings < totalSwings;
  const footer = (
    <AttackSheetFooter
      preRoll={preRoll}
      attacksRemain={attacksRemain}
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
        {openHandTechnique}
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
        {openHandTechnique}
        {maneuversDisclosure}
      </div>
    </div>
  );
}
