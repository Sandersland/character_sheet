// The 14 standard 5e status conditions (PHB Appendix A). This is the single
// source of truth for condition rules data — the frontend resolves display text
// through a label map derived from these keys, never by rendering raw keys.
// Exhaustion is intentionally NOT in this list: it is a single 0–6 level handled
// as a special case (see EXHAUSTION_MAX below; per-level effect text lives on the
// frontend), not a boolean presence in the active-conditions
// list.

export type ConditionKey =
  | "blinded"
  | "charmed"
  | "deafened"
  | "frightened"
  | "grappled"
  | "incapacitated"
  | "invisible"
  | "paralyzed"
  | "petrified"
  | "poisoned"
  | "prone"
  | "restrained"
  | "stunned"
  | "unconscious";

import type { RollEffect } from "./roll-effects.js";

export interface ConditionDefinition {
  key: ConditionKey;
  label: string;
  description: string;
  /** State-driven advantage/disadvantage grants (#486). Merged into rollModifiers on read. */
  rollEffects?: RollEffect[];
}

export const CONDITIONS: readonly ConditionDefinition[] = [
  {
    key: "blinded",
    label: "Blinded",
    description:
      "Can't see and automatically fails any ability check that requires sight. Attack rolls against the creature have advantage, and its attack rolls have disadvantage.",
    rollEffects: [{ mode: "disadvantage", kind: "attack" }],
  },
  {
    key: "charmed",
    label: "Charmed",
    description:
      "Can't attack the charmer or target it with harmful abilities or magical effects. The charmer has advantage on ability checks to interact socially with the creature.",
  },
  {
    key: "deafened",
    label: "Deafened",
    description: "Can't hear and automatically fails any ability check that requires hearing.",
  },
  {
    key: "frightened",
    label: "Frightened",
    description:
      "Has disadvantage on ability checks and attack rolls while the source of its fear is within line of sight. Can't willingly move closer to the source of its fear.",
    rollEffects: [
      { mode: "disadvantage", kind: "attack" },
      { mode: "disadvantage", kind: "check" },
    ],
  },
  {
    key: "grappled",
    label: "Grappled",
    description:
      "Speed becomes 0, and it can't benefit from any bonus to its speed. The condition ends if the grappler is incapacitated or if the creature is moved out of reach.",
  },
  {
    key: "incapacitated",
    label: "Incapacitated",
    description: "Can't take actions or reactions.",
  },
  {
    key: "invisible",
    label: "Invisible",
    description:
      "Impossible to see without the aid of magic or a special sense. The creature is heavily obscured. Attack rolls against it have disadvantage, and its attack rolls have advantage.",
  },
  {
    key: "paralyzed",
    label: "Paralyzed",
    description:
      "Incapacitated and can't move or speak. Automatically fails Strength and Dexterity saving throws. Attack rolls against it have advantage, and any attack that hits from within 5 feet is a critical hit.",
  },
  {
    key: "petrified",
    label: "Petrified",
    description:
      "Transformed, along with nonmagical objects it is wearing or carrying, into a solid inanimate substance. Incapacitated, can't move or speak, and is unaware of its surroundings. Resistant to all damage; immune to poison and disease.",
  },
  {
    key: "poisoned",
    label: "Poisoned",
    description: "Has disadvantage on attack rolls and ability checks.",
    rollEffects: [
      { mode: "disadvantage", kind: "attack" },
      { mode: "disadvantage", kind: "check" },
    ],
  },
  {
    key: "prone",
    label: "Prone",
    description:
      "Can only crawl unless it stands up. Has disadvantage on attack rolls. An attack roll against it has advantage if the attacker is within 5 feet; otherwise the attack roll has disadvantage.",
    rollEffects: [{ mode: "disadvantage", kind: "attack" }],
  },
  {
    key: "restrained",
    label: "Restrained",
    description:
      "Speed becomes 0, and it can't benefit from any bonus to its speed. Attack rolls against it have advantage, and its attack rolls have disadvantage. Has disadvantage on Dexterity saving throws.",
    rollEffects: [
      { mode: "disadvantage", kind: "attack" },
      { mode: "disadvantage", kind: "save", ability: "dexterity" },
    ],
  },
  {
    key: "stunned",
    label: "Stunned",
    description:
      "Incapacitated, can't move, and can speak only falteringly. Automatically fails Strength and Dexterity saving throws. Attack rolls against it have advantage.",
  },
  {
    key: "unconscious",
    label: "Unconscious",
    description:
      "Incapacitated, can't move or speak, and is unaware of its surroundings. Drops whatever it's holding and falls prone. Automatically fails Strength and Dexterity saving throws. Attack rolls against it have advantage, and any attack that hits from within 5 feet is a critical hit.",
  },
];

/** Maximum exhaustion level (level 6 = death). */
export const EXHAUSTION_MAX = 6;

/** Returns true if `key` is a known standard condition key. */
export function isKnownCondition(key: string): key is ConditionKey {
  return CONDITIONS.some((c) => c.key === key);
}

/**
 * Synthetic roll-effect grants for a given exhaustion level (#846), mirroring
 * the standard conditions' `rollEffects` shape without a `ConditionDefinition`
 * entry of its own (exhaustion is a numeric level, not a boolean condition —
 * see the module comment above). PHB Appendix A: level 1 grants disadvantage
 * on ability checks; level 3 additionally grants disadvantage on attack rolls
 * and saving throws (cumulative with level 1's effect). Levels 2/4/5/6 (speed
 * halved, hp max halved, speed 0, death) don't affect d20 rolls, so they have
 * no representation here — their text lives in the frontend's
 * exhaustionEffect().
 */
export function exhaustionRollEffects(level: number): RollEffect[] {
  if (level < 1) return [];
  const effects: RollEffect[] = [{ mode: "disadvantage", kind: "check" }];
  if (level >= 3) {
    effects.push({ mode: "disadvantage", kind: "attack" });
    effects.push({ mode: "disadvantage", kind: "save" });
  }
  return effects;
}
