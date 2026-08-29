// Doubles as the `logRoll` op payload and the persisted `data` column (free-form JSON, no schema of its own).
// Additive-only: every field beyond the original five is optional, so older events still parse.

/** The five roll-log categories carried by a `logRoll` op / roll-category event. */
export type RollEventKind = "attack" | "damage" | "check" | "save" | "initiative";

export type RollEventMode = "normal" | "advantage" | "disadvantage";

/**
 * Mirrors `TallyVerdict` — nat-20/nat-1 auto-verdict, otherwise player-called
 * via "Call it". Never computed against a target's AC — no enemy/target model
 * (self-or-announce).
 */
export type RollEventVerdict = "hit" | "miss" | "crit";

/** Persisted as structure, not the formatted "why" chip string — wording can change without invalidating old log entries. */
export interface RollEventModeSource {
  mode: "advantage" | "disadvantage" | "flat";
  kind: "attack" | "check" | "save" | "initiative";
  ability?: string;
  modifier?: number;
  source: string;
}

/** `abilityMod + proficiencyBonus + rangedBonus + attackRollBonus` is only the flat half of `total` — the rest is the d20 roll plus any flat roll-mode modifier (e.g. exhaustion). */
export interface RollEventAttackComponents {
  abilityMod: number;
  /** The proficiency bonus actually applied — 0 (not omitted) when not proficient. */
  proficiencyBonus: number;
  rangedBonus: number;
  attackRollBonus: number;
  /**
   * Absent on events logged before this field existed — renderers fall back to
   * a neutral label. Deliberately `string`, not a key union — matches
   * `RollEventModeSource.ability`'s treatment of unvalidated persisted JSON;
   * don't narrow it.
   */
  ability?: string;
}

/** `abilityMod + meleeDamageBonus` sums to the damage roll's flat modifier. */
export interface RollEventDamageComponents {
  abilityMod: number;
  meleeDamageBonus: number;
  /**
   * Absent on events logged before this field existed — renderers fall back to
   * a neutral label. Deliberately `string`, not a key union — matches
   * `RollEventModeSource.ability`'s treatment of unvalidated persisted JSON;
   * don't narrow it.
   */
  ability?: string;
}

/**
 * `data` on a roll-category `CharacterEvent` (written by the `logRoll` op).
 * `target`/`outcome` are RESERVED for a future per-swing annotation — no
 * producer populates them yet (no enemy/target model today).
 */
export interface RollEventData {
  kind: RollEventKind;
  source: string;
  total: number;
  specLabel?: string;
  damageType?: string;
  /** Raw kept die faces (non-dropped), e.g. [12] for 1d20 or [3, 5] for 2d6. */
  faces?: number[];
  /** The non-kept d20 face(s) under advantage/disadvantage — absent otherwise and on pre-existing events; currently at most one element, and the drill-in reads only the first. */
  droppedFaces?: number[];
  /** Ability key for check/save/initiative rolls — source carries the display text. */
  ability?: string;
  /** Skill key for check rolls. */
  skill?: string;
  /** Target difficulty class, when the roll is made against one. */
  dc?: number;
  rollMode?: RollEventMode;

  /**
   * Correlates an attack-roll event with its damage-roll event as one swing.
   * Client-generated (crypto.randomUUID) — not the route's server-side
   * `batchId`; don't conflate the two ids.
   */
  swingId?: string;
  /** Set on attack rolls (auto nat-20/nat-1, else player-called) and on damage rolls (an unset verdict resolves to "hit" the moment damage lands). */
  verdict?: RollEventVerdict;
  /** True natural 20 kept on the d20 (attack rolls only). */
  nat20?: boolean;
  /** True natural 1 kept on the d20 (attack rolls only). */
  nat1?: boolean;
  /** Attack rolls: the nat-20 fact only, before any manual "Crit!" call. Damage rolls: the effective crit (nat20 or a manual call) that doubled this roll's dice. */
  crit?: boolean;
  /** Structured advantage/disadvantage/flat-modifier sources (attack rolls only). */
  modeSources?: RollEventModeSource[];
  /** Decomposed to-hit math (attack rolls only). */
  attackComponents?: RollEventAttackComponents;
  /** Decomposed damage math (damage rolls only). */
  damageComponents?: RollEventDamageComponents;

  /** RESERVED — see the type-level doc comment. Never populated. */
  target?: { name: string };
  /** RESERVED — see the type-level doc comment. Never populated. */
  outcome?: string;
}
