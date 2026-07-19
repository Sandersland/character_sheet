// The 14 standard 5e status conditions (SRD 5.2). This is the single
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
      "Can't attack the charmer or target it with damaging abilities or magical effects. The charmer has advantage on any ability check to interact socially with the creature.",
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
      "Speed is 0 and can't increase. Has disadvantage on attack rolls against any target other than the grappler. The grappler can drag or carry the creature when it moves, but every foot of movement costs it 1 extra foot unless the creature is Tiny or two or more sizes smaller than the grappler.",
    rollEffects: [{ mode: "disadvantage", kind: "attack" }],
  },
  {
    key: "incapacitated",
    label: "Incapacitated",
    description:
      "Can't take any action, Bonus Action, or Reaction. Concentration is broken, and the creature can't speak. If it is incapacitated when it rolls Initiative, it has disadvantage on the roll.",
    rollEffects: [{ mode: "disadvantage", kind: "initiative" }],
  },
  {
    key: "invisible",
    label: "Invisible",
    description:
      "If invisible when it rolls Initiative, it has advantage on the roll. Isn't affected by any effect that requires its target to be seen unless the effect's creator can somehow see it, and any equipment it wears or carries is also concealed. Attack rolls against the creature have disadvantage, and its attack rolls have advantage; a creature that can somehow see it ignores this benefit.",
    rollEffects: [
      { mode: "advantage", kind: "initiative" },
      { mode: "advantage", kind: "attack" },
    ],
  },
  {
    key: "paralyzed",
    label: "Paralyzed",
    description:
      "Has the Incapacitated condition, and its Speed is 0 and can't increase. Automatically fails Strength and Dexterity saving throws. Attack rolls against it have advantage, and any attack that hits it from within 5 feet is a critical hit.",
    // Conditions that include Incapacitated inherit its initiative disadvantage; buildRollModifiers does no inheritance walk, so it's flattened per-condition (SRD 5.2).
    rollEffects: [{ mode: "disadvantage", kind: "initiative" }],
  },
  {
    key: "petrified",
    label: "Petrified",
    description:
      "Transformed, along with any nonmagical object it is wearing or carrying, into a solid inanimate substance (usually stone); its weight increases tenfold and it ceases aging. Has the Incapacitated condition and its Speed is 0. Automatically fails Strength and Dexterity saving throws, and attack rolls against it have advantage. Has resistance to all damage and immunity to the Poisoned condition.",
    rollEffects: [{ mode: "disadvantage", kind: "initiative" }],
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
      "Its only movement options are to crawl or to spend half its Speed (round down) to right itself and end the condition; if its Speed is 0, it can't right itself. Has disadvantage on attack rolls. An attack roll against it has advantage if the attacker is within 5 feet; otherwise the attack roll has disadvantage.",
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
      "Has the Incapacitated condition. Automatically fails Strength and Dexterity saving throws, and attack rolls against it have advantage.",
    rollEffects: [{ mode: "disadvantage", kind: "initiative" }],
  },
  {
    key: "unconscious",
    label: "Unconscious",
    description:
      "Has the Incapacitated and Prone conditions and drops whatever it is holding; when the condition ends, it remains Prone. Its Speed is 0. Automatically fails Strength and Dexterity saving throws, and attack rolls against it have advantage; any attack that hits it from within 5 feet is a critical hit. Unaware of its surroundings.",
    rollEffects: [
      { mode: "disadvantage", kind: "initiative" },
      { mode: "disadvantage", kind: "attack" },
    ],
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
