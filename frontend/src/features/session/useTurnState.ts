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

import { useReducer, useMemo, useEffect, useRef } from "react";
import { canTwoWeaponFight } from "@/lib/turnRules";
import { hasFeatImprovement } from "@/lib/featDisplay";
import { autoVerdict } from "@/lib/attackTallySummary";
import { loadTurnState, saveTurnState } from "@/features/session/turnStatePersistence";
import type {
  AttackTallyRow,
  TallyAttackRoll,
  TallyRowSource,
  TallyVerdict,
} from "@/lib/attackTallySummary";
import type { InteractionSpend } from "@/lib/loadoutPicker";
import type { Character } from "@/types/character";

export type { AttackTallyRow, TallyAttackRoll } from "@/lib/attackTallySummary";

/** Payload recordAttack appends to the tally: the form plus its kept-d20 snapshot. */
export interface RecordedAttack {
  formId: string;
  formName: string;
  attack: TallyAttackRoll;
  /** Which economy slot recorded it (#813). Defaults to `action` when omitted. */
  source?: TallyRowSource;
}

let rowIdSeq = 0;
/** Monotonic per-load row id — collision-free within a session; rehydrated rows keep their stored id. */
function nextRowId(): string {
  rowIdSeq += 1;
  return `tally-${Date.now().toString(36)}-${rowIdSeq}`;
}

/** Payload useSpellPicker appends to the cast tally once a cast settles (#1164). */
export interface RecordedSpellCast {
  spellName: string;
  /** Slot level cast at (0 = cantrip). */
  level: number;
  /** Rolled damage/heal total; absent for a no-roll (buff/utility) cast. */
  total?: number;
  damageType?: string;
  /** Save DC / half-on-success line to read to the DM, when the cast forced a save. */
  announce?: string;
}

/** One row of the turn card's "Spells cast" tally (#1164) — a cast already
 *  resolved when it lands here, so unlike AttackTallyRow there's no verdict. */
