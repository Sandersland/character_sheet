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

import type { RulesEdition } from "@character-sheet/shared-types";

import type { RollEffect, RollModeKind } from "./roll-effects.js";

export interface ConditionDefinition {
  key: ConditionKey;
  label: string;
  description: string;
  // Merged into rollModifiers on read (#486).
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
    // Initiative is a Dexterity check (SRD 5.2 / PHB'14 p. 189), so this makes the ability-check disadvantage above explicit (#1327).
    rollEffects: [
      { mode: "disadvantage", kind: "attack" },
      { mode: "disadvantage", kind: "check" },
      { mode: "disadvantage", kind: "initiative" },
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
    // Incapacitated's initiative disadvantage is flattened per-condition here; buildRollModifiers does no inheritance walk (SRD 5.2).
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
    // SRD 5.2 / PHB'14 p. 292 say only "ability checks" — description stays unedited; the rollEffects grant covers Initiative anyway (#1327).
    rollEffects: [
      { mode: "disadvantage", kind: "attack" },
      { mode: "disadvantage", kind: "check" },
      { mode: "disadvantage", kind: "initiative" },
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

// Level 6 = death.
export const EXHAUSTION_MAX = 6;

export function isKnownCondition(key: string): key is ConditionKey {
  return CONDITIONS.some((c) => c.key === key);
}

// PHB'14 pp. 290-292 overrides for the 9 conditions that diverge from SRD 5.2; the other 5 are byte-identical across editions and resolve through the single CONDITIONS row (#1309).
// `rollEffects: undefined` on an override is explicit, not omitted — {...base, ...override} needs it to clear base's 2024-only initiative grant.
const CONDITIONS_2014_OVERRIDES: Partial<Record<ConditionKey, { description: string; rollEffects?: RollEffect[] }>> = {
  charmed: {
    description:
      "Can't attack the charmer or target it with harmful abilities or magical effects. The charmer has advantage on ability checks to interact socially with the creature.",
  },
  grappled: {
    description:
      "Speed becomes 0, and it can't benefit from any bonus to its speed. The condition ends if the grappler is incapacitated or if the creature is moved out of reach.",
    rollEffects: undefined,
  },
  incapacitated: {
    description: "Can't take actions or reactions.",
    rollEffects: undefined,
  },
  invisible: {
    description:
      "Impossible to see without the aid of magic or a special sense. For the purpose of hiding, the creature is heavily obscured. Attack rolls against it have disadvantage, and its attack rolls have advantage.",
    rollEffects: [{ mode: "advantage", kind: "attack" }],
  },
  paralyzed: {
    description:
      "Incapacitated and can't move or speak. Automatically fails Strength and Dexterity saving throws. Attack rolls against it have advantage, and any attack that hits from within 5 feet is a critical hit.",
    rollEffects: undefined,
  },
  petrified: {
    // PHB'14 p. 291. "Attack rolls against it" targets another creature — self-or-announce keeps that as description text only, not a rollEffects entry.
    description:
      "Transformed, along with nonmagical objects it is wearing or carrying, into a solid inanimate substance; its weight increases by a factor of ten, and it ceases aging. Incapacitated, can't move or speak, and is unaware of its surroundings. Automatically fails Strength and Dexterity saving throws. Attack rolls against it have advantage. Resistant to all damage; immune to poison and disease.",
    rollEffects: undefined,
  },
  prone: {
    description:
      "Can only crawl unless it stands up. Has disadvantage on attack rolls. An attack roll against it has advantage if the attacker is within 5 feet; otherwise the attack roll has disadvantage.",
  },
  stunned: {
    description:
      "Incapacitated, can't move, and can speak only falteringly. Automatically fails Strength and Dexterity saving throws. Attack rolls against it have advantage.",
    rollEffects: undefined,
  },
  unconscious: {
    description:
      "Incapacitated, can't move or speak, and is unaware of its surroundings. Drops whatever it's holding and falls prone. Automatically fails Strength and Dexterity saving throws. Attack rolls against it have advantage, and any attack that hits from within 5 feet is a critical hit.",
    // Unconscious inherits Prone's attack disadvantage in both editions (unlike the Incapacitated-sourced initiative grant, which is 2024-only).
    rollEffects: [{ mode: "disadvantage", kind: "attack" }],
  },
};

// `key` is guaranteed present in CONDITIONS by the ConditionKey type.
export function conditionDefinition(key: ConditionKey, edition: RulesEdition): ConditionDefinition {
  const base = CONDITIONS.find((c) => c.key === key)!;
  switch (edition) {
    case "EDITION_2024":
      return base;
    case "EDITION_2014": {
      const override = CONDITIONS_2014_OVERRIDES[key];
      return override ? { ...base, ...override } : base;
    }
    default: {
      const exhaustive: never = edition;
      throw new Error(`conditionDefinition: unhandled edition ${String(exhaustive)}`);
    }
  }
}

// Served on GET /api/reference (#1322).
export interface ConditionRulesTextRow {
  key: ConditionKey;
  label: string;
  description: string;
}

// rollEffects is deliberately dropped — client already gets resolved rollModifiers (buildRollModifiers).
// Sorted by label to match the frontend's CONDITION_ORDER — the two must not disagree.
export function conditionRulesText(edition: RulesEdition): ConditionRulesTextRow[] {
  return CONDITIONS.map(({ key }) => {
    const { label, description } = conditionDefinition(key, edition);
    return { key, label, description };
  }).sort((a, b) => a.label.localeCompare(b.label));
}

// SRD 5.2 "d20 Tests" include Initiative as a Dex check, hence its own entry.
const EXHAUSTION_ROLL_KINDS: RollModeKind[] = ["attack", "check", "save", "initiative"];

// PHB'14 p. 291: cumulative disadvantage tiers. Tier 1 covers Initiative too (a Dexterity check under 2014, PHB'14 p. 189) since RollModeKind splits it out from `check`.
// Tiers 4/5 have no roll-effect shape — see exhaustionMaxHpPenalty/exhaustionSpeedPenalty.
function exhaustionRollEffects2014(level: number): RollEffect[] {
  const effects: RollEffect[] = [];
  if (level >= 1) {
    effects.push({ mode: "disadvantage", kind: "check" }, { mode: "disadvantage", kind: "initiative" });
  }
  if (level >= 3) {
    effects.push({ mode: "disadvantage", kind: "attack" }, { mode: "disadvantage", kind: "save" });
  }
  return effects;
}

// 2024 (SRD 5.2): flat −2×level on every d20 Test. 2014 (PHB'14): tiered disadvantage — see exhaustionRollEffects2014.
export function exhaustionRollEffects(level: number, edition: RulesEdition): RollEffect[] {
  switch (edition) {
    case "EDITION_2014":
      return exhaustionRollEffects2014(level);
    case "EDITION_2024": {
      if (level < 1) return [];
      const modifier = -2 * level;
      return EXHAUSTION_ROLL_KINDS.map((kind) => ({ mode: "flat", modifier, kind }));
    }
    default: {
      const exhaustive: never = edition;
      throw new Error(`exhaustionRollEffects: unhandled edition ${String(exhaustive)}`);
    }
  }
}

// 2024 (SRD 5.2): −5 ft per level. 2014 (PHB'14 p. 291): 0 below level 2; levels 2-4 halve current Speed rounded down (PHB'14 p. 7); level 5+ floors to 0.
// Returns the amount SUBTRACTED, not the result — use ceil(currentSpeed/2), not floor, or an odd Speed rounds the result up.
export function exhaustionSpeedPenalty(level: number, currentSpeed: number, edition: RulesEdition): number {
  switch (edition) {
    case "EDITION_2014": {
      if (level < 2) return 0;
      if (level < 5) return Math.ceil(currentSpeed / 2);
      return currentSpeed;
    }
    case "EDITION_2024":
      return 5 * Math.max(0, level);
    default: {
      const exhaustive: never = edition;
      throw new Error(`exhaustionSpeedPenalty: unhandled edition ${String(exhaustive)}`);
    }
  }
}

// PHB'14 p. 291 tier 4: hit point maximum halved. Returns the amount SUBTRACTED (ceil(currentMax/2), not floor — PHB'14 p. 7, "Round Down").
// `currentMax` must already include any feat bonus — see effectiveMaxHitPoints, which composes feat-bonus-then-penalty in that order. SRD 5.2 has no such tier; 2024 always returns 0.
export function exhaustionMaxHpPenalty(level: number, currentMax: number, edition: RulesEdition): number {
  switch (edition) {
    case "EDITION_2014":
      return level >= 4 ? Math.ceil(currentMax / 2) : 0;
    case "EDITION_2024":
      return 0;
    default: {
      const exhaustive: never = edition;
      throw new Error(`exhaustionMaxHpPenalty: unhandled edition ${String(exhaustive)}`);
    }
  }
}

// Clause order matches summarizeRollModifiers' categoryPhrase/KIND_ORDER — both render beside exhaustionRollEffects2014's grant in ConditionRollBanner and must agree.
function exhaustionEffectText2014(level: number): string {
  const disadvantageCategories =
    level >= 3 ? "attack rolls, ability checks, saving throws, and initiative" : "ability checks and initiative";
  const clauses = [`Disadvantage on ${disadvantageCategories}`];
  if (level >= 5) clauses.push("Speed 0");
  else if (level >= 2) clauses.push("Speed halved");
  // Enforced by exhaustionMaxHpPenalty/effectiveMaxHitPoints (#1321).
  if (level >= 4) clauses.push("HP maximum halved");
  return `${clauses.join("; ")}.`;
}

// Kept in this module (not the frontend) so this text can't drift from exhaustionRollEffects/exhaustionSpeedPenalty. PHB'14 p. 291 (2014) is cumulative tiered disadvantage — see exhaustionEffectText2014.
export function exhaustionEffectText(level: number, edition: RulesEdition): string {
  const clamped = Math.min(EXHAUSTION_MAX, Math.max(0, Math.trunc(level)));
  if (clamped === 0) return "No exhaustion.";
  if (clamped === EXHAUSTION_MAX) return "Death.";
  switch (edition) {
    case "EDITION_2014":
      return exhaustionEffectText2014(clamped);
    case "EDITION_2024":
      return `−${2 * clamped} on d20 Tests; Speed −${5 * clamped} ft.`;
    default: {
      const exhaustive: never = edition;
      throw new Error(`exhaustionEffectText: unhandled edition ${String(exhaustive)}`);
    }
  }
}
