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
import { autoVerdict } from "@/lib/attackTallySummary";
import { loadTurnState, saveTurnState } from "@/features/session/turnStatePersistence";
import type { AttackTallyRow, TallyAttackRoll, TallyVerdict } from "@/lib/attackTallySummary";
import type { Character } from "@/types/character";

export type { AttackTallyRow, TallyAttackRoll } from "@/lib/attackTallySummary";

/** Payload recordAttack appends to the tally: the form plus its kept-d20 snapshot. */
export interface RecordedAttack {
  formId: string;
  formName: string;
  attack: TallyAttackRoll;
}

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
  /**
   * Per-attack tally for the CURRENT Attack action (#802). One row per rolled
   * attack; survives sheet close/reopen (Resume). Cleared by endTurn and on
   * entering a NEW Attack action. Snapshotted for undo alongside the economy.
   */
  attackTally: AttackTallyRow[];
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
  history: HistoryEntry[];
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
  | "spellCastThisTurn"
  | "attackTally"
>;

/**
 * An undo-stack entry: the pre-mutation economy snapshot plus, for a server-effect
 * action (Second Wind, Rage, …), the audit batchId to revert on undo (#758). A
 * local-only entry (Dodge, Dash, attack-mode) has no batchId.
 */
export interface HistoryEntry extends EconomySnapshot {
  batchId?: string;
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
  /**
   * Record one attack roll during Attack mode (auto-increments counter). When a
   * `RecordedAttack` payload is passed, a tally row is appended (#802).
   */
  recordAttack: (recorded?: RecordedAttack) => void;
  /** Write/replace the damage slot on the most-recent tally row (#802). */
  setTallyDamage: (damage: number) => void;
  /** Fold an on-hit rider's total into the most-recent tally row's damage slot. */
  addTallyDamageRider: (amount: number) => void;
  /** Tap-cycle a manual row's verdict unset→Hit→Miss (auto rows are locked). */
  cycleTallyVerdict: (index: number) => void;
  /** Clear the attack tally (DM banner dismiss / new action). */
  clearAttackTally: () => void;
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
   * Return the action spent on a mid-turn loadout swap (#733, Decision #2) — the
   * caller re-issues the inverse inventory ops at its surface. Mechanically a
   * +1 to actionsRemaining, so it shares grantExtraAction's implementation.
   */
  refundAction: () => void;
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
   * Tag the most-recent history entry with the audit batchId of the server effect
   * a server-effect action just wrote (#758) — so a later `undo()` can revert that
   * batch server-side. No-op when the history is empty.
   */
  attachBatchId: (batchId: string) => void;
  /**
   * Undo the last consuming economy mutation this turn (#730) — pops the history
   * stack and restores the prior economy snapshot. No-op when the stack is empty.
   * LOCAL only: it does not reverse server-committed effects. A server-effect
   * entry's batch is reverted by the useTurnActions `handleUndo` wrapper (#758)
   * BEFORE this pop; other server effects (a loadout swap) refund at their surface.
   */
  undo: () => void;
}

/**
 * The full value returned by useTurnState: the persisted economy state, the
 * action callbacks, plus `twfAvailable` — DERIVED from the live loadout (not
 * persisted), so a mid-turn weapon swap updates the off-hand affordance
 * immediately (#733). Components read this; the persisted slice is `TurnState`.
 */
export type TurnStateView = TurnState &
  TurnStateActions & {
    /** Whether TWF is available for the bonus action (gates the affordance). */
    twfAvailable: boolean;
  };

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
    attackTally: [],
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
    spellCastThisTurn: s.spellCastThisTurn,
    attackTally: s.attackTally,
  };
}

/**
 * Backfill a hydrated snapshot to the current schema (#750 reconciler pattern):
 * merge over defaults for a missing top-level field, and backfill `attackTally`
 * into every undo entry so a pre-#802 snapshot's `undo()` doesn't restore
 * `undefined` over the tally.
 */