export interface CastTallyRow extends RecordedSpellCast {
  id: string;
}

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
  /**
   * Non-null while the bonus action is a multi-swing attack resolution — the
   * TWF off-hand (always total 1) or Flurry of Blows (total 2, or 3 at
   * Heightened Focus monk L10, #1244). The two never coexist: both consume
   * the single bonus-action slot, so only one resolver is ever live.
   */
  bonusAttack: AttackState | null;
  /**
   * Per-attack tally for the CURRENT Attack action (#802). One row per rolled
   * attack; survives sheet close/reopen (Resume). Cleared by endTurn and on
   * entering a NEW Attack action. Snapshotted for undo alongside the economy.
   */
  attackTally: AttackTallyRow[];
  /**
   * Turn-card "Spells cast" tally (#1164): one row per settled cast this turn,
   * appended by useSpellPicker's `onCastSettled`. Cleared by endTurn/startTurn
   * and by the banner's dismiss, mirroring attackTally's lifecycle — but NOT
   * part of the undo snapshot: a cast already committed server-side, so `undo`
   * (which reverts only local economy spend) leaves its receipt in place.
   */
  castTally: CastTallyRow[];
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
  /** Sneak Attack applied this turn — enforces the rogue once-per-turn guard (#902). */
  sneakAttackUsedThisTurn: boolean;
  /** Stunning Strike attempted this turn — enforces the monk once-per-turn guard (#1242). */
  stunningStrikeUsedThisTurn: boolean;
  /** Open Hand Technique rider imposed this turn — enforces the monk once-per-turn guard (#1245). */
  openHandRiderUsedThisTurn: boolean;
  /**
   * Equip/unequip credits earned this turn — one per attack made with the
   * Attack action (PHB'24: "you can equip or unequip one weapon when you make
   * this attack as part of the Attack action"). Spent by a mid-turn loadout
   * swap (#1165); resets each turn.
   */
  attackEquipCredits: number;
  /**
   * Whether this turn's one free object interaction (SRD 5.2 "Interacting
   * with Things") has been spent on a loadout swap (#1165). Resets each turn.
   */
  freeInteractionUsed: boolean;
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
  | "attackEquipCredits"
  | "freeInteractionUsed"
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
  /** Write/replace the damage slot on tally row `rowId` (#802, by-id since #813). */
  setTallyDamage: (rowId: string, damage: number) => void;
  /** Write/replace the damage slot on row `index` — banner inline resolve (#811). */
  setTallyDamageAt: (index: number, damage: number) => void;
  /**
   * Override the to-hit total on tally row `rowId` after a Precision Attack die
   * is added (#809). Touches only `attack.total` — the kept-d20 face and
   * nat-20/nat-1 flags (which decide crit/miss) stay put.
   */
  setTallyAttackTotal: (rowId: string, total: number) => void;
  /** Fold an on-hit rider's total into tally row `rowId`'s damage slot. */
  addTallyDamageRider: (rowId: string, amount: number) => void;
  /** Set a row's verdict directly; nat-locked rows refuse (#811). */
  setTallyVerdict: (index: number, verdict: TallyVerdict | undefined) => void;
  /** Clear the attack tally (Turn-summary banner dismiss / new action). */
  clearAttackTally: () => void;
  /** Append a settled cast to the turn card's "Spells cast" tally (#1164). */
  recordSpellCast: (recorded: RecordedSpellCast) => void;
  /** Clear the cast tally (its banner's dismiss / new turn). */
  clearCastTally: () => void;
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
  /**
   * Record the TWF off-hand attack roll: spends the bonus attack and, when a
   * `RecordedAttack` payload is passed, appends a `bonusAction`-source tally
   * row so the swing lands in the turn-summary banner (#813).
   */
  recordTwfAttack: (recorded?: RecordedAttack) => void;
  /**
   * Cancel the off-hand attack if it hasn't been rolled yet — refunds the bonus
   * action so the player can choose a different bonus action. Mirrors cancelAttack.
   */
  cancelTwf: () => void;
  /**
   * Arm the `bonusAttack` strike counter for Flurry of Blows (#1217) — the bonus
   * action itself is already consumed by the generic action-click path (like
   * Rage), so this only opens the counter. `count` is the caller-supplied
   * strike total (2 today; the Heightened Focus seam, #1244, just passes a
   * different number). No-ops if a bonus-attack resolution is already live
   * (e.g. a rehydrated mid-flurry snapshot), so it never resets progress.
   */
  enterFlurryMode: (count: number) => void;
  /**
   * Record one Flurry of Blows strike (auto-increments the counter, clamped at
   * total). When a `RecordedAttack` payload is passed, appends a
   * `bonusAction`-source tally row — mirrors recordAttack's multi-attack loop,
   * not recordTwfAttack's single-swing shape, since Flurry resolves 2+ strikes.
   */
  recordFlurryAttack: (recorded?: RecordedAttack) => void;
  /** Cancel Flurry if no strikes have landed yet — refunds the bonus action. */
  cancelFlurry: () => void;
  /**
   * Finalize Flurry after at least one strike was rolled — clears the counter
   * (bonus action stays spent) without refunding. Mirrors finishAttack.
   */
  finishFlurry: () => void;
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
   * Pay `spend` from the interaction budget (#1165) — the caller (useLoadoutSwap)
   * computes it via loadoutPicker's planInteractionSpend before dispatching.
   */
  spendInteractionBudget: (spend: InteractionSpend) => void;
  /** Reverse a prior spendInteractionBudget — the loadout-swap Refund surface. */
  refundInteractionBudget: (spend: InteractionSpend) => void;
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
  /** Mark Sneak Attack applied this turn — enforces the once-per-turn guard (#902). */
  markSneakAttackUsed: () => void;
  /** Mark Stunning Strike attempted this turn — enforces the once-per-turn guard (#1242). */
  markStunningStrikeUsed: () => void;
  /** Mark Open Hand Technique's rider imposed this turn — enforces the once-per-turn guard (#1245). */
  markOpenHandRiderUsed: () => void;
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
    castTally: [],
    spellCastThisTurn: {},
    attackedThisTurn: false,
    tookDamageThisTurn: false,
    sneakAttackUsedThisTurn: false,
    stunningStrikeUsedThisTurn: false,
    openHandRiderUsedThisTurn: false,
    attackEquipCredits: 0,
    freeInteractionUsed: false,
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
    attackEquipCredits: s.attackEquipCredits,
    freeInteractionUsed: s.freeInteractionUsed,
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
    attackTally: backfillRows(base.attackTally),
    castTally: base.castTally ?? [],
    // Pre-#1165 entries lack the interaction-budget fields — default them so a
    // later undo() spread doesn't overwrite live state with `undefined`.
    history: (base.history ?? []).map((h) => ({
      ...h,
      attackTally: backfillRows(h.attackTally),
      attackEquipCredits: h.attackEquipCredits ?? 0,
      freeInteractionUsed: h.freeInteractionUsed ?? false,
    })),
  };
}

// Pre-#802/pre-#813 rows lack `id`/`source`: mint an id and default the source
// to `action` (the only kind before the off-hand adopted the tally) so hydrated
// snapshots resolve, target, and clear like freshly-recorded rows (#813).
function backfillRows(rows: AttackTallyRow[] | undefined): AttackTallyRow[] {
  return (rows ?? []).map((r) => ({ ...r, id: r.id ?? nextRowId(), source: r.source ?? "action" }));
}

// Pure state transitions: module-scope, one per economy mutation. A `return s`
// no-op means `mutate` pushes nothing onto the undo stack (guards stay history-free).

