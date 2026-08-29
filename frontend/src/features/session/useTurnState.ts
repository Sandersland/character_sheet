/**
 * `round`/`inCombat` are server-authoritative (`syncCombat` reconciles them); the turn economy (actions/attacks remaining) stays purely local — only its effects (resource spends, HP, inventory) persist through transactions.
 * Persisted to localStorage keyed by sessionId (survives refreshes/brief disconnects); cleared on session end.
 * startTurn() isn't gated on inCombat here — TurnHub's caller enforces that before calling it.
 * consumeReaction() can fire any time (opportunity attacks, readied actions) — it only resets at the start of YOUR turn via startTurn().
 */

import { useReducer, useMemo, useEffect, useRef } from "react";
import { offHandAttackEnabled } from "@/lib/turnOptions";
import { autoVerdict } from "@/lib/attackTallySummary";
import { loadTurnState, saveTurnState } from "@/features/session/turnStatePersistence";
import type {
  AttackTallyRow,
  TallyAttackRoll,
  TallyRowSource,
  TallyVerdict,
} from "@/lib/attackTallySummary";
import type { InteractionSpend } from "@/lib/loadoutPicker";
import type { Character, SpellEconomyState } from "@/types/character";

export type { AttackTallyRow, TallyAttackRoll } from "@/lib/attackTallySummary";

export interface RecordedAttack {
  formId: string;
  formName: string;
  attack: TallyAttackRoll;
  /** Defaults to `action` when omitted (#813). */
  source?: TallyRowSource;
  /** Correlates this row's roll events as one swing (#1235). */
  swingId?: string;
}

let rowIdSeq = 0;
/** Monotonic per-load row id — collision-free within a session; rehydrated rows keep their stored id. */
function nextRowId(): string {
  rowIdSeq += 1;
  return `tally-${Date.now().toString(36)}-${rowIdSeq}`;
}

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

/** Already resolved when it lands here — unlike AttackTallyRow there's no verdict field. */
export interface CastTallyRow extends RecordedSpellCast {
  id: string;
}

export type TurnPhase = "idle" | "active";

export interface AttackState {
  /** From deriveAttacksPerAction + possible extra from Action Surge. */
  total: number;
  used: number;
}

export interface TurnState {
  inCombat: boolean;
  /** 0 when not in combat. */
  round: number;
  /** The monotonicity baseline `syncCombat` compares against so an out-of-order poll can't roll round/inCombat backward; survives local startCombat/endCombat resets so a race is still judged against the last CONFIRMED server timestamp (#1030 finding #2). */
  combatUpdatedAt: string | null;
  phase: TurnPhase;
  /** Normally 1; +1 after Action Surge. */
  actionsRemaining: number;
  bonusActionUsed: boolean;
  reactionUsed: boolean;
  attack: AttackState | null;
  /** TWF off-hand (total 1) or Flurry of Blows (total 2, 3 at Heightened Focus L10 #1244) — the two never coexist, sharing the one bonus-action slot. */
  bonusAttack: AttackState | null;
  /** One row per rolled attack; survives sheet close/reopen (Resume); cleared by endTurn and on a new Attack action; snapshotted for undo (#802). */
  attackTally: AttackTallyRow[];
  /** One row per settled cast, appended by InlineSpellPicker's onCastSettled; cleared by endTurn/startTurn and banner dismiss; undo of a cast reverts the server cast too via its batchId (#1164/#758). */
  castTally: CastTallyRow[];
  /** RESOLVED SERVER-SIDE and synced via syncCombat (#1439) — the picker reads these booleans, never re-derives the rule; defaults to {false,false} until the first sync. */
  spellEconomy: SpellEconomyState;
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
  /** One equip/unequip credit per attack with the Attack action (PHB'24: "you can equip or unequip one weapon when you make this attack"); spent by a mid-turn swap (#1165), resets each turn. */
  attackEquipCredits: number;
  /** SRD 5.2 "Interacting with Things" — this turn's one free object interaction, spent on a loadout swap (#1165); resets each turn. */
  freeInteractionUsed: boolean;
  /** A snapshot is pushed before each consuming mutation and popped by undo(); cleared at every turn/combat boundary so undo never reaches across turns (#730). */
  history: HistoryEntry[];
}

