/**
 * Ephemeral turn-state hook for the action-economy tracker.
 *
 * All state is LOCAL — nothing here is persisted to the server. The *effects*
 * of actions (spending resources, applying HP heals, decrementing inventory)
 * flow through the existing transaction endpoints and land in the audit log.
 * Only the economy bookkeeping (have I used my action? how many attacks remain?)
 * lives here.
 *
 * The state is persisted to localStorage (keyed by sessionId) so it survives
 * page refreshes and brief disconnects. It is cleared on session end.
 *
 * Combat gating:
 *   - `inCombat` must be true before `startTurn()` can be called (the UI gates
 *     the Start Turn button). This is enforced by the caller in TurnHub.
 *   - `round` starts at 1 when combat begins; it increments when a turn ends.
 *
 * Reaction lifecycle note (5e rules):
 *   - A reaction is consumed DURING another creature's turn (opportunity attack,
 *     Shield spell, etc.) or sometimes on your own turn (readied action).
 *   - It RESETS at the START of YOUR turn.
 *   - `startTurn()` resets action + bonus action + reaction.
 *   - `consumeReaction()` can be called at any time (during your turn or between turns).
 */

import { useState, useCallback, useEffect } from "react";
import { deriveAttacksPerAction, canTwoWeaponFight } from "@/lib/turnRules";
import { loadTurnState, saveTurnState } from "@/features/session/turnStatePersistence";
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

/** Which kind of spell was cast from a given slot this turn — for 5e bonus-action restriction. */
export type SpellCastKind = "cantrip" | "leveled";

export interface TurnState {
  /** Whether the character is currently in a combat encounter. Gates turn-taking. */
  inCombat: boolean;
  /** Current combat round (1-indexed). 0 when not in combat. */
  round: number;
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
  /**
   * Tracks what was cast from each slot this turn (set when InlineSpellPicker
   * commits a cast). Used to enforce the 5e bonus-action spell restriction:
   * casting a leveled spell as a bonus action → only cantrips allowed as
   * actions; casting a leveled spell as an action → no bonus-action spells.
   */
  spellCastThisTurn: { action?: SpellCastKind; bonus?: SpellCastKind };
}