const consumeActionState = (s: TurnState): TurnState =>
  s.actionsRemaining <= 0 ? s : { ...s, actionsRemaining: s.actionsRemaining - 1, attack: null };

function enterAttackModeState(s: TurnState, attacksPerAction: number): TurnState {
  if (s.actionsRemaining <= 0) return s;
  // A NEW Attack action clears the previous action's rows only — a bonus-action
  // off-hand row from earlier this turn stays in the banner (#813).
  return {
    ...s,
    actionsRemaining: s.actionsRemaining - 1,
    attack: { total: attacksPerAction, used: 0 },
    attackTally: s.attackTally.filter((r) => r.source !== "action"),
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
      ? [...s.attackTally, tallyRowFor(recorded, "action")]
      : s.attackTally;
  // PHB'24 Attack action: one equip/unequip credit per genuine attack made
  // (#1165) — not earned on a clamped over-click, matching the tally guard.
  const attackEquipCredits = atCap ? s.attackEquipCredits : s.attackEquipCredits + 1;
  return { ...s, attack: { ...s.attack, used }, attackedThisTurn: true, attackTally, attackEquipCredits };
}

function tallyRowFor(recorded: RecordedAttack, fallbackSource: TallyRowSource): AttackTallyRow {
  const verdict = autoVerdict(recorded.attack);
  return {
    id: nextRowId(),
    source: recorded.source ?? fallbackSource,
    formId: recorded.formId,
    formName: recorded.formName,
    attack: recorded.attack,
    ...(verdict ? { verdict } : {}),
  };
}

// Rolling damage is an implicit hit call (#811): an unset verdict resolves to
// "hit" the moment damage lands on the row. Explicit verdicts (miss/crit/nat-
// locked) are never overwritten.
function withAutoHit(row: AttackTallyRow): AttackTallyRow {
  return row.verdict ? row : { ...row, verdict: "hit" };
}

// Shared shell for the "rewrite one tally row" writers: no-op when the row is
// out of range (empty tally / bad index), otherwise replace it immutably.
function updateTallyRow(
  s: TurnState,
  index: number,
  update: (row: AttackTallyRow) => AttackTallyRow,
): TurnState {
  const row = s.attackTally[index];
  if (!row) return s;
  const attackTally = s.attackTally.slice();
  attackTally[index] = update(row);
  return { ...s, attackTally };
}

// By-id sibling of updateTallyRow: targets a specific row so two interleaved
// sources (action + off-hand bonus action) never misattribute a damage/override
// write to "the last row" (#813). No-op when the id isn't present.
function updateTallyRowById(
  s: TurnState,
  rowId: string,
  update: (row: AttackTallyRow) => AttackTallyRow,
): TurnState {
  return updateTallyRow(s, s.attackTally.findIndex((r) => r.id === rowId), update);
}

// Write/replace the damage slot on tally row `rowId` — never appends, so
// re-rolling attack N's damage replaces N's number rather than double-counting (#802).
const setTallyDamageState = (s: TurnState, rowId: string, damage: number): TurnState =>
  updateTallyRowById(s, rowId, (row) => withAutoHit({ ...row, damage }));

// Write/replace the damage slot on an arbitrary row by index — the Turn-summary
// banner's inline resolve rolls damage for skipped rows after the action ended (#811).
const setTallyDamageAtState = (s: TurnState, index: number, damage: number): TurnState =>
  updateTallyRow(s, index, (row) => withAutoHit({ ...row, damage }));

// Override the to-hit total on row `rowId` after a superiority die is added
// (#809). Only `attack.total` changes — keptFace + nat flags stay so the verdict
// (crit/miss) reads the die face, never the boosted total.
const setTallyAttackTotalState = (s: TurnState, rowId: string, total: number): TurnState =>
  updateTallyRowById(s, rowId, (row) => ({
    ...row,
    attack: { ...row.attack, total },
  }));

// Fold a rider total into row `rowId`'s damage slot (breakdown add). A rider roll
// is a damage roll, so it also resolves an unset verdict to hit.
const addTallyDamageRiderState = (s: TurnState, rowId: string, amount: number): TurnState =>
  updateTallyRowById(s, rowId, (row) =>
    withAutoHit({ ...row, damage: (row.damage ?? 0) + amount }),
  );

// Set a row's verdict directly (#811 — replaces the old unset→Hit→Miss cycle).
// Nat-locked rows (nat 20 / nat 1) refuse: the die already decided. Switching
// to miss drops the row's damage — a missed attack dealt none.
function setTallyVerdictState(
  s: TurnState,
  index: number,
  verdict: TallyVerdict | undefined,
): TurnState {
  const target = s.attackTally[index];
  if (!target || target.attack.nat20 || target.attack.nat1) return s;
  return updateTallyRow(s, index, (row) => {
    const updated = { ...row };
    if (verdict === undefined) delete updated.verdict;
    else updated.verdict = verdict;
    if (verdict === "miss") delete updated.damage;
    return updated;
  });
}

// Banner dismissal (#812): clearing the tally must be durable — history
// snapshots also drop their tally rows so a later undo can't resurrect a
// dismissed banner with stale lines (the economy fields still restore).
const clearAttackTallyState = (s: TurnState): TurnState => {
  if (s.attackTally.length === 0 && s.history.every((h) => h.attackTally.length === 0)) return s;
  return {
    ...s,
    attackTally: [],
    history: s.history.map((h) => (h.attackTally.length === 0 ? h : { ...h, attackTally: [] })),
  };
};

// Append a settled cast to the turn card's tally (#1164) — write-through, never
// pushes an undo snapshot (a cast's economy spend already went through its own
// commitActionSpell/etc, which IS undoable; the tally row is just its receipt).
const recordSpellCastState = (s: TurnState, recorded: RecordedSpellCast): TurnState => ({
  ...s,
  castTally: [...s.castTally, { ...recorded, id: nextRowId() }],
});

const clearCastTallyState = (s: TurnState): TurnState =>
  s.castTally.length === 0 ? s : { ...s, castTally: [] };

function cancelAttackState(s: TurnState): TurnState {
  // Only refund if no attacks have been rolled yet — once rolled, the action
  // is committed per 5e rules. Drop only this action's rows so an earlier
  // off-hand (bonusAction) row survives the refund (#813).
  if (!s.attack || s.attack.used > 0) return s;
  return {
    ...s,
    actionsRemaining: s.actionsRemaining + 1,
    attack: null,
    attackTally: s.attackTally.filter((r) => r.source !== "action"),
  };
}

// Clear the attack counter (action stays spent). No-op when attack is null
// (a resolver that never called enterAttackMode, e.g. an opportunity attack).
const finishAttackState = (s: TurnState): TurnState => (s.attack ? { ...s, attack: null } : s);

const consumeBonusActionState = (s: TurnState): TurnState =>
  s.bonusActionUsed ? s : { ...s, bonusActionUsed: true, bonusAttack: null };

// TWF off-hand is always exactly 1 attack. Entering it clears any prior
// bonus-action row so the swing's own row is the only one this slot owns (#813).
const enterTwfModeState = (s: TurnState): TurnState =>
  s.bonusActionUsed
    ? s
    : {
        ...s,
        bonusActionUsed: true,
        bonusAttack: { total: 1, used: 0 },
        attackTally: s.attackTally.filter((r) => r.source !== "bonusAction"),
      };

// Spend the off-hand swing and append its bonusAction-source row (when recorded)
// so it lands in the turn-summary banner alongside the Attack-action rows (#813).
function recordTwfAttackState(s: TurnState, recorded?: RecordedAttack): TurnState {
  if (!s.bonusAttack) return s;
  const attackTally = recorded
    ? [...s.attackTally, tallyRowFor(recorded, "bonusAction")]
    : s.attackTally;
  return { ...s, bonusAttack: null, attackedThisTurn: true, attackTally };
}

// Mirror cancelAttack for the off-hand: refund the bonus action only if the
// off-hand attack hasn't been rolled yet (bonusAttack still pending). Once
// recordTwfAttack has cleared it to null, the bonus action stays committed.
const cancelTwfState = (s: TurnState): TurnState =>
  s.bonusAttack ? { ...s, bonusActionUsed: false, bonusAttack: null } : s;

// Arm Flurry's strike counter. Guarded on bonusAttack already being non-null
// (rather than on bonusActionUsed, unlike enterTwfModeState) because the bonus
// action slot was already consumed by the generic action-click path before
// this fires — the guard here only protects against re-arming over a
// rehydrated, in-progress flurry and resetting its used count.
function enterFlurryModeState(s: TurnState, count: number): TurnState {
  if (s.bonusAttack) return s;
  return {
    ...s,
    bonusAttack: { total: count, used: 0 },
    attackTally: s.attackTally.filter((r) => r.source !== "bonusAction"),
  };
}

// Increment-and-clamp, like recordAttackState — Flurry resolves 2+ strikes in
// one bonus action, unlike TWF's always-1 single swing, so it can't reuse
// recordTwfAttackState's unconditional null-out. Deliberately omits the
// Attack-action's attackEquipCredits grant (PHB'24 ties that credit to the
// Attack action specifically, not to Flurry).
function recordFlurryAttackState(s: TurnState, recorded?: RecordedAttack): TurnState {
  if (!s.bonusAttack) return s;
  const atCap = s.bonusAttack.used >= s.bonusAttack.total;
  const used = Math.min(s.bonusAttack.used + 1, s.bonusAttack.total);
  const attackTally =
    !atCap && recorded ? [...s.attackTally, tallyRowFor(recorded, "bonusAction")] : s.attackTally;
  return { ...s, bonusAttack: { ...s.bonusAttack, used }, attackedThisTurn: true, attackTally };
}

// Mirror cancelAttackState: refund the bonus action only if no strike has
// landed yet. Once a strike is recorded, the bonus action stays committed.
const cancelFlurryState = (s: TurnState): TurnState =>
  s.bonusAttack && s.bonusAttack.used === 0
    ? { ...s, bonusActionUsed: false, bonusAttack: null }
    : s;

// Mirror finishAttackState: clear the counter — the bonus action stays spent.
const finishFlurryState = (s: TurnState): TurnState =>
  s.bonusAttack ? { ...s, bonusAttack: null } : s;

const consumeReactionState = (s: TurnState): TurnState =>
  s.reactionUsed ? s : { ...s, reactionUsed: true };

// Interaction-budget spend/refund (#1165) — the caller (useLoadoutSwap) computes
// `spend` via loadoutPicker's planInteractionSpend and just tells the reducer
// how to book it; the reducer itself holds no rule knowledge.
const spendInteractionBudgetState = (s: TurnState, spend: InteractionSpend): TurnState => ({
  ...s,
  attackEquipCredits: s.attackEquipCredits - spend.fromAttackCredits,
  freeInteractionUsed: s.freeInteractionUsed || spend.usedFreeInteraction,
});

const refundInteractionBudgetState = (s: TurnState, spend: InteractionSpend): TurnState => ({
  ...s,
  attackEquipCredits: s.attackEquipCredits + spend.fromAttackCredits,
  freeInteractionUsed: spend.usedFreeInteraction ? false : s.freeInteractionUsed,
});

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
    castTally: [],
    spellCastThisTurn: {},
    round: s.round + 1,
    attackedThisTurn: false,
    tookDamageThisTurn: false,
    sneakAttackUsedThisTurn: false,
    stunningStrikeUsedThisTurn: false,
    openHandRiderUsedThisTurn: false,
    attackEquipCredits: 0,
    freeInteractionUsed: false,
    history: [],
  };
}

