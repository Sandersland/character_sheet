// Attack sheet (#811): one step-rail card (Roll to hit → Call it → Damage) with
// an "Attacking with" form selector, the "This action" tally strip, a collapsed
// Battle Master maneuvers disclosure, and attack cantrips (#734/#786). At md+
// the sheet widens (~42rem) and the counter + tally + maneuvers + cantrips move
// into a right rail beside the step card so the step column never scrolls —
// placement switches via useIsBelowMd (single mount per widget, like
// BottomSheet's own breakpoint gating).

import { useState } from "react";

import { useIsBelowMd } from "@/hooks/useIsBelowMd";

import { useRoll } from "@/features/dice/RollContext";
import {
  attacksExhausted as computeAttacksExhausted,
  buildAttackForms,
  hasSuperiorityDice,
  type AttackEntry,
} from "@/lib/attackMath";
import { useManeuverDie } from "@/features/session/useManeuverDie";
import { useRollLogger } from "@/features/session/useRollLogger";
import { useAttackRolls } from "@/features/session/useAttackRolls";
import AttackStepCard, { AttackKickerPips } from "@/features/session/AttackStepCard";
import AttackTallyStrip from "@/features/session/AttackTallyStrip";
import AttackSheetFooter from "@/features/session/AttackSheetFooter";
import ManeuversDisclosure from "@/features/session/ManeuversDisclosure";
import InlineSpellAttackSection from "@/features/session/InlineSpellAttackSection";
import type { TurnState, TurnStateActions } from "@/features/session/useTurnState";
import type { Character } from "@/types/character";

// Selection state: the chosen form drives the roll button; the last-rolled form
// binds steps 2–3 (RAW: damage belongs to the form that was declared and
// rolled). Both resolve against the live `forms` list so a mid-open inventory
// change falls back to a real, visibly checked option.
function useAttackFormSelection(forms: AttackEntry[]) {
  const [selectedId, setSelectedId] = useState<string>(forms[0].id);
  const [lastRolledId, setLastRolledId] = useState<string | null>(null);
  const selectedEntry = forms.find((f) => f.id === selectedId) ?? forms[0];
  const lastRolledEntry = lastRolledId
    ? forms.find((f) => f.id === lastRolledId) ?? null
    : null;
  return { selectedEntry, lastRolledEntry, setSelectedId, markRolled: setLastRolledId };
}

// Pure per-render derivations for the picker shell, extracted so the component
// stays a composition layer (the pre-#811 pattern, kept).
function pickerView(character: Character, attack: TurnState["attack"], forms: AttackEntry[]) {
  return {
    // buildAttackForms always appends Unarmed + Improvised, so any other id is a weapon.
    hasWeapon: forms.some((f) => f.id !== "unarmed" && f.id !== "improvised"),
    showManeuvers: hasSuperiorityDice(character),
    attacksExhausted: computeAttacksExhausted(attack),
    preRoll: attack !== null && attack.used === 0,
    attacksRemain: attack !== null && attack.used > 0 && attack.used < attack.total,
  };
}

interface InlineAttackPickerProps {
  character: Character;
  turnState: TurnState & TurnStateActions;
  /** Active session id — attack/damage rolls are logged against it. */
  sessionId: string;
  onClose: () => void;
  /**
   * Called when the player cancels before rolling any attacks — refunds the
   * action and returns to the action menu.
   */
  onCancel: () => void;
  /** Required for ManeuverPrompt to push resource spend results back up to the page. */
  onUpdate: (c: Character) => void;
  /** Called after a roll is logged so the Session Log can refresh. */
  onLogChanged: () => void;
}