/** Deliberately excludes lifecycle and the activity flags — reverting those would fight the HP watcher or wrongly relax a durable-buff auto-end; undo restores only what the player spent. */
export type EconomySnapshot = Pick<
  TurnState,
  | "actionsRemaining"
  | "bonusActionUsed"
  | "reactionUsed"
  | "attack"
  | "bonusAttack"
  | "attackTally"
  | "castTally"
  | "attackEquipCredits"
  | "freeInteractionUsed"
>;

/** batchId is present only for a mutation that wrote a server effect (Second Wind, Rage, a resolveAction swing/cast, #758); a local-only entry (Dodge, Dash) has none. */
export interface HistoryEntry extends EconomySnapshot {
  batchId?: string;
}

export interface TurnStateActions {
  startCombat: () => void;
  endCombat: () => void;
  startTurn: () => void;
  endTurn: () => void;
  consumeAction: () => void;
  enterAttackMode: () => void;
  recordAttack: (recorded?: RecordedAttack) => void;
  setTallyDamage: (rowId: string, damage: number) => void;
  setTallyDamageAt: (index: number, damage: number) => void;
  /** Touches only `attack.total` — the kept-d20 face and criticalHit/nat-1 flags (which decide crit/miss) stay put (#809/#1120). */
  setTallyAttackTotal: (rowId: string, total: number) => void;
  addTallyDamageRider: (rowId: string, amount: number) => void;
  setTallyVerdict: (index: number, verdict: TallyVerdict | undefined) => void;
  clearAttackTally: () => void;
  recordSpellCast: (recorded: RecordedSpellCast) => void;
  clearCastTally: () => void;
  cancelAttack: () => void;
  finishAttack: () => void;
  consumeBonusAction: () => void;
  enterTwfMode: () => void;
  recordTwfAttack: (recorded?: RecordedAttack) => void;
  cancelTwf: () => void;
  enterFlurryMode: (count: number) => void;
  recordFlurryAttack: (recorded?: RecordedAttack) => void;
  cancelFlurry: () => void;
  finishFlurry: () => void;
  consumeReaction: () => void;
  /** The resource spend itself is handled by the caller (applyResourceTransactions) — this only bumps the UI counter. */
  grantExtraAction: () => void;
  /** Mechanically +1 actionsRemaining — shares grantExtraAction's implementation (#733); the caller re-issues the inverse inventory ops separately. */
  refundAction: () => void;
  /** The caller (useLoadoutSwap) computes `spend` via planInteractionSpend before dispatching — this only books it (#1165). */
  spendInteractionBudget: (spend: InteractionSpend) => void;
  refundInteractionBudget: (spend: InteractionSpend) => void;
  commitActionSpell: () => void;
  commitBonusActionSpell: () => void;
  commitReactionSpell: () => void;
  attachBatchId: (batchId: string) => void;
  /** LOCAL only — never reverses a server-committed effect; useTurnActions' handleUndo wrapper reverts the batch server-side BEFORE this pop (#758); a loadout swap refunds at its own surface. */
  undo: () => void;
  markSneakAttackUsed: () => void;
  markStunningStrikeUsed: () => void;
  markOpenHandRiderUsed: () => void;
  /**
   * Ignores a sync whose updatedAt isn't strictly newer than combatUpdatedAt — an out-of-order poll can't roll round/inCombat backward (finding #2).
   * A combatActive false→true transition resets phase/economy as a NEW encounter (finding #3) rather than bumping the round on the current one — a remote start must never carry over the previous fight's spent economy.
   */
  syncCombat: (round: number, combatActive: boolean, updatedAt: string, spellEconomy: SpellEconomyState) => void;
  /**
   * Bypasses syncCombat's monotonic guard entirely — for when start/endCombat fails and the server's updatedAt is unchanged, so routine polls would otherwise be silently discarded and the client stuck (#1030 finding #1).
   * Must never be wired to routine poll results, or the guard it deliberately skips is pointless.
   */
  reconcileCombat: (round: number, combatActive: boolean, updatedAt: string, spellEconomy: SpellEconomyState) => void;
}

/** twfAvailable is DERIVED from the live loadout, not persisted — a mid-turn weapon swap updates it immediately without a new startTurn (#733). */
export type TurnStateView = TurnState &
  TurnStateActions & {
    twfAvailable: boolean;
  };

// Server-authoritative (#1439) — a real cast's flags arrive only via syncCombat, never a local commit.
const NO_SPELL_ECONOMY: SpellEconomyState = {
  bonusActionBlockedByActionSpell: false,
  bonusActionLimitedToCantrips: false,
  actionLimitedToCantrips: false,
};