// Remaining transitions extracted for the reducer (#967).
function startCombatState(): TurnState {
  return {
    inCombat: true,
    round: 1,
    phase: "idle",
    actionsRemaining: 0,
    bonusActionUsed: false,
    reactionUsed: false,
    attack: null,
    bonusAttack: null,
    attackTally: [],
    castTally: [],
    spellCastThisTurn: {},
    attackedThisTurn: false,
    tookDamageThisTurn: false,
    sneakAttackUsedThisTurn: false,
    stunningStrikeUsedThisTurn: false,
    openHandRiderUsedThisTurn: false,
    attackEquipCredits: 0,
    freeInteractionUsed: false,
    history: [],
  };
}

// Begin the turn. Deliberately does NOT reset attackedThisTurn/tookDamageThisTurn
// (cleared in endTurn) so damage/attacks between your turns carry into the
// auto-end check. The HP-drop baseline sync (`prevHpRef`) is a side effect kept
// in the dispatch wrapper — the reducer stays pure.
function startTurnState(s: TurnState): TurnState {
  return {
    ...s,
    phase: "active",
    actionsRemaining: 1,
    bonusActionUsed: false,
    reactionUsed: false, // reaction resets at start of YOUR turn
    attack: null,
    bonusAttack: null,
    attackTally: [],
    castTally: [],
    spellCastThisTurn: {},
    sneakAttackUsedThisTurn: false, // once per turn — resets each of your turns
    stunningStrikeUsedThisTurn: false, // once per turn — resets each of your turns
    openHandRiderUsedThisTurn: false, // once per turn — resets each of your turns
    attackEquipCredits: 0, // interaction-budget credits reset each of your turns (#1165)
    freeInteractionUsed: false,
    history: [], // undo never reaches across turns
  };
}

