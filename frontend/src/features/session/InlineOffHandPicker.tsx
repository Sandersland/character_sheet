// The Two-Weapon Fighting off-hand attack sheet (#732, redesigned #813): the
// same step-rail shell as the main Attack sheet (InlineAttackPicker), scoped to
// the single off-hand swing. One AttackStepCard (Roll to hit → Call it → Damage)
// over forms=[buildOffHandEntry] — the segmented selector collapses to the
// "Dagger (off-hand)" header — plus the "This bonus action" tally strip, the
// Battle Master maneuvers disclosure (RAW: maneuvers apply to any weapon
// attack), and the shared footer. No Resume/counter pips: the bonus action is a
// single swing. Rolls record a `bonusAction`-source tally row so they land in
// the turn-summary banner and resolve inline exactly like an Attack-action row.
//
// Off-hand damage omits the ability modifier unless the character has the
// Two-Weapon Fighting style — that adjustment lives in buildOffHandEntry.

import { useState } from "react";

import { useIsBelowMd } from "@/hooks/useIsBelowMd";

import { useRoll } from "@/features/dice/RollContext";
import { buildOffHandEntry, hasSuperiorityDice } from "@/lib/attackMath";
import { useManeuverDie } from "@/features/session/useManeuverDie";
import { useRollLogger } from "@/features/session/useRollLogger";
import { useAttackRolls } from "@/features/session/useAttackRolls";
import AttackStepCard from "@/features/session/AttackStepCard";
import AttackTallyStrip from "@/features/session/AttackTallyStrip";
import AttackSheetFooter from "@/features/session/AttackSheetFooter";
import ManeuversDisclosure from "@/features/session/ManeuversDisclosure";
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
}

export default function InlineOffHandPicker({
  character,
  turnState,
  sessionId,
  onClose,
  onCancel,
  onUpdate,
  onLogChanged,
}: InlineOffHandPickerProps) {
  const { roll } = useRoll();
  const logRollSafe = useRollLogger(character.id, sessionId, onLogChanged);
  const die = useManeuverDie(character, onUpdate);
  const [rolledId, setRolledId] = useState<string | null>(null);

  const entry = buildOffHandEntry(character);

  // Bind steps 2–3 to the last bonusAction row — the tally also holds the Attack
  // action's rows, so "last row overall" would misattribute (#813).
  const currentRowIndex = turnState.attackTally.map((r) => r.source).lastIndexOf("bonusAction");
  const currentRow = currentRowIndex >= 0 ? turnState.attackTally[currentRowIndex] : null;

  const { riderTotals, viewFor } = useAttackRolls({
    roll,
    logRollSafe,
    recordAttack: (recorded) => turnState.recordTwfAttack(recorded),
    setTallyDamage: turnState.setTallyDamage,
    setTallyAttackTotal: turnState.setTallyAttackTotal,
    addTallyDamageRider: turnState.addTallyDamageRider,
    currentRow,
    source: "bonusAction",
  });

  const showManeuvers = hasSuperiorityDice(character);
  // recordTwfAttack clears bonusAttack once the single swing lands.
  const rolled = turnState.bonusAttack === null;
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

  const boundView = rolledId ? viewFor(entry) : null;

  // Roll the single off-hand swing and bind steps 2–3 to it.
  function handleRollToHit() {
    setRolledId(entry!.id);
    viewFor(entry!).onAttack();
  }

  // "it Missed" — write the miss verdict; the row dims into the tally.
  function handleCallMiss() {
    if (currentRowIndex >= 0) turnState.setTallyVerdict(currentRowIndex, "miss");
    setRolledId(null);
  }

  function handleCallCrit() {
    if (currentRowIndex >= 0) turnState.setTallyVerdict(currentRowIndex, "crit");
  }

  function handleSkip() {
    setRolledId(null);
  }

  const tallyStrip = (
    <AttackTallyStrip
      rows={turnState.attackTally}
      onSetVerdict={turnState.setTallyVerdict}
      source="bonusAction"
      heading="This bonus action"
    />
  );
  const maneuversDisclosure = showManeuvers && (
    <ManeuversDisclosure
      character={character}
      turnState={turnState}
      view={boundView}
      attacksExhausted={rolled}
      die={die}
      onUpdate={onUpdate}
    />
  );
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
