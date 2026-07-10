// The 14 standard 5e status conditions (PHB Appendix A). This is the single
// source of truth for condition rules data — the frontend resolves display text
// through a label map derived from these keys, never by rendering raw keys.
// Exhaustion is intentionally NOT in this list: it is a single 0–6 level handled
// as a special case (see EXHAUSTION_MAX below; per-level effect text lives in the
// frontend's lib/conditions.ts), not a boolean presence in the active-conditions
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

export interface ConditionDefinition {
  key: ConditionKey;
  label: string;
  description: string;
}

export const CONDITIONS: readonly ConditionDefinition[] = [
  {
    key: "blinded",
    label: "Blinded",
    description:
      "Can't see and automatically fails any ability check that requires sight. Attack rolls against the creature have advantage, and its attack rolls have disadvantage.",
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
  },
  {
    key: "prone",
    label: "Prone",
    description:
      "Can only crawl unless it stands up. Has disadvantage on attack rolls. An attack roll against it has advantage if the attacker is within 5 feet; otherwise the attack roll has disadvantage.",
  },
  {
    key: "restrained",
    label: "Restrained",
    description:
      "Speed becomes 0, and it can't benefit from any bonus to its speed. Attack rolls against it have advantage, and its attack rolls have disadvantage. Has disadvantage on Dexterity saving throws.",
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