function commitActionSpellState(s: TurnState, spellLevel: number): TurnState {
  const kind: SpellCastKind = spellLevel === 0 ? "cantrip" : "leveled";
  return {
    ...s,
    actionsRemaining: Math.max(0, s.actionsRemaining - 1),
    attack: null,
    spellCastThisTurn: { ...s.spellCastThisTurn, action: kind },
  };
}

function commitBonusActionSpellState(s: TurnState, spellLevel: number): TurnState {
  const kind: SpellCastKind = spellLevel === 0 ? "cantrip" : "leveled";
  return {
    ...s,
    bonusActionUsed: true,
    bonusAttack: null,
    spellCastThisTurn: { ...s.spellCastThisTurn, bonus: kind },
  };
}

// Reducer: actions-as-data over the pure transitions above (#967).
// Collapses the former ~24 delegating useCallbacks into one stable dispatch.
// Every real transition still lives in a module-level pure fn; the reducer only
// routes an action to its handler and — for the CONSUMING actions — pushes the
// pre-mutation economy snapshot onto the undo stack, exactly reproducing the old
// `mutate` wrapper (push iff the transition changed state, so no-op guards stay
// history-free). Lifecycle actions reset history; tally refinements + meta ops
// write through untouched. This is the seam a future server-pushed combat event
// (DM view / multiplayer) dispatches into — a remote event is the same action.

