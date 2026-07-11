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

import { useState, useCallback, useEffect, useRef } from "react";
import { canTwoWeaponFight } from "@/lib/turnRules";
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
  /** Made an attack this turn — feeds the durable-buff turn-hook (#457). */
  attackedThisTurn: boolean;
  /** Took damage this turn — feeds the durable-buff turn-hook (#457). */
  tookDamageThisTurn: boolean;
  /**
   * Turn-scoped undo stack (#730): a snapshot of the economy is pushed before
   * each consuming mutation and popped by `undo()`. Cleared on every turn/combat
   * boundary so undo never reaches across turns.
   */
  history: EconomySnapshot[];
}

/**
 * The turn-economy fields captured for undo. Deliberately EXCLUDES lifecycle
 * (`inCombat`/`round`/`phase`) and the activity flags (`attackedThisTurn`/
 * `tookDamageThisTurn`) — the latter are driven by `recordAttack` + the
 * server-HP watcher, so reverting them would either fight the watcher or wrongly
 * relax a durable-buff auto-end. Undo restores only what the player *spent*.
 */
export type EconomySnapshot = Pick<
  TurnState,
  | "actionsRemaining"
  | "bonusActionUsed"
  | "reactionUsed"
  | "attack"
  | "bonusAttack"
  | "twfAvailable"
  | "spellCastThisTurn"
>;

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
  /**
   * Cancel the off-hand attack if it hasn't been rolled yet — refunds the bonus
   * action so the player can choose a different bonus action. Mirrors cancelAttack.
   */
  cancelTwf: () => void;
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
  /**
   * Undo the last consuming economy mutation this turn (#730) — pops the history
   * stack and restores the prior economy snapshot. No-op when the stack is empty.
   * LOCAL only: it does not reverse server-committed effects (a die spent, HP
   * healed, a loadout swapped) — those carry an explicit refund at their surface.
   */
  undo: () => void;
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
    attackedThisTurn: false,
    tookDamageThisTurn: false,
    history: [],
  };
}

/** Snapshot the current economy fields for the undo stack (#730). */
function economyOf(s: TurnState): EconomySnapshot {
  return {
    actionsRemaining: s.actionsRemaining,
    bonusActionUsed: s.bonusActionUsed,
    reactionUsed: s.reactionUsed,
    attack: s.attack,
    bonusAttack: s.bonusAttack,
    twfAvailable: s.twfAvailable,
    spellCastThisTurn: s.spellCastThisTurn,
  };
}

