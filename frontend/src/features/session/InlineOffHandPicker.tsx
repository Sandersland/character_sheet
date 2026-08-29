// Off-hand damage's ability-modifier adjustment (Two-Weapon Fighting style) is
// applied server-side and arrives already computed on the AttackRow; this
// sheet only labels what it is served.

import { useIsBelowMd } from "@/hooks/useIsBelowMd";

import { buildBonusSwingEntry } from "@/lib/attackMath";
import { useBonusAttackSheet } from "@/features/session/useBonusAttackSheet";
import ResolutionRail from "@/features/session/ResolutionRail";
import { AttackFormSummaryCore, DamageRidersPanel } from "@/features/session/railPrimitives";
import AttackSheetFooter from "@/features/session/AttackSheetFooter";
import type { TurnState, TurnStateActions } from "@/features/session/useTurnState";
import { useCurrentCharacter } from "@/hooks/CurrentCharacterProvider";

interface InlineOffHandPickerProps {
  turnState: TurnState & TurnStateActions;
  /** Commit and dismiss (bonus action already spent by the roll). */
  onClose: () => void;
  /** Back out before rolling — refunds the bonus action and reopens the menu. */
  onCancel: () => void;
  onLogChanged: () => void;
  variant?: "twf" | "unarmed";
}

export default function InlineOffHandPicker({
  turnState,
  onClose,
  onCancel,
  onLogChanged,
  variant = "twf",
}: InlineOffHandPickerProps) {
  const { character } = useCurrentCharacter();
  const entry = buildBonusSwingEntry(character, variant);
  const totalSwings = 1;

  const { resolutionView, riderTotals, onDamageRider, completedSwings, tallyStrip, maneuversDisclosure, commitError } =
    useBonusAttackSheet({
      character,
      turnState,
      entry,
      totalSwings,
      record: turnState.recordTwfAttack,
      onLogChanged,
    });

  const isMobile = useIsBelowMd();

  // Keep in sync with InlineAttackPicker: attacksRemain must key off
  // completedSwings (advances only on commit), not the to-hit roll alone, or
  // the footer shows its own "Done" at the same time as ResolutionRail's.
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

  if (!entry) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-parchment-600">
          No off-hand weapon equipped. Equip a second weapon from the Inventory tab.
        </p>
        {footer}
      </div>
    );
  }

  const stepCard = (
    <div className="flex flex-col gap-2">
      <span className="min-w-0">
        <AttackFormSummaryCore selected={entry} />
      </span>
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

  if (isMobile) {
    return (
      <div className="flex flex-col gap-2">
        {tallyStrip}
        {stepCard}
        {maneuversDisclosure}
        {footer}
      </div>
    );
  }

  return (
    <div className="flex items-start gap-4">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {stepCard}
        {footer}
      </div>
      <div className="flex w-60 shrink-0 flex-col gap-2">
        {tallyStrip}
        {maneuversDisclosure}
      </div>
    </div>
  );
}