type TurnAction =
  // Lifecycle — reset history, never push a snapshot.
  | { type: "startCombat" }
  | { type: "endCombat" }
  | { type: "startTurn" }
  | { type: "endTurn" }
  // Consuming — push a pre-mutation snapshot iff the transition changes state.
  | { type: "consumeAction" }
  | { type: "enterAttackMode"; attacksPerAction: number }
  | { type: "recordAttack"; recorded?: RecordedAttack }
  | { type: "cancelAttack" }
  | { type: "finishAttack" }
  | { type: "consumeBonusAction" }
  | { type: "enterTwfMode" }
  | { type: "recordTwfAttack"; recorded?: RecordedAttack }
  | { type: "cancelTwf" }
  | { type: "enterFlurryMode"; count: number }
  | { type: "recordFlurryAttack"; recorded?: RecordedAttack }
  | { type: "cancelFlurry" }
  | { type: "finishFlurry" }
  | { type: "consumeReaction" }
  | { type: "grantExtraAction" }
  | { type: "spendInteractionBudget"; spend: InteractionSpend }
  | { type: "refundInteractionBudget"; spend: InteractionSpend }
  | { type: "commitActionSpell"; spellLevel: number }
  | { type: "commitBonusActionSpell"; spellLevel: number }
  // Non-undoable tally refinements — write through, never push.
  | { type: "setTallyDamage"; rowId: string; damage: number }
  | { type: "setTallyDamageAt"; index: number; damage: number }
  | { type: "setTallyAttackTotal"; rowId: string; total: number }
  | { type: "addTallyDamageRider"; rowId: string; amount: number }
  | { type: "setTallyVerdict"; index: number; verdict: TallyVerdict | undefined }
  | { type: "clearAttackTally" }
  | { type: "recordSpellCast"; recorded: RecordedSpellCast }
  | { type: "clearCastTally" }
  // Meta / effect-driven — write through, never push.
  | { type: "attachBatchId"; batchId: string }
  | { type: "undo" }
  | { type: "markDamageTaken" }
  | { type: "markSneakAttackUsed" }
  | { type: "markStunningStrikeUsed" }
  | { type: "markOpenHandRiderUsed" }
  | { type: "hydrate"; state: TurnState };

// The action types whose transition pushes an undo snapshot (the former `mutate`
// callers). refundAction and commitReactionSpell are facade aliases that dispatch
// grantExtraAction / consumeReaction, so they inherit the push behavior.
const CONSUMING: ReadonlySet<TurnAction["type"]> = new Set([
  "consumeAction",
  "enterAttackMode",
  "recordAttack",
  "cancelAttack",
  "finishAttack",
  "consumeBonusAction",
  "enterTwfMode",
  "recordTwfAttack",
  "cancelTwf",
  "enterFlurryMode",
  "recordFlurryAttack",
  "cancelFlurry",
  "finishFlurry",
  "consumeReaction",
  "grantExtraAction",
  "spendInteractionBudget",
  "refundInteractionBudget",
  "commitActionSpell",
  "commitBonusActionSpell",
]);

// One handler per action, each narrowed to its member via key remapping. A flat
// table keeps the router at cyclomatic 1 (a 28-case switch would breach the
// ceiling).
type TurnActionHandlers = {
  [K in TurnAction as K["type"]]: (s: TurnState, action: K) => TurnState;
};

