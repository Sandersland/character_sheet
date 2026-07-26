// The 14 standard 5e status conditions, for both editions: CONDITIONS is the
// SRD 5.2 baseline and CONDITIONS_2014_OVERRIDES varies the nine that differ,
// resolved by conditionDefinition. This is the single
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

import type { RulesEdition } from "@character-sheet/shared-types";

import type { RollEffect, RollModeKind } from "./roll-effects.js";

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
 * PHB'14 pp. 290-292 (Appendix A) overrides for the 9 conditions that diverge
 * from SRD 5.2's text: charmed, grappled, incapacitated, invisible,
 * paralyzed, petrified, prone, stunned, unconscious (#1309, restoring the
 * 2014 half of what #1135's SRD-5.2 retranscription replaced). Sparse on
 * purpose — the other 5 conditions (blinded, deafened, frightened, poisoned,
 * restrained) are byte-identical across editions and must resolve through
 * the single CONDITIONS row below, not a duplicated one. Both editions'
 * Incapacitated is inherited by paralyzed/petrified/stunned/unconscious
 * (PHB'14 p. 291 says so explicitly, same as SRD 5.2) — the difference is
 * that PHB'14's Incapacitated carries no d20-roll effect to inherit (it's
 * just "can't take actions or reactions"), while SRD 5.2's adds disadvantage
 * on Initiative. So the inheritance is real in both editions; it just
 * produces nothing in 2014. An explicit `rollEffects: undefined` below
 * clears that 2024-only initiative grant.
 */
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
    // The pre-cutover row had no rollEffects at all, despite its own description
    // promising advantage on its attacks — a transcription gap, not a 2014 rule.
    // This is a deliberate fix, not a restore: don't drop it chasing byte-parity
    // with history.
    rollEffects: [{ mode: "advantage", kind: "attack" }],
  },
  paralyzed: {
    description:
      "Incapacitated and can't move or speak. Automatically fails Strength and Dexterity saving throws. Attack rolls against it have advantage, and any attack that hits from within 5 feet is a critical hit.",
    rollEffects: undefined,
  },
  petrified: {
    // PHB'14 p. 291: the auto-failed saves and advantage-to-hit clauses are
    // real Appendix A text a prior transcription dropped — restored here, not
    // added. "Attack rolls against it" targets another creature, so per the
    // self-or-announce rule it's description text only, not a rollEffects entry.
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
    // Both editions' Unconscious inherits Prone (falls prone) as well as
    // Incapacitated. 2014 Prone still grants disadvantage on attack (see
    // `prone` above, unchanged from 2024), so that flattens through here too —
    // only the Incapacitated-sourced initiative grant is 2024-only. Mechanically
    // moot (an unconscious creature can't attack) but keeps both editions
    // modeling the same inheritance instead of one silently dropping it.
    rollEffects: [{ mode: "disadvantage", kind: "attack" }],
  },
};

/**
 * The one lookup for a condition's rules text/effects (#1309) — every call
 * site that needs edition-sensitive data resolves through here, so a future
 * edition fork only has to touch this function. Reading CONDITIONS directly
 * stays correct for the edition-invariant fields (keys, labels).
 * `key` is guaranteed present in CONDITIONS by the ConditionKey type, so the
 * lookup below always succeeds.
 * `label` never forks: CONDITIONS_2014_OVERRIDES' value type has no `label`
 * field, so `tsc` itself rejects an attempt to override it — a caller that
 * only needs a condition's label (e.g. `conditionLabel`) can stay edition-free
 * by construction, not by convention.
 */
export function conditionDefinition(key: ConditionKey, edition: RulesEdition): ConditionDefinition {
  const base = CONDITIONS.find((c) => c.key === key)!;
  if (edition !== "EDITION_2014") return base;
  const override = CONDITIONS_2014_OVERRIDES[key];
  return override ? { ...base, ...override } : base;
}

// The four d20 Test categories a flat exhaustion penalty binds to. Initiative is
// a Dex check, so it's an explicit entry (SRD 5.2 "d20 Tests" cover it).
const EXHAUSTION_ROLL_KINDS: RollModeKind[] = ["attack", "check", "save", "initiative"];

// PHB'14 p. 291 (Appendix A): cumulative disadvantage tiers, not a flat
// modifier. Tier 1's "disadvantage on ability checks" must also cover
// Initiative here — RollModeKind splits `initiative` out as its own kind (it
// isn't folded into `check`), but under 2014 Initiative *is* a Dexterity
// check (PHB'14 p. 189), so a `check`-only effect would silently miss it.
// Tier 4 (HP max halved) and tier 5 (Speed 0) have no roll-effect shape and
// are handled elsewhere (tier 5 in exhaustionSpeedPenalty; tier 4 is out of
// scope for #1307 — it touches derived max HP, not rolls).
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

/**
 * Synthetic roll-effect grants for a given exhaustion level (#1136/#1307),
 * mirroring the standard conditions' `rollEffects` shape without a
 * `ConditionDefinition` entry of its own (exhaustion is a numeric level, not a
 * boolean condition — see the module comment above). 2024 (SRD 5.2): each
 * exhaustion level applies a flat −2 to every d20 Test (attack rolls, ability
 * checks, saving throws, Initiative), so the penalty is −2×level. 2014
 * (PHB'14): tiered disadvantage instead of a flat number — see
 * exhaustionRollEffects2014. Either way, the Speed reduction (see
 * exhaustionSpeedPenalty) and death at level 6 are handled elsewhere.
 */
export function exhaustionRollEffects(level: number, edition: RulesEdition): RollEffect[] {
  if (edition === "EDITION_2014") return exhaustionRollEffects2014(level);
  if (level < 1) return [];
  const modifier = -2 * level;
  return EXHAUSTION_ROLL_KINDS.map((kind) => ({ mode: "flat", modifier, kind }));
}

/**
 * Speed reduction (feet) from exhaustion. 2024 (SRD 5.2): −5 ft per level.
 * 2014 (PHB'14 p. 291): 0 below level 2; levels 2-4 halve current Speed
 * (base + all bonuses), rounded down like Prone's half-Speed; level 5+ floors
 * to exactly 0. Returns the amount SUBTRACTED, not the result — so a
 * round-down result needs subtracting ceil(currentSpeed/2), not floor (floor
 * would round the result UP for an odd Speed, e.g. 25 → 13 instead of 12).
 */
export function exhaustionSpeedPenalty(level: number, currentSpeed: number, edition: RulesEdition): number {
  if (edition === "EDITION_2014") {
    if (level < 2) return 0;
    if (level < 5) return Math.ceil(currentSpeed / 2);
    return currentSpeed;
  }
  return 5 * Math.max(0, level);
}
