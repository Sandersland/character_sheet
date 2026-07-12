// "attackOption" maneuvers (Commander's Strike, etc.) in the attack sheet: each
// forfeits one of the Attack action's attacks, spends a superiority die, and
// leaves reminder text. Extracted from InlineAttackPicker so its spend branching
// is scored on its own (#778).

import { useState } from "react";

import AttackOptionRow from "@/features/session/AttackOptionRow";
import type { UseManeuverDieReturn } from "@/features/session/useManeuverDie";
import type { TurnState, TurnStateActions } from "@/features/session/useTurnState";
import type { Character, ManeuverEntry } from "@/types/character";

interface AttackOptionSectionProps {
  character: Character;
  turnState: TurnState & TurnStateActions;
  showManeuvers: boolean;
  attacksExhausted: boolean;
  die: UseManeuverDieReturn;
}

// Whether an attackOption row's "Use" button is enabled, and why not.
function attackOptionEnabled(
  m: ManeuverEntry,
  pool: { remaining: number } | null | undefined,
  exhausted: boolean,
  bonusActionUsed: boolean,
): { enabled: boolean; reason?: string } {
  if (!pool || pool.remaining === 0) {
    return { enabled: false, reason: "No superiority dice remaining." };
  }
  if (exhausted) {
    return { enabled: false, reason: "No attacks remaining to forfeit." };
  }
  if (m.actionSlot === "bonusAction" && bonusActionUsed) {
    return { enabled: false, reason: "Bonus action already used." };
  }
  return { enabled: true };
}

export default function AttackOptionSection({
  character,
  turnState,
  showManeuvers,
  attacksExhausted,
  die,
}: AttackOptionSectionProps) {
  const { pool, dieLabel, busy: dieBusy, spend } = die;
  const [messages, setMessages] = useState<Record<string, string>>({});

  const maneuvers =
    showManeuvers && turnState.attack !== null
      ? (character.resources?.maneuversKnown ?? []).filter(
          (m) => (m.placement ?? "damageRoll") === "attackOption",
        )
      : [];

  async function handleUse(m: ManeuverEntry) {
    if (dieBusy || attacksExhausted || !pool || pool.remaining === 0) return;
    const dieResult = await spend(m.id);
    if (m.actionSlot === "bonusAction" && !turnState.bonusActionUsed) {
      turnState.consumeBonusAction();
    } else if (m.actionSlot === "reaction" && !turnState.reactionUsed) {
      turnState.consumeReaction();
    }
    // Forfeit one of the Attack action's attacks.
    turnState.recordAttack();
    setMessages((prev) => ({
      ...prev,
      [m.name]: `${m.name} — tell an ally to use their reaction to make an attack, adding +${dieResult} (${dieLabel}) to the damage roll.`,
    }));
  }

  return (
    <>
      {maneuvers.map((m) => {
        const { enabled, reason } = attackOptionEnabled(m, pool, attacksExhausted, turnState.bonusActionUsed);
        return (
          <AttackOptionRow
            key={m.id}
            name={m.name}
            enabled={enabled}
            reason={reason}
            message={messages[m.name]}
            dieLabel={dieLabel}
            dieBusy={dieBusy}
            onUse={() => handleUse(m)}
          />
        );
      })}
    </>
  );
}