const HANDLERS: TurnActionHandlers = {
  startCombat: () => startCombatState(),
  endCombat: () => initialState(),
  startTurn: (s) => startTurnState(s),
  endTurn: (s) => endTurnState(s),
  consumeAction: (s) => consumeActionState(s),
  enterAttackMode: (s, a) => enterAttackModeState(s, a.attacksPerAction),
  recordAttack: (s, a) => recordAttackState(s, a.recorded),
  cancelAttack: (s) => cancelAttackState(s),
  finishAttack: (s) => finishAttackState(s),
  consumeBonusAction: (s) => consumeBonusActionState(s),
  enterTwfMode: (s) => enterTwfModeState(s),
  recordTwfAttack: (s, a) => recordTwfAttackState(s, a.recorded),
  cancelTwf: (s) => cancelTwfState(s),
  enterFlurryMode: (s, a) => enterFlurryModeState(s, a.count),
  recordFlurryAttack: (s, a) => recordFlurryAttackState(s, a.recorded),
  cancelFlurry: (s) => cancelFlurryState(s),
  finishFlurry: (s) => finishFlurryState(s),
  consumeReaction: (s) => consumeReactionState(s),
  grantExtraAction: (s) => ({ ...s, actionsRemaining: s.actionsRemaining + 1 }),
  spendInteractionBudget: (s, a) => spendInteractionBudgetState(s, a.spend),
  refundInteractionBudget: (s, a) => refundInteractionBudgetState(s, a.spend),
  commitActionSpell: (s, a) => commitActionSpellState(s, a.spellLevel),
  commitBonusActionSpell: (s, a) => commitBonusActionSpellState(s, a.spellLevel),
  setTallyDamage: (s, a) => setTallyDamageState(s, a.rowId, a.damage),
  setTallyDamageAt: (s, a) => setTallyDamageAtState(s, a.index, a.damage),
  setTallyAttackTotal: (s, a) => setTallyAttackTotalState(s, a.rowId, a.total),
  addTallyDamageRider: (s, a) => addTallyDamageRiderState(s, a.rowId, a.amount),
  setTallyVerdict: (s, a) => setTallyVerdictState(s, a.index, a.verdict),
  clearAttackTally: (s) => clearAttackTallyState(s),
  recordSpellCast: (s, a) => recordSpellCastState(s, a.recorded),
  clearCastTally: (s) => clearCastTallyState(s),
  attachBatchId: (s, a) => attachBatchIdState(s, a.batchId),
  undo: (s) => undoState(s),
  markDamageTaken: (s) => (s.tookDamageThisTurn ? s : { ...s, tookDamageThisTurn: true }),
  markSneakAttackUsed: (s) =>
    s.sneakAttackUsedThisTurn ? s : { ...s, sneakAttackUsedThisTurn: true },
  markStunningStrikeUsed: (s) =>
    s.stunningStrikeUsedThisTurn ? s : { ...s, stunningStrikeUsedThisTurn: true },
  markOpenHandRiderUsed: (s) =>
    s.openHandRiderUsedThisTurn ? s : { ...s, openHandRiderUsedThisTurn: true },
  hydrate: (_s, a) => a.state,
};

function turnReducer(state: TurnState, action: TurnAction): TurnState {
  const handler = HANDLERS[action.type] as (s: TurnState, a: TurnAction) => TurnState;
  const next = handler(state, action);
  // CONSUMING actions push a pre-mutation snapshot — but only when the transition
  // actually changed state (no-op guards stay history-free), matching old `mutate`.
  if (next !== state && CONSUMING.has(action.type)) {
    return { ...next, history: [...state.history, economyOf(state)] };
  }
  return next;
}

function hydrateOrInit(sessionId: string | null): TurnState {
  const loaded = sessionId ? loadTurnState(sessionId) : null;
  return loaded ? hydrateTurnState(loaded) : initialState();
}