function hydrateTurnState(loaded: TurnState): TurnState {
  const base = { ...initialState(), ...loaded };
  return {
    ...base,
    attackTally: base.attackTally ?? [],
    history: (base.history ?? []).map((h) => ({ ...h, attackTally: h.attackTally ?? [] })),
  };
}

// ── Pure state transitions ────────────────────────────────────────────────────
// Module-scope, one per economy mutation. A `return s` no-op means `mutate`
// pushes nothing onto the undo stack (guards stay history-free).

const consumeActionState = (s: TurnState): TurnState =>
  s.actionsRemaining <= 0 ? s : { ...s, actionsRemaining: s.actionsRemaining - 1, attack: null };

function enterAttackModeState(s: TurnState, attacksPerAction: number): TurnState {
  if (s.actionsRemaining <= 0) return s;
  // A NEW Attack action clears the previous action's tally (#802).
  return {
    ...s,
    actionsRemaining: s.actionsRemaining - 1,
    attack: { total: attacksPerAction, used: 0 },
    attackTally: [],
  };
}

function recordAttackState(s: TurnState, recorded?: RecordedAttack): TurnState {
  if (!s.attack) return s;
  // Clamp at total — keep attack non-null so the picker stays open for damage rolls.
  // The picker is closed explicitly by the player via the "Done" button.
  const atCap = s.attack.used >= s.attack.total;
  const used = Math.min(s.attack.used + 1, s.attack.total);
  // Append a tally row only for a genuinely new attack (not a clamped over-click).
  const attackTally =
    !atCap && recorded
      ? [...s.attackTally, tallyRowFor(recorded)]
      : s.attackTally;
  return { ...s, attack: { ...s.attack, used }, attackedThisTurn: true, attackTally };
}

function tallyRowFor(recorded: RecordedAttack): AttackTallyRow {
  const verdict = autoVerdict(recorded.attack);
  return {
    formId: recorded.formId,
    formName: recorded.formName,
    attack: recorded.attack,
    ...(verdict ? { verdict } : {}),
  };
}

// Write/replace the damage slot on the most-recent tally row — never appends, so
// re-rolling attack N's damage replaces N's number rather than double-counting (#802).
function setTallyDamageState(s: TurnState, damage: number): TurnState {
  if (s.attackTally.length === 0) return s;
  const attackTally = s.attackTally.slice();
  const i = attackTally.length - 1;
  attackTally[i] = { ...attackTally[i], damage };
  return { ...s, attackTally };
}

// Fold a rider total into the current row's damage slot (breakdown add).
function addTallyDamageRiderState(s: TurnState, amount: number): TurnState {
  if (s.attackTally.length === 0) return s;
  const attackTally = s.attackTally.slice();
  const i = attackTally.length - 1;
  attackTally[i] = { ...attackTally[i], damage: (attackTally[i].damage ?? 0) + amount };
  return { ...s, attackTally };
}

// Cycle a manual row's verdict unset→Hit→Miss→unset. Auto (nat 20 / nat 1) rows
// are locked and never cycle.
const VERDICT_CYCLE: Record<"none" | TallyVerdict, TallyVerdict | undefined> = {
  none: "hit",
  hit: "miss",
  miss: undefined,
  crit: undefined,
};

function cycleTallyVerdictState(s: TurnState, index: number): TurnState {
  const row = s.attackTally[index];
  if (!row || row.attack.nat20 || row.attack.nat1) return s;
  const next = VERDICT_CYCLE[row.verdict ?? "none"];
  const attackTally = s.attackTally.slice();
  const updated = { ...row };
  if (next === undefined) delete updated.verdict;
  else updated.verdict = next;
  attackTally[index] = updated;
  return { ...s, attackTally };
}

const clearAttackTallyState = (s: TurnState): TurnState =>
  s.attackTally.length === 0 ? s : { ...s, attackTally: [] };

function cancelAttackState(s: TurnState): TurnState {
  // Only refund if no attacks have been rolled yet — once rolled, the action
  // is committed per 5e rules.
  if (!s.attack || s.attack.used > 0) return s;
  return { ...s, actionsRemaining: s.actionsRemaining + 1, attack: null, attackTally: [] };
}