function initialState(): TurnState {
  return {
    inCombat: false,
    round: 0,
    combatUpdatedAt: null,
    phase: "idle",
    actionsRemaining: 0,
    bonusActionUsed: false,
    reactionUsed: false,
    attack: null,
    bonusAttack: null,
    attackTally: [],
    castTally: [],
    spellEconomy: NO_SPELL_ECONOMY,
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

function economyOf(s: TurnState): EconomySnapshot {
  return {
    actionsRemaining: s.actionsRemaining,
    bonusActionUsed: s.bonusActionUsed,
    reactionUsed: s.reactionUsed,
    attack: s.attack,
    bonusAttack: s.bonusAttack,
    attackTally: s.attackTally,
    castTally: s.castTally,
    attackEquipCredits: s.attackEquipCredits,
    freeInteractionUsed: s.freeInteractionUsed,
  };
}

// Merges over defaults for a missing top-level field and backfills attackTally into every undo entry, so a pre-#802 snapshot's undo() doesn't restore undefined over the tally (#750).
function hydrateTurnState(loaded: TurnState): TurnState {
  const base = { ...initialState(), ...loaded };
  return {
    ...base,
    attackTally: backfillRows(base.attackTally),
    castTally: base.castTally ?? [],
    // Pre-#1165 entries lack the interaction-budget fields — default them so a later undo() spread doesn't overwrite live state with `undefined`.
    history: (base.history ?? []).map((h) => ({
      ...h,
      attackTally: backfillRows(h.attackTally),
      castTally: h.castTally ?? [],
      attackEquipCredits: h.attackEquipCredits ?? 0,
      freeInteractionUsed: h.freeInteractionUsed ?? false,
    })),
  };
}

// Pre-#802/#813 rows lack id/source — default source to "action" (the only kind before off-hand adopted the tally) so hydrated rows behave like freshly-recorded ones.
function backfillRows(rows: AttackTallyRow[] | undefined): AttackTallyRow[] {
  return (rows ?? []).map((r) => ({ ...r, id: r.id ?? nextRowId(), source: r.source ?? "action" }));
}

// A `return s` no-op here means nothing is pushed onto the undo stack — guards stay history-free.

const consumeActionState = (s: TurnState): TurnState =>
  s.actionsRemaining <= 0 ? s : { ...s, actionsRemaining: s.actionsRemaining - 1, attack: null };

function enterAttackModeState(s: TurnState, attacksPerAction: number): TurnState {
  if (s.actionsRemaining <= 0) return s;
  // A NEW Attack action clears the previous action's rows only — a bonus-action off-hand row from earlier this turn stays in the banner (#813).
  return {
    ...s,
    actionsRemaining: s.actionsRemaining - 1,
    attack: { total: attacksPerAction, used: 0 },
    attackTally: s.attackTally.filter((r) => r.source !== "action"),
  };
}

function recordAttackState(s: TurnState, recorded?: RecordedAttack): TurnState {
  if (!s.attack) return s;
  // Clamps at total but keeps attack non-null so the picker stays open for damage rolls — closed explicitly via the player's Done button.
  const atCap = s.attack.used >= s.attack.total;
  const used = Math.min(s.attack.used + 1, s.attack.total);
  const attackTally =
    !atCap && recorded
      ? [...s.attackTally, tallyRowFor(recorded, "action")]
      : s.attackTally;
  // PHB'24: one equip/unequip credit per genuine attack (#1165) — not earned on a clamped over-click, matching the tally guard.
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
    // Carries the attack-time swingId (#1235/#1354) so a later rollDamageFor on this row can still correlate its damage event with the attack event.
    ...(recorded.swingId ? { swingId: recorded.swingId } : {}),
  };
}

// An unset verdict resolves to "hit" the moment damage lands (#811); explicit verdicts (miss/crit/nat-locked) are never overwritten.
function withAutoHit(row: AttackTallyRow): AttackTallyRow {
  return row.verdict ? row : { ...row, verdict: "hit" };
}

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

// Targets a specific row so two interleaved sources (action + off-hand) never misattribute a write to "the last row" (#813).
function updateTallyRowById(
  s: TurnState,
  rowId: string,
  update: (row: AttackTallyRow) => AttackTallyRow,
): TurnState {
  return updateTallyRow(s, s.attackTally.findIndex((r) => r.id === rowId), update);
}

// Never appends, so re-rolling attack N's damage replaces N's number rather than double-counting (#802).
const setTallyDamageState = (s: TurnState, rowId: string, damage: number): TurnState =>
  updateTallyRowById(s, rowId, (row) => withAutoHit({ ...row, damage }));

const setTallyDamageAtState = (s: TurnState, index: number, damage: number): TurnState =>
  updateTallyRow(s, index, (row) => withAutoHit({ ...row, damage }));

const setTallyAttackTotalState = (s: TurnState, rowId: string, total: number): TurnState =>
  updateTallyRowById(s, rowId, (row) => ({
    ...row,
    attack: { ...row.attack, total },
  }));

// A rider roll is a damage roll too, so it also resolves an unset verdict to hit.
const addTallyDamageRiderState = (s: TurnState, rowId: string, amount: number): TurnState =>
  updateTallyRowById(s, rowId, (row) =>
    withAutoHit({ ...row, damage: (row.damage ?? 0) + amount }),
  );

// Die-locked rows (crit-range hit or nat 1) refuse — the die already decided; switching to miss also drops the row's damage (#811/#1120).
function setTallyVerdictState(
  s: TurnState,
  index: number,
  verdict: TallyVerdict | undefined,
): TurnState {
  const target = s.attackTally[index];
  if (!target || target.attack.criticalHit || target.attack.nat1) return s;
  return updateTallyRow(s, index, (row) => {
    const updated = { ...row };
    if (verdict === undefined) delete updated.verdict;
    else updated.verdict = verdict;
    if (verdict === "miss") delete updated.damage;
    return updated;
  });
}

// Clearing must be durable — history snapshots also drop their tally rows so undo can't resurrect a dismissed banner (#812); economy fields still restore normally.
const clearAttackTallyState = (s: TurnState): TurnState => {
  if (s.attackTally.length === 0 && s.history.every((h) => h.attackTally.length === 0)) return s;
  return {
    ...s,
    attackTally: [],
    history: s.history.map((h) => (h.attackTally.length === 0 ? h : { ...h, attackTally: [] })),
  };
};

// Write-through, never pushes an undo snapshot — the cast's economy spend already went through commitActionSpell/etc (which IS undoable); this tally row is just its receipt.
const recordSpellCastState = (s: TurnState, recorded: RecordedSpellCast): TurnState => ({
  ...s,
  castTally: [...s.castTally, { ...recorded, id: nextRowId() }],
});

// Same dismiss durability as clearAttackTallyState (#812): scrub history snapshots too, so undo can't resurrect a dismissed banner's rows.
const clearCastTallyState = (s: TurnState): TurnState => {
  if (s.castTally.length === 0 && s.history.every((h) => h.castTally.length === 0)) return s;
  return {
    ...s,
    castTally: [],
    history: s.history.map((h) => (h.castTally.length === 0 ? h : { ...h, castTally: [] })),
  };
};

function cancelAttackState(s: TurnState): TurnState {
  // Only refunds if no attacks have been rolled — once rolled, the action is committed per 5e rules; drops only this action's rows, so an earlier off-hand row survives (#813).
  if (!s.attack || s.attack.used > 0) return s;
  return {
    ...s,
    actionsRemaining: s.actionsRemaining + 1,
    attack: null,
    attackTally: s.attackTally.filter((r) => r.source !== "action"),
  };
}

// No-ops when attack is null — a resolver that never called enterAttackMode, e.g. an opportunity attack.
const finishAttackState = (s: TurnState): TurnState => (s.attack ? { ...s, attack: null } : s);

const consumeBonusActionState = (s: TurnState): TurnState =>
  s.bonusActionUsed ? s : { ...s, bonusActionUsed: true, bonusAttack: null };

// TWF off-hand is always exactly 1 attack. Entering it clears any prior bonus-action row so the swing's own row is the only one this slot owns (#813).
const enterTwfModeState = (s: TurnState): TurnState =>
  s.bonusActionUsed
    ? s
    : {
        ...s,
        bonusActionUsed: true,
        bonusAttack: { total: 1, used: 0 },
        attackTally: s.attackTally.filter((r) => r.source !== "bonusAction"),
      };

function recordTwfAttackState(s: TurnState, recorded?: RecordedAttack): TurnState {
  if (!s.bonusAttack) return s;
  const attackTally = recorded
    ? [...s.attackTally, tallyRowFor(recorded, "bonusAction")]
    : s.attackTally;
  return { ...s, bonusAttack: null, attackedThisTurn: true, attackTally };
}

// Mirrors cancelAttack for the off-hand — refunds only while bonusAttack is still pending; once recordTwfAttack clears it, the bonus action stays committed.
const cancelTwfState = (s: TurnState): TurnState =>
  s.bonusAttack ? { ...s, bonusActionUsed: false, bonusAttack: null } : s;

// Guarded on bonusAttack being non-null (not bonusActionUsed, unlike enterTwfModeState) — the bonus action was already consumed by the generic action-click path; this only guards against re-arming a rehydrated in-progress flurry.
function enterFlurryModeState(s: TurnState, count: number): TurnState {
  if (s.bonusAttack) return s;
  return {
    ...s,
    bonusAttack: { total: count, used: 0 },
    attackTally: s.attackTally.filter((r) => r.source !== "bonusAction"),
  };
}

// Increments and clamps like recordAttackState (Flurry resolves 2+ strikes, unlike TWF's single swing) and deliberately omits the attackEquipCredits grant — PHB'24 ties that credit to the Attack action, not Flurry.
function recordFlurryAttackState(s: TurnState, recorded?: RecordedAttack): TurnState {
  if (!s.bonusAttack) return s;
  const atCap = s.bonusAttack.used >= s.bonusAttack.total;
  const used = Math.min(s.bonusAttack.used + 1, s.bonusAttack.total);
  const attackTally =
    !atCap && recorded ? [...s.attackTally, tallyRowFor(recorded, "bonusAction")] : s.attackTally;
  return { ...s, bonusAttack: { ...s.bonusAttack, used }, attackedThisTurn: true, attackTally };
}

const cancelFlurryState = (s: TurnState): TurnState =>
  s.bonusAttack && s.bonusAttack.used === 0
    ? { ...s, bonusActionUsed: false, bonusAttack: null }
    : s;

const finishFlurryState = (s: TurnState): TurnState =>
  s.bonusAttack ? { ...s, bonusAttack: null } : s;

const consumeReactionState = (s: TurnState): TurnState =>
  s.reactionUsed ? s : { ...s, reactionUsed: true };

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
  // Drop batchId so it never leaks onto the live state (#758).
  const economy = { ...prev };
  delete economy.batchId;
  return { ...s, ...economy, history: s.history.slice(0, -1) };
}

