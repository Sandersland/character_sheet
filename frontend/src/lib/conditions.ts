import type { ConditionKey } from "@/types/character";

/**
 * Edition-invariant presentation metadata for the 14 standard 5e conditions:
 * display labels, alphabetical ordering, and a key+label fallback list. Rules
 * text (descriptions) is resolved backend-side per edition and arrives on the
 * wire via GET /api/reference's `conditions` field (#1322) — this module holds
 * no rules text of its own. Labels never fork by edition (the backend's
 * condition-data override table has no `label` field, so `tsc` itself forbids
 * an attempt to override it), which is what lets CONDITION_LABELS stay
 * edition-free by construction. Never render a raw condition key in the UI;
 * resolve through conditionLabel().
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

/** Canonical alphabetical order for iterating conditions in pickers/strips. */
const CONDITION_ORDER: readonly ConditionKey[] = (
  Object.keys(CONDITION_LABELS) as ConditionKey[]
).sort((a, b) => CONDITION_LABELS[a].localeCompare(CONDITION_LABELS[b]));

/**
 * Key+label fallback list — no description (that's rules text, resolved
 * server-side). Two consumers: `AddConditionPanel`'s picker falls back to this
 * while `/reference`'s conditions haven't loaded yet (a missing sentence
 * degrades; a wrong-edition sentence lies), and `GrantFields` (the DM's
 * condition-immunity dropdown) has no character — and so no edition — in
 * scope, and only ever reads `key`/`label`.
 */
export const CONDITION_OPTIONS: readonly { key: ConditionKey; label: string }[] = CONDITION_ORDER.map((key) => ({
  key,
  label: CONDITION_LABELS[key],
}));

/** Display label for a condition key. Tolerant: unknown keys degrade to self. */
export function conditionLabel(key: string): string {
  return CONDITION_LABELS[key as ConditionKey] ?? key;
}

/** Maximum exhaustion level (6 = death). */
export const EXHAUSTION_MAX = 6;

/** Short label for an exhaustion level, e.g. "Exhaustion 3". */
export function exhaustionLabel(level: number): string {
  const clamped = Math.min(EXHAUSTION_MAX, Math.max(0, Math.trunc(level)));
  return `Exhaustion ${clamped}`;
}