// Clear the attack counter (action stays spent). No-op when attack is null
// (class pickers like Flurry that don't use the enterAttackMode path).
const finishAttackState = (s: TurnState): TurnState => (s.attack ? { ...s, attack: null } : s);

const consumeBonusActionState = (s: TurnState): TurnState =>
  s.bonusActionUsed ? s : { ...s, bonusActionUsed: true, bonusAttack: null };

// TWF off-hand is always exactly 1 attack.
const enterTwfModeState = (s: TurnState): TurnState =>
  s.bonusActionUsed ? s : { ...s, bonusActionUsed: true, bonusAttack: { total: 1, used: 0 } };

const recordTwfAttackState = (s: TurnState): TurnState =>
  s.bonusAttack ? { ...s, bonusAttack: null, attackedThisTurn: true } : s;

// Mirror cancelAttack for the off-hand: refund the bonus action only if the
// off-hand attack hasn't been rolled yet (bonusAttack still pending). Once
// recordTwfAttack has cleared it to null, the bonus action stays committed.
const cancelTwfState = (s: TurnState): TurnState =>
  s.bonusAttack ? { ...s, bonusActionUsed: false, bonusAttack: null } : s;

const consumeReactionState = (s: TurnState): TurnState =>
  s.reactionUsed ? s : { ...s, reactionUsed: true };

function attachBatchIdState(s: TurnState, batchId: string): TurnState {
  if (s.history.length === 0) return s;
  const history = s.history.slice();
  history[history.length - 1] = { ...history[history.length - 1], batchId };
  return { ...s, history };
}

function undoState(s: TurnState): TurnState {
  const prev = s.history[s.history.length - 1];
  if (!prev) return s;
  // Restore the prior economy snapshot; leave lifecycle + the activity flags
  // (attackedThisTurn/tookDamageThisTurn) as they are (see EconomySnapshot).
  // Drop batchId so it never leaks onto the live state (#758).
  const economy = { ...prev };
  delete economy.batchId;
  return { ...s, ...economy, history: s.history.slice(0, -1) };
}

function endTurnState(s: TurnState): TurnState {
  // Out-of-combat (shouldn't normally happen now, but safe fallback).
  if (!s.inCombat) return initialState();
  // Stay in combat — return to idle within the same encounter, advancing the
  // round counter. The round log event is fired by TurnHub. Reset the activity
  // window HERE (not in startTurn): handleEndTurn has already evaluated the
  // durable-buff auto-end against these flags, so clearing them now opens a
  // fresh window that still captures damage/attacks taken before the next
  // startTurn (out-of-turn / enemy turns).
  return {
    ...s,
    phase: "idle",
    actionsRemaining: 0,
    bonusActionUsed: false,
    attack: null,
    bonusAttack: null,
    attackTally: [],
    spellCastThisTurn: {},
    round: s.round + 1,
    attackedThisTurn: false,
    tookDamageThisTurn: false,
    history: [],
  };
}