export function useTurnState(character: Character, sessionId: string): TurnState & TurnStateActions {
  const [state, setState] = useState<TurnState>(() => {
    // Lazily hydrate from localStorage on first mount.
    return loadTurnState(sessionId) ?? initialState();
  });

  // Server-derived, multiclass-correct (max across classes); see srd.ts.
  const attacksPerAction = character.attacksPerAction;
  const currentHp = character.hitPoints?.current ?? 0;

  // Persist state to localStorage whenever it changes.
  useEffect(() => {
    saveTurnState(sessionId, state);
  }, [sessionId, state]);

  // Watch current HP: any drop marks damage taken (feeds the durable-buff
  // turn-hook). NOT gated by phase — so damage taken out of turn (opportunity
  // attacks, reactions during another creature's turn) counts too. The activity
  // window is bounded by the flag reset in `endTurn` (which runs AFTER the
  // auto-end evaluation), so damage between your turns survives into the next
  // turn's check — matching the 5e rule "took damage since your last turn".
  // Heals and non-HP updates are ignored.
  const prevHpRef = useRef(currentHp);
  useEffect(() => {
    if (currentHp < prevHpRef.current) {
      setState((s) => (s.tookDamageThisTurn ? s : { ...s, tookDamageThisTurn: true }));
    }
    prevHpRef.current = currentHp;
  }, [currentHp]);

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
      attackedThisTurn: false,
      tookDamageThisTurn: false,
      history: [],
    });
  }, []);

  const endCombat = useCallback(() => {
    setState(initialState());
  }, []);

  const startTurn = useCallback(() => {
    // Keep the HP-drop baseline current (the watcher also syncs it on every HP
    // change). Deliberately does NOT reset attackedThisTurn/tookDamageThisTurn —
    // those are cleared in endTurn so damage/attacks between your turns carry
    // into this turn's auto-end check.
    prevHpRef.current = currentHp;
    setState((s) => ({
      ...s,
      phase: "active",
      actionsRemaining: 1,
      bonusActionUsed: false,
      reactionUsed: false, // reaction resets at start of YOUR turn
      attack: null,
      bonusAttack: null,
      twfAvailable: canTwoWeaponFight(character.inventory, character.resources?.fightingStyle),
      spellCastThisTurn: {},
      history: [], // undo never reaches across turns
    }));
  }, [character.inventory, character.resources?.fightingStyle, currentHp]);

  const endTurn = useCallback(() => {
    setState((s) => {
      if (s.inCombat) {
        // Stay in combat — return to idle within the same encounter,
        // advancing the round counter. The round log event is fired by TurnHub.
        // Reset the activity window HERE (not in startTurn): handleEndTurn has
        // already evaluated the durable-buff auto-end against these flags, so
        // clearing them now opens a fresh window that still captures damage/
        // attacks taken before the next startTurn (out-of-turn / enemy turns).
        return {
          ...s,
          phase: "idle",
          actionsRemaining: 0,
          bonusActionUsed: false,
          attack: null,
          bonusAttack: null,
          spellCastThisTurn: {},
          round: s.round + 1,
          attackedThisTurn: false,
          tookDamageThisTurn: false,
          history: [],
        };
      }
      // Out-of-combat (shouldn't normally happen now, but safe fallback).
      return initialState();
    });
  }, []);

  // Wrap an economy mutation so a pre-mutation snapshot is pushed onto the undo
  // stack (#730) — but only when the mutation actually changes state, so no-op
  // guards (`return s`) push nothing.
  const mutate = useCallback((fn: (s: TurnState) => TurnState) => {
    setState((s) => {
      const next = fn(s);
      if (next === s) return s;
      return { ...next, history: [...s.history, economyOf(s)] };
    });
  }, []);

  const consumeAction = useCallback(() => {
    mutate((s) => {
      if (s.actionsRemaining <= 0) return s;
      return { ...s, actionsRemaining: s.actionsRemaining - 1, attack: null };
    });
  }, [mutate]);

  const enterAttackMode = useCallback(() => {
    mutate((s) => {
      if (s.actionsRemaining <= 0) return s;
      return {
        ...s,
        actionsRemaining: s.actionsRemaining - 1,
        attack: { total: attacksPerAction, used: 0 },
      };
    });
  }, [attacksPerAction, mutate]);

  const recordAttack = useCallback(() => {
    mutate((s) => {
      if (!s.attack) return s;
      // Clamp at total — keep attack non-null so the picker stays open for damage rolls.
      // The picker is closed explicitly by the player via the "Done" button.
      const used = Math.min(s.attack.used + 1, s.attack.total);
      return { ...s, attack: { ...s.attack, used }, attackedThisTurn: true };
    });
  }, [mutate]);

  const cancelAttack = useCallback(() => {
    // Only refund if no attacks have been rolled yet — once rolled, the action
    // is committed per 5e rules.
    mutate((s) => {
      if (!s.attack || s.attack.used > 0) return s;
      return { ...s, actionsRemaining: s.actionsRemaining + 1, attack: null };
    });
  }, [mutate]);

  const finishAttack = useCallback(() => {
    // Clear the attack counter (action stays spent). No-op when attack is null
    // (class pickers like Flurry that don't use the enterAttackMode path).
    mutate((s) => {
      if (!s.attack) return s;
      return { ...s, attack: null };
    });
  }, [mutate]);

  const consumeBonusAction = useCallback(() => {
    mutate((s) => {
      if (s.bonusActionUsed) return s; // guard: already used → no history push
      return { ...s, bonusActionUsed: true, bonusAttack: null };
    });
  }, [mutate]);

  const enterTwfMode = useCallback(() => {
    mutate((s) => {
      if (s.bonusActionUsed) return s;
      // TWF off-hand is always exactly 1 attack.
      return { ...s, bonusActionUsed: true, bonusAttack: { total: 1, used: 0 } };
    });
  }, [mutate]);

  const recordTwfAttack = useCallback(() => {
    mutate((s) => {
      if (!s.bonusAttack) return s;
      return { ...s, bonusAttack: null, attackedThisTurn: true }; // only 1 off-hand attack in TWF
    });
  }, [mutate]);

  const cancelTwf = useCallback(() => {
    // Mirror cancelAttack for the off-hand: refund the bonus action only if the
    // off-hand attack hasn't been rolled yet (bonusAttack still pending). Once
    // recordTwfAttack has cleared it to null, the bonus action stays committed.
    mutate((s) => {
      if (!s.bonusAttack) return s;
      return { ...s, bonusActionUsed: false, bonusAttack: null };
    });
  }, [mutate]);

  const consumeReaction = useCallback(() => {
    mutate((s) => {
      if (s.reactionUsed) return s; // guard: already used → no history push
      return { ...s, reactionUsed: true };
    });
  }, [mutate]);

  const grantExtraAction = useCallback(() => {
    mutate((s) => ({ ...s, actionsRemaining: s.actionsRemaining + 1 }));
  }, [mutate]);

  const commitActionSpell = useCallback((spellLevel: number) => {
    const kind: SpellCastKind = spellLevel === 0 ? "cantrip" : "leveled";
    mutate((s) => ({
      ...s,
      actionsRemaining: Math.max(0, s.actionsRemaining - 1),
      attack: null,
      spellCastThisTurn: { ...s.spellCastThisTurn, action: kind },
    }));
  }, [mutate]);

  const commitBonusActionSpell = useCallback((spellLevel: number) => {
    const kind: SpellCastKind = spellLevel === 0 ? "cantrip" : "leveled";
    mutate((s) => ({
      ...s,
      bonusActionUsed: true,
      bonusAttack: null,
      spellCastThisTurn: { ...s.spellCastThisTurn, bonus: kind },
    }));
  }, [mutate]);

  const commitReactionSpell = useCallback(() => {
    mutate((s) => {
      if (s.reactionUsed) return s; // guard: already used → no history push
      return { ...s, reactionUsed: true };
    });
  }, [mutate]);

  const undo = useCallback(() => {
    setState((s) => {
      const prev = s.history[s.history.length - 1];
      if (!prev) return s;
      // Restore the prior economy snapshot; leave lifecycle + the activity flags
      // (attackedThisTurn/tookDamageThisTurn) as they are (see EconomySnapshot).
      return { ...s, ...prev, history: s.history.slice(0, -1) };
    });
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
    cancelTwf,
    consumeReaction,
    grantExtraAction,
    commitActionSpell,
    commitBonusActionSpell,
    commitReactionSpell,
    undo,
  };
}
