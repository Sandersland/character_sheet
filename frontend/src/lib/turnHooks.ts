/**
 * Turn-hook registry — end-conditions for while-active durable buffs.
 *
 * The session turn tracker evaluates these at end-of-turn against the character's
 * own turn activity (did they attack? take damage?). Rage is data here, not
 * hardcoded in the tracker: the tracker only knows "which active buffs should end
 * given this turn's window". No enemy/target modeling — "attacked a hostile
 * creature" is approximated as "made any attack".
 */

/** What the character did during the turn window the hook evaluates. */
export interface TurnActivityWindow {
  /** Made at least one attack this turn. */
  attacked: boolean;
  /** Took damage this turn. */
  tookDamage: boolean;
}

/** End-condition for one durable (while-active) buff, keyed by its buff `key`. */
export interface DurableBuffEndCondition {
  key: string;
  /** Human-readable "when/why it ends" note surfaced in the turn UI. */
  reminder: string;
  endsWhen: (window: TurnActivityWindow) => boolean;
}

export const DURABLE_BUFF_END_CONDITIONS: DurableBuffEndCondition[] = [
  {
    key: "rage",
    reminder: "Rage ends at the end of your turn unless you attacked or took damage this turn.",
    endsWhen: (w) => !w.attacked && !w.tookDamage,
  },
];

/** Buff keys whose end-condition fires for this turn window. */
export function buffsToAutoEnd(activeBuffKeys: string[], window: TurnActivityWindow): string[] {
  const active = new Set(activeBuffKeys);
  return DURABLE_BUFF_END_CONDITIONS
    .filter((c) => active.has(c.key) && c.endsWhen(window))
    .map((c) => c.key);
}

/** Reminders for every registered durable buff that is currently active. */
export function endReminders(activeBuffKeys: string[]): { key: string; reminder: string }[] {
  const active = new Set(activeBuffKeys);
  return DURABLE_BUFF_END_CONDITIONS
    .filter((c) => active.has(c.key))
    .map((c) => ({ key: c.key, reminder: c.reminder }));
}
