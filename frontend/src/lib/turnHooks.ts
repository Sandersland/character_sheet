// No enemy/target model: "attacked a hostile creature" is approximated as
// "made any attack" (rage's actual end condition).
export interface TurnActivityWindow {
  attacked: boolean;
  tookDamage: boolean;
}

interface DurableBuffEndCondition {
  key: string;
  endActionKey: string;
  reminder: string;
  endsWhen: (window: TurnActivityWindow) => boolean;
}

const DURABLE_BUFF_END_CONDITIONS: DurableBuffEndCondition[] = [
  {
    key: "rage",
    endActionKey: "endRage",
    reminder:
      "Rage ends at the end of your turn unless you attacked or took damage this turn. While raging you have advantage on Strength checks & saves — apply it with the roll-mode toggle.",
    endsWhen: (w) => !w.attacked && !w.tookDamage,
  },
];

export function endActionKeyFor(buffKey: string): string | undefined {
  return DURABLE_BUFF_END_CONDITIONS.find((c) => c.key === buffKey)?.endActionKey;
}

export function buffsToAutoEnd(activeBuffKeys: string[], window: TurnActivityWindow): string[] {
  const active = new Set(activeBuffKeys);
  return DURABLE_BUFF_END_CONDITIONS
    .filter((c) => active.has(c.key) && c.endsWhen(window))
    .map((c) => c.key);
}

export function endReminders(activeBuffKeys: string[]): { key: string; reminder: string }[] {
  const active = new Set(activeBuffKeys);
  return DURABLE_BUFF_END_CONDITIONS
    .filter((c) => active.has(c.key))
    .map((c) => ({ key: c.key, reminder: c.reminder }));
}