export function useTurnState(character: Character, sessionId: string): TurnStateView;
export function useTurnState(character: Character, sessionId: string | null): TurnStateView | null;
// A null sessionId means "no live joined session" (#959): the hook still runs
// every hook unconditionally but returns null, so the single TurnStateProvider
// instance can hold a null value off-combat without violating rules-of-hooks.
export function useTurnState(character: Character, sessionId: string | null): TurnStateView | null {
  // Lazily hydrate (merge over defaults so a stale-schema snapshot backfills a
  // newer field, e.g. history pre-#730, #750). `dispatch` is stable for #967.
  const [state, dispatch] = useReducer(turnReducer, sessionId, hydrateOrInit);

  // Re-hydrate when the session identity changes — a session may go live (null →
  // id) or end (id → null) while the sheet stays mounted, and the lazy
  // initializer above only runs on first mount.
  const prevSessionIdRef = useRef(sessionId);
  useEffect(() => {
    if (prevSessionIdRef.current === sessionId) return;
    prevSessionIdRef.current = sessionId;
    dispatch({ type: "hydrate", state: hydrateOrInit(sessionId) });
  }, [sessionId]);

  // Derived (not persisted): TWF eligibility follows the LIVE loadout, so a
  // mid-turn weapon swap updates the off-hand affordance immediately (#733).
  const twfAvailable = canTwoWeaponFight(
    character.inventory,
    hasFeatImprovement(character, "offhandAbilityDamage"),
  );

  // Server-derived, multiclass-correct (max across classes); see srd.ts. Mirrored
  // into refs so the action facade stays a stable, dependency-free useMemo while
  // still dispatching the latest per-render values (#967).
  const attacksPerAction = character.attacksPerAction;
  const currentHp = character.hitPoints?.current ?? 0;
  const attacksPerActionRef = useRef(attacksPerAction);
  attacksPerActionRef.current = attacksPerAction;
  const currentHpRef = useRef(currentHp);
  currentHpRef.current = currentHp;

  // Persist state to localStorage whenever it changes — a no-op while there is
  // no live session (null sessionId).
  useEffect(() => {
    if (sessionId) saveTurnState(sessionId, state);
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
    if (currentHp < prevHpRef.current) dispatch({ type: "markDamageTaken" });
    prevHpRef.current = currentHp;
  }, [currentHp]);

  // The TurnStateActions facade — a stable useMemo over the stable `dispatch`
  // (#967). Every callback is the same named affordance components already use;
  // per-render values (currentHp for the startTurn HP-drop baseline sync,
  // attacksPerAction for the Extra-Attack counter) are read from refs so the
  // facade never needs rebuilding. Aliases (refundAction, commitReactionSpell)
  // dispatch grantExtraAction / consumeReaction, preserving their old behavior.
  const actions = useMemo<TurnStateActions>(
    () => ({
      startCombat: () => dispatch({ type: "startCombat" }),
      endCombat: () => dispatch({ type: "endCombat" }),
      startTurn: () => {
        prevHpRef.current = currentHpRef.current;
        dispatch({ type: "startTurn" });
      },
      endTurn: () => dispatch({ type: "endTurn" }),
      consumeAction: () => dispatch({ type: "consumeAction" }),
      enterAttackMode: () =>
        dispatch({ type: "enterAttackMode", attacksPerAction: attacksPerActionRef.current }),
      recordAttack: (recorded) => dispatch({ type: "recordAttack", recorded }),
      setTallyDamage: (rowId, damage) => dispatch({ type: "setTallyDamage", rowId, damage }),
      setTallyDamageAt: (index, damage) => dispatch({ type: "setTallyDamageAt", index, damage }),
      setTallyAttackTotal: (rowId, total) => dispatch({ type: "setTallyAttackTotal", rowId, total }),
      addTallyDamageRider: (rowId, amount) => dispatch({ type: "addTallyDamageRider", rowId, amount }),
      setTallyVerdict: (index, verdict) => dispatch({ type: "setTallyVerdict", index, verdict }),
      clearAttackTally: () => dispatch({ type: "clearAttackTally" }),
      recordSpellCast: (recorded) => dispatch({ type: "recordSpellCast", recorded }),
      clearCastTally: () => dispatch({ type: "clearCastTally" }),
      cancelAttack: () => dispatch({ type: "cancelAttack" }),
      finishAttack: () => dispatch({ type: "finishAttack" }),
      consumeBonusAction: () => dispatch({ type: "consumeBonusAction" }),
      enterTwfMode: () => dispatch({ type: "enterTwfMode" }),
      recordTwfAttack: (recorded) => dispatch({ type: "recordTwfAttack", recorded }),
      cancelTwf: () => dispatch({ type: "cancelTwf" }),
      enterFlurryMode: (count) => dispatch({ type: "enterFlurryMode", count }),
      recordFlurryAttack: (recorded) => dispatch({ type: "recordFlurryAttack", recorded }),
      cancelFlurry: () => dispatch({ type: "cancelFlurry" }),
      finishFlurry: () => dispatch({ type: "finishFlurry" }),
      consumeReaction: () => dispatch({ type: "consumeReaction" }),
      grantExtraAction: () => dispatch({ type: "grantExtraAction" }),
      refundAction: () => dispatch({ type: "grantExtraAction" }),
      spendInteractionBudget: (spend) => dispatch({ type: "spendInteractionBudget", spend }),
      refundInteractionBudget: (spend) => dispatch({ type: "refundInteractionBudget", spend }),
      commitActionSpell: (spellLevel) => dispatch({ type: "commitActionSpell", spellLevel }),
      commitBonusActionSpell: (spellLevel) => dispatch({ type: "commitBonusActionSpell", spellLevel }),
      commitReactionSpell: () => dispatch({ type: "consumeReaction" }),
      attachBatchId: (batchId) => dispatch({ type: "attachBatchId", batchId }),
      undo: () => dispatch({ type: "undo" }),
      markSneakAttackUsed: () => dispatch({ type: "markSneakAttackUsed" }),
      markStunningStrikeUsed: () => dispatch({ type: "markStunningStrikeUsed" }),
      markOpenHandRiderUsed: () => dispatch({ type: "markOpenHandRiderUsed" }),
    }),
    [],
  );

  // No live joined session → no turn tracker. Every hook above still ran.
  if (sessionId === null) return null;

  return { ...state, twfAvailable, ...actions };
}
