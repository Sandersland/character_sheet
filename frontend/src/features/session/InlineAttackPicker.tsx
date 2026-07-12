// Attack sheet: equipped-weapon cards (deduped by name) + a shared Damage card,
// then Unarmed/Improvised rows, attack-option maneuvers, and attack cantrips (#734).

import { useState } from "react";

import { useRoll } from "@/features/dice/RollContext";
import {
  attacksExhausted as computeAttacksExhausted,
  buildEquippedWeaponEntries,
  hasSuperiorityDice,
} from "@/lib/attackMath";
import { useManeuverDie } from "@/features/session/useManeuverDie";
import { useRollLogger } from "@/features/session/useRollLogger";
import { useAttackRolls } from "@/features/session/useAttackRolls";
import AttackOptionSection from "@/features/session/AttackOptionSection";
import AttackSheetFooter from "@/features/session/AttackSheetFooter";
import BasicAttackRows from "@/features/session/BasicAttackRows";
import { AttackCounter } from "@/features/session/TurnControls";
import InlineSpellAttackSection from "@/features/session/InlineSpellAttackSection";
import WeaponAttackList from "@/features/session/WeaponAttackList";
import type { TurnState, TurnStateActions } from "@/features/session/useTurnState";
import type { Character } from "@/types/character";

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

  const weaponEntries = buildEquippedWeaponEntries(character);

  // The weapon the Damage card rolls for — last weapon rolled/selected, default first.
  const [activeWeaponId, setActiveWeaponId] = useState<string | null>(null);
  const activeEntry =
    weaponEntries.find((e) => e.id === activeWeaponId) ?? weaponEntries[0] ?? null;

  const showManeuvers = hasSuperiorityDice(character);
  const attacksExhausted = computeAttacksExhausted(turnState.attack);
  const preRoll = turnState.attack !== null && turnState.attack.used === 0;

  return (
    <div className="flex flex-col gap-2">
      {/* Live Extra-Attack counter — pips + "N of M remaining". Hidden at total 1
          (the kicker's "1 attack" is enough). */}
      {turnState.attack !== null && turnState.attack.total > 1 && (
        <AttackCounter total={turnState.attack.total} used={turnState.attack.used} label="Attacks" />
      )}

      <WeaponAttackList
        weaponEntries={weaponEntries}
        activeEntry={activeEntry}
        onSelectWeapon={setActiveWeaponId}
        attacksExhausted={attacksExhausted}
        viewFor={viewFor}
        riderTotals={riderTotals}
        showManeuvers={showManeuvers}
        character={character}
        onUpdate={onUpdate}
      />

      <BasicAttackRows
        character={character}
        viewFor={viewFor}
        attacksExhausted={attacksExhausted}
        showManeuvers={showManeuvers}
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
