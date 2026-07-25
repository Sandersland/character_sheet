/**
 * useManeuverActions — the superiority-die spend handlers behind TurnHub's
 * reaction (Parry/Riposte) and effect (Evasive Footwork/Rally) maneuver
 * slots, split out of useTurnActions so composing useManeuverDie (plus its
 * own error slot) doesn't count against that hub's own hook-count/complexity
 * budget (mirrors ProficienciesCard's useToolProficiencyMutations,
 * useTurnActions' own useTurnActionMutations).
 */

import { useState } from "react";

import { useManeuverDie } from "@/features/session/useManeuverDie";
import type { Character } from "@/types/character";

export function useManeuverActions(
  character: Character,
  onUpdate: (c: Character) => void,
  {
    consumeReaction,
    closeReactionMenu,
    setReactionMessage,
    setEffectMessage,
  }: {
    consumeReaction: () => void;
    closeReactionMenu: () => void;
    setReactionMessage: (message: string) => void;
    setEffectMessage: (message: string) => void;
  },
) {
  const { pool: superiorityPool, dieLabel, busy: dieBusy, spend: spendDie } = useManeuverDie(character, onUpdate);
  const [maneuverError, setManeuverError] = useState<string | null>(null);
  const superiorityRemaining = superiorityPool?.remaining ?? 0;

  function resetManeuverError() {
    setManeuverError(null);
  }

  async function handleReactionManeuver(entryId: string, maneuverName: string) {
    if (dieBusy || superiorityRemaining === 0) return;
    setManeuverError(null);
    try {
      const dieResult = await spendDie(entryId);
      consumeReaction();
      closeReactionMenu();
      if (maneuverName === "Parry") {
        setReactionMessage(
          `Parry — reduce incoming damage by ${dieResult} + DEX modifier (${dieLabel} rolled ${dieResult}).`,
        );
      } else if (maneuverName === "Riposte") {
        setReactionMessage(
          `Riposte — make one melee attack against the creature; add +${dieResult} to the damage roll (${dieLabel} rolled ${dieResult}).`,
        );
      } else {
        setReactionMessage(`${maneuverName} — tell your DM: rolled ${dieResult} on ${dieLabel}.`);
      }
    } catch (e) {
      setManeuverError(e instanceof Error ? e.message : `${maneuverName} failed.`);
    }
  }

  async function handleEffectManeuver(entryId: string, maneuverName: string) {
    if (dieBusy || superiorityRemaining === 0) return;
    setManeuverError(null);
    try {
      const dieResult = await spendDie(entryId);
      if (maneuverName === "Evasive Footwork") {
        setEffectMessage(
          `Evasive Footwork — add +${dieResult} to your AC until the end of your turn (${dieLabel} rolled ${dieResult}).`,
        );
      } else if (maneuverName === "Rally") {
        setEffectMessage(`Rally — gained temporary HP (${dieLabel} rolled ${dieResult} + your CHA modifier).`);
      } else {
        setEffectMessage(`${maneuverName} — tell your DM: rolled ${dieResult} on ${dieLabel}.`);
      }
    } catch (e) {
      setManeuverError(e instanceof Error ? e.message : `${maneuverName} failed.`);
    }
  }

  return {
    dieLabel,
    dieBusy,
    superiorityRemaining,
    maneuverError,
    resetManeuverError,
    handleReactionManeuver,
    handleEffectManeuver,
  };
}