export default function InlineAttackPicker({
  character,
  turnState,
  sessionId,
  onClose,
  onCancel,
  onUpdate,
  onLogChanged,
}: InlineAttackPickerProps) {
  const { roll } = useRoll();
  const logRollSafe = useRollLogger(character.id, sessionId, onLogChanged);
  const die = useManeuverDie(character, onUpdate);

  // Scope to the Attack action's own rows — the tally now also holds off-hand
  // (bonusAction) rows, and steps 2–3 must bind to the last ACTION row (#813).
  const currentRowIndex = turnState.attackTally.map((r) => r.source).lastIndexOf("action");
  const currentRow = currentRowIndex >= 0 ? turnState.attackTally[currentRowIndex] : null;

  const { riderTotals, viewFor } = useAttackRolls({
    roll,
    logRollSafe,
    recordAttack: turnState.recordAttack,
    setTallyDamage: turnState.setTallyDamage,
    setTallyAttackTotal: turnState.setTallyAttackTotal,
    addTallyDamageRider: turnState.addTallyDamageRider,
    currentRow,
    source: "action",
  });

  const forms = buildAttackForms(character);
  const view = pickerView(character, turnState.attack, forms);

  const { selectedEntry, lastRolledEntry, setSelectedId, markRolled } =
    useAttackFormSelection(forms);

  // Roll to hit with the selected form and bind steps 2–3 to it.
  function handleRollToHit() {
    markRolled(selectedEntry.id);
    viewFor(selectedEntry).onAttack();
  }

  // "it Missed" — one tap: verdict written, row dims into the tally, the card
  // resets so the next attack is armed (#811).
  function handleCallMiss() {
    turnState.setTallyVerdict(currentRowIndex, "miss");
    markRolled(null);
  }

  function handleCallCrit() {
    turnState.setTallyVerdict(currentRowIndex, "crit");
  }

  // Quiet skip — the ungated path that produces an unresolved row.
  function handleSkip() {
    markRolled(null);
  }

  const boundView = lastRolledEntry ? viewFor(lastRolledEntry) : null;
  const isMobile = useIsBelowMd();

  const tallyStrip = (
    <AttackTallyStrip
      rows={turnState.attackTally}
      onSetVerdict={turnState.setTallyVerdict}
      source="action"
    />
  );
  const maneuversDisclosure = view.showManeuvers && (
    <ManeuversDisclosure
      character={character}
      turnState={turnState}
      view={boundView}
      attacksExhausted={view.attacksExhausted}
      die={die}
      onUpdate={onUpdate}
    />
  );
  const spellAttacks = (
    <InlineSpellAttackSection
      character={character}
      sessionId={sessionId}
      turnState={turnState}
      onUpdate={onUpdate}
      onLogChanged={onLogChanged}
    />
  );
  const stepCard = (
    <AttackStepCard
      forms={forms}
      selectedId={selectedEntry.id}
      onSelect={setSelectedId}
      selectedView={viewFor(selectedEntry)}
      boundView={boundView}
      currentRow={currentRow}
      attack={turnState.attack}
      attacksExhausted={view.attacksExhausted}
      onRollToHit={handleRollToHit}
      onCallMiss={handleCallMiss}
      onCallCrit={handleCallCrit}
      onSkip={handleSkip}
      riderTotals={riderTotals}
      showKicker={isMobile}
    />
  );
  const footer = (
    <AttackSheetFooter
      preRoll={view.preRoll}
      attacksRemain={view.attacksRemain}
      onCancel={onCancel}
      onClose={onClose}
    />
  );
  const emptyHint = !view.hasWeapon && (
    <p className="text-sm text-parchment-600">
      No weapon equipped — use Change on the turn screen.
    </p>
  );

  // Mobile: one column in journey order. md+: the step card keeps the left
  // column and the counter/tally/maneuvers/cantrips form the right rail
  // (final-spec frame 12) so the step column never scrolls.
  if (isMobile) {
    return (
      <div className="flex flex-col gap-2">
        {emptyHint}
        {tallyStrip}
        {stepCard}
        {maneuversDisclosure}
        {spellAttacks}
        {footer}
      </div>
    );
  }

  return (
    <div className="flex items-start gap-4">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {emptyHint}
        {stepCard}
        {footer}
      </div>
      <div className="flex w-60 shrink-0 flex-col gap-2">
        <AttackKickerPips attack={turnState.attack} />
        {tallyStrip}
        {maneuversDisclosure}
        {spellAttacks}
      </div>
    </div>
  );
}
