import type { ConditionKey } from "@/types/character";

// Labels never fork by edition — the backend's condition-data override table has no `label` field, so `tsc` itself forbids overriding it. Never render a raw condition key in the UI; resolve through conditionLabel().

export const CONDITION_LABELS: Record<ConditionKey, string> = {
  blinded: "Blinded",
  charmed: "Charmed",
  deafened: "Deafened",
  frightened: "Frightened",
  grappled: "Grappled",
  incapacitated: "Incapacitated",
  invisible: "Invisible",
  paralyzed: "Paralyzed",
  petrified: "Petrified",
  poisoned: "Poisoned",
  prone: "Prone",
  restrained: "Restrained",
  stunned: "Stunned",
  unconscious: "Unconscious",
};

const CONDITION_ORDER: readonly ConditionKey[] = (
  Object.keys(CONDITION_LABELS) as ConditionKey[]
).sort((a, b) => CONDITION_LABELS[a].localeCompare(CONDITION_LABELS[b]));

// AddConditionPanel falls back to this while /reference hasn't loaded (a missing sentence degrades; a wrong-edition sentence lies); GrantFields has no character, and so no edition, in scope.
export const CONDITION_OPTIONS: readonly { key: ConditionKey; label: string }[] = CONDITION_ORDER.map((key) => ({
  key,
  label: CONDITION_LABELS[key],
}));

export function conditionLabel(key: string): string {
  return CONDITION_LABELS[key as ConditionKey] ?? key;
}

// 6 = death.
export const EXHAUSTION_MAX = 6;

export function exhaustionLabel(level: number): string {
  const clamped = Math.min(EXHAUSTION_MAX, Math.max(0, Math.trunc(level)));
  return `Exhaustion ${clamped}`;
}