// The cognitive score here counts the hook's ~24 delegating useCallback closures,
// one per TurnStateActions member — all real branching lives in the module-level
// pure transition functions above (each individually under the ceilings).
// fallow-ignore-next-line complexity
export function useTurnState(character: Character, sessionId: string): TurnStateView {
  const [state, setState] = useState<TurnState>(() => {
    // Lazily hydrate; merge over defaults so a stale-schema snapshot missing a
    // newer field (e.g. history, pre-#730) backfills its current default (#750).
    const loaded = loadTurnState(sessionId);
    return loaded ? hydrateTurnState(loaded) : initialState();
  });

  // Derived (not persisted): TWF eligibility follows the LIVE loadout, so a
  // mid-turn weapon swap updates the off-hand affordance immediately (#733).
  const twfAvailable = canTwoWeaponFight(character.inventory, character.resources?.fightingStyle);

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
      attackTally: [],
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
      attackTally: [],
      spellCastThisTurn: {},
      history: [], // undo never reaches across turns
    }));
  }, [currentHp]);

  const endTurn = useCallback(() => {
    setState(endTurnState);
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
    mutate(consumeActionState);
  }, [mutate]);

  const enterAttackMode = useCallback(() => {
    mutate((s) => enterAttackModeState(s, attacksPerAction));
  }, [attacksPerAction, mutate]);

  const recordAttack = useCallback((recorded?: RecordedAttack) => {
    mutate((s) => recordAttackState(s, recorded));
  }, [mutate]);

  // Damage/verdict refinements are NOT undoable on their own — undoing the parent
  // recordAttack drops the whole row (tally is in the economy snapshot), so these
  // write directly rather than through `mutate`.
  const setTallyDamage = useCallback((damage: number) => {
    setState((s) => setTallyDamageState(s, damage));
  }, []);

  const addTallyDamageRider = useCallback((amount: number) => {
    setState((s) => addTallyDamageRiderState(s, amount));
  }, []);

  const cycleTallyVerdict = useCallback((index: number) => {
    setState((s) => cycleTallyVerdictState(s, index));
  }, []);

  const clearAttackTally = useCallback(() => {
    setState(clearAttackTallyState);
  }, []);

  const cancelAttack = useCallback(() => {
    mutate(cancelAttackState);
  }, [mutate]);

  const finishAttack = useCallback(() => {
    mutate(finishAttackState);
  }, [mutate]);

  const consumeBonusAction = useCallback(() => {
    mutate(consumeBonusActionState);
  }, [mutate]);

  const enterTwfMode = useCallback(() => {
    mutate(enterTwfModeState);
  }, [mutate]);

  const recordTwfAttack = useCallback(() => {
    mutate(recordTwfAttackState);
  }, [mutate]);

  const cancelTwf = useCallback(() => {
    mutate(cancelTwfState);
  }, [mutate]);

  const consumeReaction = useCallback(() => {
    mutate(consumeReactionState);
  }, [mutate]);

  const grantExtraAction = useCallback(() => {
    mutate((s) => ({ ...s, actionsRemaining: s.actionsRemaining + 1 }));
  }, [mutate]);

  // Refunding a mid-turn loadout swap returns the spent action (#733); the +1 is
  // identical to granting an extra action, so alias it rather than duplicate.
  // Note: like grantExtraAction it goes through `mutate`, so the +1 is pushed onto
  // the undo history — a subsequent `undo()` can revert it while the server
  // inventory stays swapped-back (undo is local-only, per its doc). Acceptable:
  // only the rare swap→refund→undo sequence diverges, and the loadout Refund is
  // the intended reversal surface, not undo.
  const refundAction = grantExtraAction;

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

  // Committing a reaction-slot spell spends the reaction exactly like any other
  // reaction — identical to consumeReaction, so alias it rather than duplicate
  // the guarded mutation.
  const commitReactionSpell = consumeReaction;

  // Tag the top history entry with the server batchId (#758). The click that
  // consumed the slot pushed the entry synchronously, so the top entry is this
  // action's; `busy` gates a concurrent second consuming click while send is in flight.
  const attachBatchId = useCallback((batchId: string) => {
    setState((s) => attachBatchIdState(s, batchId));
  }, []);

  const undo = useCallback(() => {
    setState(undoState);
  }, []);

  return {
    ...state,
    twfAvailable,
    startCombat,
    endCombat,
    startTurn,
    endTurn,
    consumeAction,
    enterAttackMode,
    recordAttack,
    setTallyDamage,
    addTallyDamageRider,
    cycleTallyVerdict,
    clearAttackTally,
    cancelAttack,
    finishAttack,
    consumeBonusAction,
    enterTwfMode,
    recordTwfAttack,
    cancelTwf,
    consumeReaction,
    grantExtraAction,
    refundAction,
    commitActionSpell,
    commitBonusActionSpell,
    commitReactionSpell,
    attachBatchId,
    undo,
  };
}
