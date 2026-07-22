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
import RollModeChoice from "@/features/dice/RollModeChoice";
import type { RollMode } from "@/lib/dice";
import {
  attacksExhausted as computeAttacksExhausted,
  buildAttackForms,
  hasSuperiorityDice,
  type AttackEntry,
} from "@/lib/attackMath";
import type { AttackTallyRow } from "@/lib/attackTallySummary";
import { useManeuverDie } from "@/features/session/useManeuverDie";
import { useRollLogger } from "@/features/session/useRollLogger";
import { useAttackRolls } from "@/features/session/useAttackRolls";
import AttackStepCard, { AttackKickerPips } from "@/features/session/AttackStepCard";
import AttackTallyStrip from "@/features/session/AttackTallyStrip";
import AttackSheetFooter from "@/features/session/AttackSheetFooter";
import ManeuversDisclosure from "@/features/session/ManeuversDisclosure";
import SneakAttackSection from "@/features/session/SneakAttackSection";
import StunningStrikeSection from "@/features/session/StunningStrikeSection";
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

// The last Attack-action row steps 2–3 bind to — the tally also holds off-hand
// (bonusAction) rows, so the search is source-scoped (#813).
function lastActionRow(tally: TurnState["attackTally"]): {
  index: number;
  row: AttackTallyRow | null;
} {
  const index = tally.map((r) => r.source).lastIndexOf("action");
  return { index, row: index >= 0 ? tally[index] : null };
}

// With a weapon: the sheet's ADV/DIS control (#958); without: the empty hint.
function WeaponRollModeRow({
  hasWeapon,
  mode,
  onSelect,
}: {
  hasWeapon: boolean;
  mode: RollMode;
  onSelect: (m: RollMode) => void;
}) {
  if (!hasWeapon) {
    return (
      <p className="text-sm text-parchment-600">
        No weapon equipped — use Change on the turn screen.
      </p>
    );
  }
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-parchment-600">
        Roll to hit
      </span>
      <RollModeChoice selected={mode} onSelect={onSelect} ariaLabel="Attack roll mode" />
    </div>
  );
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
  // The attack sheet's own ADV/DIS choice (#958) — replaces the retired global
  // roll-mode footer. Visible on the sheet, applied to each to-hit roll here.
  const [attackMode, setAttackMode] = useState<RollMode>("normal");

  const { index: currentRowIndex, row: currentRow } = lastActionRow(turnState.attackTally);

  const { riderTotals, viewFor } = useAttackRolls({
    roll,
    logRollSafe,
    recordAttack: turnState.recordAttack,
    setTallyDamage: turnState.setTallyDamage,
    setTallyAttackTotal: turnState.setTallyAttackTotal,
    addTallyDamageRider: turnState.addTallyDamageRider,
    currentRow,
    source: "action",
    manualMode: attackMode,
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

  // "Next" — re-arms step 1 after a resolved attack so the player can
  // re-orient (switch forms) before rolling, instead of an instant re-roll (#834).
  function handleNext() {
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
  const sneakAttack = boundView && (
    <SneakAttackSection
      character={character}
      turnState={turnState}
      currentRow={currentRow}
      onUpdate={onUpdate}
    />
  );
  const stunningStrike = boundView && (
    <StunningStrikeSection
      character={character}
      turnState={turnState}
      currentRow={currentRow}
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
      onNext={handleNext}
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
  const weaponRow = (
    <WeaponRollModeRow hasWeapon={view.hasWeapon} mode={attackMode} onSelect={setAttackMode} />
  );

  // Mobile: one column in journey order. md+: the step card keeps the left
  // column and the counter/tally/maneuvers/cantrips form the right rail
  // (final-spec frame 12) so the step column never scrolls.
  if (isMobile) {
    return (
      <div className="flex flex-col gap-2">
        {tallyStrip}
        {weaponRow}
        {stepCard}
        {maneuversDisclosure}
        {sneakAttack}
        {stunningStrike}
        {spellAttacks}
        {footer}
      </div>
    );
  }

  return (
    <div className="flex items-start gap-4">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {weaponRow}
        {stepCard}
        {footer}
      </div>
      <div className="flex w-60 shrink-0 flex-col gap-2">
        <AttackKickerPips attack={turnState.attack} />
        {tallyStrip}
        {maneuversDisclosure}
        {sneakAttack}
        {stunningStrike}
        {spellAttacks}
      </div>
    </div>
  );
}
