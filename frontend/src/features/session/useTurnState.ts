/**
 * Ephemeral turn-state hook for the action-economy tracker.
 *
 * All state is LOCAL — nothing here is persisted to the server. The *effects*
 * of actions (spending resources, applying HP heals, decrementing inventory)
 * flow through the existing transaction endpoints and land in the audit log.
 * Only the economy bookkeeping (have I used my action? how many attacks remain?)
 * lives here.
 *
 * Reaction lifecycle note (5e rules):
 *   - A reaction is consumed DURING another creature's turn (opportunity attack,
 *     Shield spell, etc.) or sometimes on your own turn (readied action).
 *   - It RESETS at the START of YOUR turn.
 *   - `startTurn()` resets action + bonus action + reaction.
 *   - `consumeReaction()` can be called at any time (during your turn or between turns).
 */

import { useState, useCallback } from "react";
import { deriveAttacksPerAction, canTwoWeaponFight } from "@/lib/turnRules";
import type { Character } from "@/types/character";

// ── Types ─────────────────────────────────────────────────────────────────────

export type TurnPhase = "idle" | "active";

/** State of the Extra-Attack counter while the Attack action is in progress. */
export interface AttackState {
  /** Total attacks available (from deriveAttacksPerAction + possible extra from Action Surge). */
  total: number;
  /** How many attacks have been rolled so far this action. */
  used: number;
}

export interface TurnState {
  phase: TurnPhase;
  /** How many actions remain this turn (normally 1; +1 after Action Surge). */
  actionsRemaining: number;
  /** Bonus action available this turn. */
  bonusActionUsed: boolean;
  /** Reaction used (resets at start of YOUR turn via startTurn). */
  reactionUsed: boolean;
  /** Non-null while the current action is an Attack action. */
  attack: AttackState | null;
  /** Non-null while the bonus action is an off-hand TWF attack. */
  bonusAttack: AttackState | null;
  /** Whether TWF is available for the bonus action (gates the affordance). */
  twfAvailable: boolean;
}

export interface TurnStateActions {
  /** Begin the turn — resets action+bonus+reaction, derives TWF from loadout. */
  startTurn: () => void;
  /** End the turn — returns to idle. */
  endTurn: () => void;
  /** Consume one action without entering Attack mode (Dodge, Cast a Spell, etc.). */
  consumeAction: () => void;
  /** Enter Attack mode: consume one action and open the Extra Attack counter. */
  enterAttackMode: () => void;
  /** Record one attack roll during Attack mode (auto-decrements counter). */
  recordAttack: () => void;
  /** Consume the bonus action slot without entering TWF mode. */
  consumeBonusAction: () => void;
  /** Enter TWF bonus-attack mode: consume the bonus action and open the TWF counter. */
  enterTwfMode: () => void;
  /** Record one TWF off-hand attack roll. */
  recordTwfAttack: () => void;
  /** Mark the reaction as used. Can be called at any time. */
  consumeReaction: () => void;
  /**
   * Grant an extra action (Action Surge). The resource spend itself is handled
   * by the caller (via applyResourceTransactions); this just bumps the UI counter.
   */
  grantExtraAction: () => void;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

function initialState(): TurnState {
  return {
    phase: "idle",
    actionsRemaining: 0,
    bonusActionUsed: false,
    reactionUsed: false,
    attack: null,
    bonusAttack: null,
    twfAvailable: false,
  };
}

export function useTurnState(character: Character): TurnState & TurnStateActions {
  const [state, setState] = useState<TurnState>(initialState);

  const attacksPerAction = deriveAttacksPerAction(
    character.class,
    character.subclass,
    character.level,
  );

  const startTurn = useCallback(() => {
    setState({
      phase: "active",
      actionsRemaining: 1,
      bonusActionUsed: false,
      reactionUsed: false, // reaction resets at start of YOUR turn
      attack: null,
      bonusAttack: null,
      twfAvailable: canTwoWeaponFight(character.inventory),
    });
  }, [character.inventory]);

  const endTurn = useCallback(() => {
    setState(initialState());
  }, []);

  const consumeAction = useCallback(() => {
    setState((s) => {
      if (s.actionsRemaining <= 0) return s;
      return { ...s, actionsRemaining: s.actionsRemaining - 1, attack: null };
    });
  }, []);

  const enterAttackMode = useCallback(() => {
    setState((s) => {
      if (s.actionsRemaining <= 0) return s;
      return {
        ...s,
        actionsRemaining: s.actionsRemaining - 1,
        attack: { total: attacksPerAction, used: 0 },
      };
    });
  }, [attacksPerAction]);

  const recordAttack = useCallback(() => {
    setState((s) => {
      if (!s.attack) return s;
      const used = s.attack.used + 1;
      // When all attacks are used, close attack mode automatically.
      const attack: AttackState | null =
        used >= s.attack.total ? null : { ...s.attack, used };
      return { ...s, attack };
    });
  }, []);

  const consumeBonusAction = useCallback(() => {
    setState((s) => ({ ...s, bonusActionUsed: true, bonusAttack: null }));
  }, []);

  const enterTwfMode = useCallback(() => {
    setState((s) => {
      if (s.bonusActionUsed) return s;
      // TWF off-hand is always exactly 1 attack.
      return { ...s, bonusActionUsed: true, bonusAttack: { total: 1, used: 0 } };
    });
  }, []);

  const recordTwfAttack = useCallback(() => {
    setState((s) => {
      if (!s.bonusAttack) return s;
      return { ...s, bonusAttack: null }; // only 1 off-hand attack in TWF
    });
  }, []);

  const consumeReaction = useCallback(() => {
    setState((s) => ({ ...s, reactionUsed: true }));
  }, []);

  const grantExtraAction = useCallback(() => {
    setState((s) => ({ ...s, actionsRemaining: s.actionsRemaining + 1 }));
  }, []);

  return {
    ...state,
    startTurn,
    endTurn,
    consumeAction,
    enterAttackMode,
    recordAttack,
    consumeBonusAction,
    enterTwfMode,
    recordTwfAttack,
    consumeReaction,
    grantExtraAction,
  };
}
