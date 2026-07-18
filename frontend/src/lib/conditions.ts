import type { ConditionKey } from "@/types/character";

/**
 * Display labels + short descriptions for the 14 standard 5e conditions and
 * exhaustion. This mirrors the backend SRD rules data — the
 * backend remains the single source of truth for rules; this is presentation
 * metadata only (labels/descriptions for the chip strip + picker). Never render
 * a raw condition key in the UI; resolve through conditionLabel().
 */

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

/** Short effect summaries for the picker (shortened from PHB Appendix A). */
export const CONDITION_DESCRIPTIONS: Record<ConditionKey, string> = {
  blinded: "Can't see; auto-fail sight checks. Attacks against have advantage; its attacks have disadvantage.",
  charmed: "Can't attack the charmer; charmer has advantage on social checks.",
  deafened: "Can't hear; auto-fail hearing checks.",
  frightened: "Disadvantage on checks/attacks while the source is in sight; can't move closer to it.",
  grappled: "Speed becomes 0; ends if grappler is incapacitated or moved away.",
  incapacitated: "Can't take actions or reactions.",
  invisible: "Can't be seen unaided. Attacks against have disadvantage; its attacks have advantage.",
  paralyzed: "Incapacitated, can't move/speak; auto-fail STR/DEX saves; melee hits are crits.",
  petrified: "Turned to stone; incapacitated, unaware; resists all damage; immune to poison/disease.",
  poisoned: "Disadvantage on attack rolls and ability checks.",
  prone: "Disadvantage on attacks. Melee against has advantage; ranged has disadvantage.",
  restrained: "Speed 0; disadvantage on attacks & DEX saves; attacks against have advantage.",
  stunned: "Incapacitated, can't move; auto-fail STR/DEX saves; attacks against have advantage.",
  unconscious: "Incapacitated, unaware, drops items, falls prone; auto-fail STR/DEX saves; melee hits are crits.",
};

/** Canonical alphabetical order for iterating conditions in pickers/strips. */
const CONDITION_ORDER: readonly ConditionKey[] = (
  Object.keys(CONDITION_LABELS) as ConditionKey[]
).sort((a, b) => CONDITION_LABELS[a].localeCompare(CONDITION_LABELS[b]));

export const CONDITION_OPTIONS: readonly {
  key: ConditionKey;
  label: string;
  description: string;
}[] = CONDITION_ORDER.map((key) => ({
  key,
  label: CONDITION_LABELS[key],
  description: CONDITION_DESCRIPTIONS[key],
}));

/** Display label for a condition key. Tolerant: unknown keys degrade to self. */
export function conditionLabel(key: string): string {
  return CONDITION_LABELS[key as ConditionKey] ?? key;
}

/** Maximum exhaustion level (6 = death). */
export const EXHAUSTION_MAX = 6;

/** Cumulative effect text per exhaustion level (index 0 = no exhaustion). */
const EXHAUSTION_EFFECTS: readonly string[] = [
  "No exhaustion.",
  "Disadvantage on ability checks.",
  "Speed halved.",
  "Disadvantage on attack rolls and saving throws.",
  "Hit point maximum halved.",
  "Speed reduced to 0.",
  "Death.",
];

/** Short label for an exhaustion level, e.g. "Exhaustion 3". */
export function exhaustionLabel(level: number): string {
  const clamped = Math.min(EXHAUSTION_MAX, Math.max(0, Math.trunc(level)));
  return `Exhaustion ${clamped}`;
}

/** Cumulative effect text for an exhaustion level, clamped to 0–6. */
export function exhaustionEffect(level: number): string {
  const clamped = Math.min(EXHAUSTION_MAX, Math.max(0, Math.trunc(level)));
  return EXHAUSTION_EFFECTS[clamped];
}
