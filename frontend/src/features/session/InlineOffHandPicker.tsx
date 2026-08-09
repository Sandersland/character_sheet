// The Two-Weapon Fighting off-hand attack sheet (#732, redesigned #813,
// rewired onto the shared resolver #1845): the same rail shell as the main
// Attack sheet (InlineAttackPicker) via useResolution/ResolutionRail, scoped
// to the single off-hand swing — no "Attacking with" selector (there is only
// ever one form), plus the "This bonus action" tally strip and the Battle
// Master maneuvers disclosure (RAW: maneuvers apply to any weapon attack). No
// Resume/counter pips: the bonus action is a single swing. The swing commits
// ONE resolveAction event with cost.kind "bonus", recording a
// bonusAction-source tally row so it lands in the turn-summary banner and
// resolves inline exactly like an Attack-action row. The roll/commit wiring
// is shared with InlineFlurryPicker via useBonusAttackSheet (#1217, rewired
// #1845) — this file owns only the off-hand-specific form (buildBonusSwingEntry,
// which may be null) and its footer/layout composition.
//
// Off-hand damage omits the ability modifier unless the character has the
// Two-Weapon Fighting style — the adjustment is applied server-side and arrives
// on the off-hand AttackRow, so this sheet only labels what it is served.
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
  /** "twf" (default): the off-hand weapon swing. "unarmed": Martial Arts'
   *  Bonus Unarmed Strike (#1218) — same shell, locked to the Unarmed Strike
   *  profile via buildBonusSwingEntry. */
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
  // variant-aware entry (#1218): off-hand weapon for "twf", Unarmed Strike for
  // "unarmed"; the useBonusAttackSheet shell (#1217) is otherwise identical.
  const entry = buildBonusSwingEntry(character, variant);
  const totalSwings = 1;

  const { resolutionView, riderTotals, onDamageRider, completedSwings, tallyStrip, maneuversDisclosure } =
    useBonusAttackSheet({
      character,
      turnState,
      entry,
      totalSwings,
      record: turnState.recordTwfAttack,
      onLogChanged,
    });

  const isMobile = useIsBelowMd();

  // Mirrors InlineAttackPicker's own footer-timing comment: keyed off
  // `completedSwings` (only advances once the resolveAction commit lands),
  // NOT off a to-hit roll alone — `attacksRemain` covers the interval between
  // "rolled" and "committed" so the footer never shows its OWN "Done" at the
  // same time as ResolutionRail's completion tap (single swing → the same
  // interval old TWF called "rolled", just timed off the local counter now).
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
    </div>
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
