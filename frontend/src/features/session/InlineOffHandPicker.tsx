// The Two-Weapon Fighting off-hand attack sheet (#732, redesigned #813): the
// same step-rail shell as the main Attack sheet (InlineAttackPicker), scoped to
// the single off-hand swing. One AttackStepCard (Roll to hit → Call it → Damage)
// over forms=[buildOffHandEntry] — the segmented selector collapses to the
// "Dagger (off-hand)" header — plus the "This bonus action" tally strip, the
// Battle Master maneuvers disclosure (RAW: maneuvers apply to any weapon
// attack), and the shared footer. No Resume/counter pips: the bonus action is a
// single swing. Rolls record a `bonusAction`-source tally row so they land in
// the turn-summary banner and resolve inline exactly like an Attack-action row.
// The roll/miss/crit/skip/next wiring is shared with InlineFlurryPicker via
// useBonusAttackSheet (#1217) — this file owns only the off-hand-specific form
// (buildOffHandEntry, which may be null) and its footer/layout composition.
//
// Off-hand damage omits the ability modifier unless the character has the
// Two-Weapon Fighting style — that adjustment lives in buildOffHandEntry.
//
// Martial Arts Bonus Unarmed Strike (#1218) reuses this exact shell via
// `variant="unarmed"`: same single-swing tally/counter path, just locked to
// the Unarmed Strike profile (buildBonusSwingEntry, attackMath.ts) instead of
// the off-hand weapon — no weapon/improvised toggle, matching the rule
// (Flurry of Blows, #1217, is the two-strike Focus version and resolves via
// the separate flurry-picker path, InlineFlurryPicker).

import { useIsBelowMd } from "@/hooks/useIsBelowMd";

import { buildBonusSwingEntry } from "@/lib/attackMath";
import { useBonusAttackSheet } from "@/features/session/useBonusAttackSheet";
import AttackStepCard from "@/features/session/AttackStepCard";
import AttackSheetFooter from "@/features/session/AttackSheetFooter";
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
  /** "twf" (default): the off-hand weapon swing. "unarmed": Martial Arts'
   *  Bonus Unarmed Strike (#1218) — same shell, locked to the Unarmed Strike
   *  profile via buildBonusSwingEntry. */
  variant?: "twf" | "unarmed";
}

export default function InlineOffHandPicker({
  character,
  turnState,
  sessionId,
  onClose,
  onCancel,
  onUpdate,
  onLogChanged,
  variant = "twf",
}: InlineOffHandPickerProps) {
  // variant-aware entry (#1218): off-hand weapon for "twf", Unarmed Strike for
  // "unarmed"; the useBonusAttackSheet shell (#1217) is otherwise identical.
  const entry = buildBonusSwingEntry(character, variant);
  // recordTwfAttack clears bonusAttack once the single swing lands — "rolled"
  // doubles as "exhausted" for a swing that only ever happens once.
  const rolled = turnState.bonusAttack === null;

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
    recordAttack: turnState.recordTwfAttack,
    attacksExhausted: rolled,
    onUpdate,
    onLogChanged,
  });

  const isMobile = useIsBelowMd();

  const footer = (
    <AttackSheetFooter
      preRoll={!rolled}
      attacksRemain={false}
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
    <AttackStepCard
      forms={[entry]}
      selectedId={entry.id}
      onSelect={() => {}}
      selectedView={viewFor(entry)}
      boundView={boundView}
      currentRow={currentRow}
      attack={turnState.bonusAttack}
      attacksExhausted={rolled}
      onRollToHit={handleRollToHit}
      onCallMiss={handleCallMiss}
      onCallCrit={handleCallCrit}
      onSkip={handleSkip}
      onNext={handleNext}
      riderTotals={riderTotals}
      showKicker={false}
    />
  );

  // Mobile: one column in journey order. md+: the step card keeps the left column
  // and the tally + maneuvers form the right rail — mirrors InlineAttackPicker.
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
