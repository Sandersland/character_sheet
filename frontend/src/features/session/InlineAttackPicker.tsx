// Attack sheet: one attack card with an "Attacking with" form selector (equipped
// weapons + Unarmed + Improvised) and one Damage card bound to the last-rolled
// form, then attack-option maneuvers and attack cantrips (#734/#786).

import { useState } from "react";

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
import AttackFormCard from "@/features/session/AttackFormCard";
import AttackOptionSection from "@/features/session/AttackOptionSection";
import AttackSheetFooter from "@/features/session/AttackSheetFooter";
import WeaponDamageCard from "@/features/session/WeaponDamageCard";
import { AttackCounter } from "@/features/session/TurnControls";
import InlineSpellAttackSection from "@/features/session/InlineSpellAttackSection";
import type { TurnState, TurnStateActions } from "@/features/session/useTurnState";
import type { Character } from "@/types/character";

// Selection state: the chosen form drives the attack card; the last-rolled form
// binds the Damage card (RAW: damage belongs to the form that was declared and
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

  const { riderTotals, viewFor } = useAttackRolls({
    roll,
    logRollSafe,
    recordAttack: turnState.recordAttack,
  });

  const forms = buildAttackForms(character);
  // buildAttackForms always appends Unarmed + Improvised, so any other id is a weapon.
  const hasWeapon = forms.some((f) => f.id !== "unarmed" && f.id !== "improvised");

  const { selectedEntry, lastRolledEntry, setSelectedId, markRolled } =
    useAttackFormSelection(forms);

  const showManeuvers = hasSuperiorityDice(character);
  const attacksExhausted = computeAttacksExhausted(turnState.attack);
  const preRoll = turnState.attack !== null && turnState.attack.used === 0;

  // Roll to hit with the selected form and bind the Damage card to it.
  function handleRollToHit() {
    markRolled(selectedEntry.id);
    viewFor(selectedEntry).onAttack();
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Live Extra-Attack counter — pips + "N of M remaining". Hidden at total 1
          (the kicker's "1 attack" is enough). */}
      {turnState.attack !== null && turnState.attack.total > 1 && (
        <AttackCounter total={turnState.attack.total} used={turnState.attack.used} label="Attacks" />
      )}

      {!hasWeapon && (
        <p className="text-sm text-parchment-600">
          No weapon equipped — use Change on the turn screen.
        </p>
      )}

      <AttackFormCard
        forms={forms}
        selectedId={selectedEntry.id}
        onSelect={setSelectedId}
        view={viewFor(selectedEntry)}
        attacksExhausted={attacksExhausted}
        onRollToHit={handleRollToHit}
      />

      {/* Keyed on the last-rolled form so switching forms remounts the card and
          resets the ManeuverPrompt spend state (#756). */}
      <WeaponDamageCard
        key={lastRolledEntry?.id ?? "inert"}
        view={lastRolledEntry ? viewFor(lastRolledEntry) : null}
        showManeuvers={showManeuvers}
        character={character}
        riderTotals={riderTotals}
        onUpdate={onUpdate}
      />

      <AttackOptionSection
        character={character}
        turnState={turnState}
        showManeuvers={showManeuvers}
        attacksExhausted={attacksExhausted}
        die={die}
      />

      {/* Attack-roll cantrips (Fire Bolt) — single transactional cast (#734). */}
      <InlineSpellAttackSection
        character={character}
        sessionId={sessionId}
        turnState={turnState}
        onUpdate={onUpdate}
        onLogChanged={onLogChanged}
      />

      <AttackSheetFooter preRoll={preRoll} onCancel={onCancel} onClose={onClose} />
    </div>
  );
}