export interface TurnStateActions {
  /** Enter combat: sets inCombat=true, round=1, resets turn economy. */
  startCombat: () => void;
  /** Exit combat: resets all state to idle/out-of-combat. */
  endCombat: () => void;
  /** Begin the turn — resets action+bonus+reaction, derives TWF from loadout. */
  startTurn: () => void;
  /**
   * End the turn — returns to idle within combat and increments the round
   * counter. If not in combat, resets to full initialState.
   */
  endTurn: () => void;
  /** Consume one action without entering Attack mode (Dodge, Cast a Spell, etc.). */
  consumeAction: () => void;
  /** Enter Attack mode: consume one action and open the Extra Attack counter. */
  enterAttackMode: () => void;
  /** Record one attack roll during Attack mode (auto-decrements counter). */
  recordAttack: () => void;
  /**
   * Cancel the Attack action if no attacks have been rolled yet — refunds the
   * action so the player can choose a different action.
   */
  cancelAttack: () => void;
  /**
   * Finalize the Attack action after at least one attack was rolled — clears
   * the attack counter (marking the action as fully spent) without refunding.
   */
  finishAttack: () => void;
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
  /**
   * Commit the action slot for a spell cast (consumes the action and records the
   * spell kind for the 5e bonus-action restriction). Call on successful cast.
   */
  commitActionSpell: (spellLevel: number) => void;
  /**
   * Commit the bonus-action slot for a spell cast. Call on successful cast.
   */
  commitBonusActionSpell: (spellLevel: number) => void;
  /**
   * Commit the reaction slot for a spell cast. Call on successful cast.
   */
  commitReactionSpell: () => void;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

function initialState(): TurnState {
  return {
    inCombat: false,
    round: 0,
    phase: "idle",
    actionsRemaining: 0,
    bonusActionUsed: false,
    reactionUsed: false,
    attack: null,
    bonusAttack: null,
    twfAvailable: false,
    spellCastThisTurn: {},
  };
}

export function useTurnState(character: Character, sessionId: string): TurnState & TurnStateActions {
  const [state, setState] = useState<TurnState>(() => {
    // Lazily hydrate from localStorage on first mount.
    return loadTurnState(sessionId) ?? initialState();
  });

  const attacksPerAction = deriveAttacksPerAction(
    character.class,
    character.subclass,
    character.level,
  );

  // Persist state to localStorage whenever it changes.
  useEffect(() => {
    saveTurnState(sessionId, state);
  }, [sessionId, state]);

  const startCombat = useCallback(() => {
    setState({
      inCombat: true,
      round: 1,
      phase: "idle",
      actionsRemaining: 0,
      bonusActionUsed: false,
      reactionUsed: false,
      attack: null,
      bonusAttack: null,
      twfAvailable: false,
      spellCastThisTurn: {},
    });
  }, []);

  const endCombat = useCallback(() => {
    setState(initialState());
  }, []);

  const startTurn = useCallback(() => {
    setState((s) => ({
      ...s,
      phase: "active",
      actionsRemaining: 1,
      bonusActionUsed: false,
      reactionUsed: false, // reaction resets at start of YOUR turn
      attack: null,
      bonusAttack: null,
      twfAvailable: canTwoWeaponFight(character.inventory),
      spellCastThisTurn: {},
    }));
  }, [character.inventory]);

  const endTurn = useCallback(() => {
    setState((s) => {
      if (s.inCombat) {
        // Stay in combat — return to idle within the same encounter,
        // advancing the round counter. The round log event is fired by TurnHub.
        return {
          ...s,
          phase: "idle",
          actionsRemaining: 0,
          bonusActionUsed: false,
          attack: null,
          bonusAttack: null,
          spellCastThisTurn: {},
          round: s.round + 1,
        };
      }
      // Out-of-combat (shouldn't normally happen now, but safe fallback).
      return initialState();
    });
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
      // Clamp at total — keep attack non-null so the picker stays open for damage rolls.
      // The picker is closed explicitly by the player via the "Done" button.
      const used = Math.min(s.attack.used + 1, s.attack.total);
      return { ...s, attack: { ...s.attack, used } };
    });
  }, []);

  const cancelAttack = useCallback(() => {
    // Only refund if no attacks have been rolled yet — once rolled, the action
    // is committed per 5e rules.
    setState((s) => {
      if (!s.attack || s.attack.used > 0) return s;
      return { ...s, actionsRemaining: s.actionsRemaining + 1, attack: null };
    });
  }, []);

  const finishAttack = useCallback(() => {
    // Clear the attack counter (action stays spent). No-op when attack is null
    // (class pickers like Flurry that don't use the enterAttackMode path).
    setState((s) => {
      if (!s.attack) return s;
      return { ...s, attack: null };
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

  const commitActionSpell = useCallback((spellLevel: number) => {
    const kind: SpellCastKind = spellLevel === 0 ? "cantrip" : "leveled";
    setState((s) => ({
      ...s,
      actionsRemaining: Math.max(0, s.actionsRemaining - 1),
      attack: null,
      spellCastThisTurn: { ...s.spellCastThisTurn, action: kind },
    }));
  }, []);

  const commitBonusActionSpell = useCallback((spellLevel: number) => {
    const kind: SpellCastKind = spellLevel === 0 ? "cantrip" : "leveled";
    setState((s) => ({
      ...s,
      bonusActionUsed: true,
      bonusAttack: null,
      spellCastThisTurn: { ...s.spellCastThisTurn, bonus: kind },
    }));
  }, []);

  const commitReactionSpell = useCallback(() => {
    setState((s) => ({ ...s, reactionUsed: true }));
  }, []);

  return {
    ...state,
    startCombat,
    endCombat,
    startTurn,
    endTurn,
    consumeAction,
    enterAttackMode,
    recordAttack,
    cancelAttack,
    finishAttack,
    consumeBonusAction,
    enterTwfMode,
    recordTwfAttack,
    consumeReaction,
    grantExtraAction,
    commitActionSpell,
    commitBonusActionSpell,
    commitReactionSpell,
  };
}