function endTurnState(s: TurnState): TurnState {
  if (!s.inCombat) return initialState();
  // Round is deliberately NOT bumped here (#1030) — the server decides the next round, and useTurnActions' handleEndTurn dispatches syncCombat once that call resolves.
  // Resets the activity window HERE, not in startTurn — handleEndTurn already evaluated the durable-buff auto-end against these flags, so clearing them now still captures out-of-turn damage/attacks before the next startTurn.
  return {
    ...s,
    phase: "idle",
    actionsRemaining: 0,
    bonusActionUsed: false,
    attack: null,
    bonusAttack: null,
    attackTally: [],
    castTally: [],
    spellEconomy: NO_SPELL_ECONOMY,
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

// updatedAt strings are Session's @updatedAt column via Date#toISOString() — fixed-width UTC, so lexicographic string comparison IS chronological comparison; no Date parsing needed.
function syncCombatState(
  s: TurnState,
  round: number,
  combatActive: boolean,
  updatedAt: string,
  spellEconomy: SpellEconomyState,
): TurnState {
  if (s.combatUpdatedAt !== null && updatedAt <= s.combatUpdatedAt) return s;
  return applyCombatState(s, round, combatActive, updatedAt, spellEconomy);
}

// Shared by syncCombatState (guarded) and reconcileCombatState (unguarded) so the two seams never drift on what "apply" means — only on whether the monotonic guard runs first.
function applyCombatState(
  s: TurnState,
  round: number,
  combatActive: boolean,
  updatedAt: string,
  spellEconomy: SpellEconomyState,
): TurnState {
  // A late joiner observing an encounter already past its first cast must not assume a fresh false/false interlock — always apply what the server sent (#1439).
  if (!s.inCombat && combatActive) return freshEncounterState(round, updatedAt, spellEconomy);
  // Even a round/inCombat no-op must still apply the served spellEconomy flags — a cast advances updatedAt without changing the round, and this is the seam the block arrives on (#1439).
  return { ...s, round, inCombat: combatActive, combatUpdatedAt: updatedAt, spellEconomy };
}

function reconcileCombatState(
  s: TurnState,
  round: number,
  combatActive: boolean,
  updatedAt: string,
  spellEconomy: SpellEconomyState,
): TurnState {
  return applyCombatState(s, round, combatActive, updatedAt, spellEconomy);
}

function startCombatState(): TurnState {
  return {
    inCombat: true,
    round: 1,
    combatUpdatedAt: null,
    phase: "idle",
    actionsRemaining: 0,
    bonusActionUsed: false,
    reactionUsed: false,
    attack: null,
    bonusAttack: null,
    attackTally: [],
    castTally: [],
    spellEconomy: NO_SPELL_ECONOMY,
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

// Uses the SERVER's round (not hardcoded 1) since a late joiner can observe combat already past round 1, and keeps the served interlock rather than force-clearing it (#1030 finding #3 / #1439).
function freshEncounterState(round: number, updatedAt: string, spellEconomy: SpellEconomyState): TurnState {
  return { ...startCombatState(), round, combatUpdatedAt: updatedAt, spellEconomy };
}

// Deliberately does not reset attackedThisTurn/tookDamageThisTurn (cleared in endTurn instead) so damage/attacks between your turns carry into the auto-end check; the HP-drop baseline sync stays a side effect in the dispatch wrapper to keep this pure.
function startTurnState(s: TurnState): TurnState {
  return {
    ...s,
    phase: "active",
    actionsRemaining: 1,
    bonusActionUsed: false,
    reactionUsed: false,
    attack: null,
    bonusAttack: null,
    attackTally: [],
    castTally: [],
    spellEconomy: NO_SPELL_ECONOMY,
    sneakAttackUsedThisTurn: false,
    stunningStrikeUsedThisTurn: false,
    openHandRiderUsedThisTurn: false,
    attackEquipCredits: 0,
    freeInteractionUsed: false,
    history: [],
  };
}

// The interlock is no longer recorded here (#1439) — it's resolved server-side from the SessionParticipant row the cast wrote, and arrives via syncCombat; the economy slot itself stays local.
function commitActionSpellState(s: TurnState): TurnState {
  return {
    ...s,
    actionsRemaining: Math.max(0, s.actionsRemaining - 1),
    attack: null,
  };
}

function commitBonusActionSpellState(s: TurnState): TurnState {
  return {
    ...s,
    bonusActionUsed: true,
    bonusAttack: null,
  };
}

type TurnAction =
  | { type: "startCombat" }
  | { type: "endCombat" }
  | { type: "startTurn" }
  | { type: "endTurn" }
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
  | { type: "commitActionSpell" }
  | { type: "commitBonusActionSpell" }
  | { type: "setTallyDamage"; rowId: string; damage: number }
  | { type: "setTallyDamageAt"; index: number; damage: number }
  | { type: "setTallyAttackTotal"; rowId: string; total: number }
  | { type: "addTallyDamageRider"; rowId: string; amount: number }
  | { type: "setTallyVerdict"; index: number; verdict: TallyVerdict | undefined }
  | { type: "clearAttackTally" }
  | { type: "recordSpellCast"; recorded: RecordedSpellCast }
  | { type: "clearCastTally" }
  | { type: "attachBatchId"; batchId: string }
  | { type: "undo" }
  | { type: "markDamageTaken" }
  | { type: "markSneakAttackUsed" }
  | { type: "markStunningStrikeUsed" }
  | { type: "markOpenHandRiderUsed" }
  | { type: "hydrate"; state: TurnState }
  | { type: "syncCombat"; round: number; combatActive: boolean; updatedAt: string; spellEconomy: SpellEconomyState }
  | { type: "reconcileCombat"; round: number; combatActive: boolean; updatedAt: string; spellEconomy: SpellEconomyState };

// refundAction and commitReactionSpell are facade aliases that dispatch grantExtraAction/consumeReaction, so they inherit push behavior without needing their own CONSUMING entry.
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

// A flat table keeps the router at cyclomatic 1 — a 28-case switch would breach the complexity ceiling.
type TurnActionHandlers = {
  [K in TurnAction as K["type"]]: (s: TurnState, action: K) => TurnState;
};

const HANDLERS: TurnActionHandlers = {
  // Preserves combatUpdatedAt across the local optimistic reset — a stale in-flight poll must still be judged against the last CONFIRMED timestamp, not a nulled baseline (#1030 finding #2).
  startCombat: (s) => ({ ...startCombatState(), combatUpdatedAt: s.combatUpdatedAt }),
  endCombat: (s) => ({ ...initialState(), combatUpdatedAt: s.combatUpdatedAt }),
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
  commitActionSpell: (s) => commitActionSpellState(s),
  commitBonusActionSpell: (s) => commitBonusActionSpellState(s),
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
  syncCombat: (s, a) => syncCombatState(s, a.round, a.combatActive, a.updatedAt, a.spellEconomy),
  reconcileCombat: (s, a) => reconcileCombatState(s, a.round, a.combatActive, a.updatedAt, a.spellEconomy),
};

function turnReducer(state: TurnState, action: TurnAction): TurnState {
  const handler = HANDLERS[action.type] as (s: TurnState, a: TurnAction) => TurnState;
  const next = handler(state, action);
  // Pushes a pre-mutation snapshot only when the transition actually changed state — no-op guards stay history-free.
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
// A null sessionId means no live joined session (#959) — every hook still runs unconditionally and only the return value is null, so TurnStateProvider can hold null without violating rules-of-hooks.
export function useTurnState(character: Character, sessionId: string | null): TurnStateView | null {
  const [state, dispatch] = useReducer(turnReducer, sessionId, hydrateOrInit);

  // Re-hydrates when session identity changes — the lazy initializer only runs on first mount, but a session can go live or end while the sheet stays mounted.
  const prevSessionIdRef = useRef(sessionId);
  useEffect(() => {
    if (prevSessionIdRef.current === sessionId) return;
    prevSessionIdRef.current = sessionId;
    dispatch({ type: "hydrate", state: hydrateOrInit(sessionId) });
  }, [sessionId]);

  // Server-resolved (#1435, backend bothWeaponsLight) — read off the live character prop so a mid-turn weapon swap updates the affordance immediately without a new startTurn (#733).
  const twfAvailable = offHandAttackEnabled(character);

  // Mirrored into refs so the action facade below stays a stable, dependency-free useMemo while still reading the latest per-render values.
  const attacksPerAction = character.attacksPerAction;
  const currentHp = character.hitPoints?.current ?? 0;
  const attacksPerActionRef = useRef(attacksPerAction);
  attacksPerActionRef.current = attacksPerAction;
  const currentHpRef = useRef(currentHp);
  currentHpRef.current = currentHp;

  useEffect(() => {
    if (sessionId) saveTurnState(sessionId, state);
  }, [sessionId, state]);

  // Not gated by phase, so damage taken out-of-turn (opportunity attacks, reactions on another creature's turn) counts too — matches the 5e rule "took damage since your last turn"; heals and non-HP changes are ignored.
  const prevHpRef = useRef(currentHp);
  useEffect(() => {
    if (currentHp < prevHpRef.current) dispatch({ type: "markDamageTaken" });
    prevHpRef.current = currentHp;
  }, [currentHp]);

  // Per-render values (currentHp, attacksPerAction) are read from refs so this facade never needs rebuilding despite being a stable, dependency-free useMemo.
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
      commitActionSpell: () => dispatch({ type: "commitActionSpell" }),
      commitBonusActionSpell: () => dispatch({ type: "commitBonusActionSpell" }),
      commitReactionSpell: () => dispatch({ type: "consumeReaction" }),
      attachBatchId: (batchId) => dispatch({ type: "attachBatchId", batchId }),
      undo: () => dispatch({ type: "undo" }),
      markSneakAttackUsed: () => dispatch({ type: "markSneakAttackUsed" }),
      markStunningStrikeUsed: () => dispatch({ type: "markStunningStrikeUsed" }),
      markOpenHandRiderUsed: () => dispatch({ type: "markOpenHandRiderUsed" }),
      syncCombat: (round, combatActive, updatedAt, spellEconomy) =>
        dispatch({ type: "syncCombat", round, combatActive, updatedAt, spellEconomy }),
      reconcileCombat: (round, combatActive, updatedAt, spellEconomy) =>
        dispatch({ type: "reconcileCombat", round, combatActive, updatedAt, spellEconomy }),
    }),
    [],
  );

  if (sessionId === null) return null;

  return { ...state, twfAvailable, ...actions };
}
