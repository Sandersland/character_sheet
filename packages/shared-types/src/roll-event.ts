// Roll-event wire type (#1235) — the single cross-tier shape for the `data`
// JSON persisted on a roll-category CharacterEvent (POST .../sessions/:id/roll).
// useRollLogger/logRoll and parseRollInput/logRollEvent all read/write this
// shape instead of hand-mirroring it (epic #820); it doubles as the request
// payload AND the persisted `data` column (free-form JSON, no schema of its
// own). Additive-only: every field beyond the original five is optional, so
// pre-#1235 events still parse under this type.

/** The five roll-log categories over the session-roll route. */
export type RollEventKind = "attack" | "damage" | "check" | "save" | "initiative";

export type RollEventMode = "normal" | "advantage" | "disadvantage";

/**
 * Hit/miss/crit call for an attack roll, threaded from the turn-state tally
 * (mirrors `TallyVerdict`): nat-20/nat-1 auto-verdict, otherwise player-called
 * via "Call it". Never computed against a target's AC — the engine has no
 * enemy/target model (self-or-announce, CLAUDE.md).
 */
export type RollEventVerdict = "hit" | "miss" | "crit";

/**
 * One provenance-labeled source contributing advantage/disadvantage or a flat
 * modifier to a d20 roll (mirrors frontend's `RollModifier` / backend's
 * `RollEffect & { source }`, kept structural here rather than imported so this
 * package stays free of that mirror). Persisted as structure, not the
 * formatted "why" chip string — wording can change; a log entry shouldn't freeze it.
 */
export interface RollEventModeSource {
  mode: "advantage" | "disadvantage" | "flat";
  kind: "attack" | "check" | "save" | "initiative";
  ability?: string;
  modifier?: number;
  source: string;
}

/**
 * Decomposed to-hit addends for a weapon attack roll (`deriveWeaponAttackComponents`).
 * `abilityMod + proficiencyBonus + rangedBonus + attackRollBonus` is the flat
 * half of `total`; the rest is the d20 plus any flat roll-mode modifier
 * (exhaustion), which is why the four do not sum to `total` on their own.
 */
export interface RollEventAttackComponents {
  abilityMod: number;
  /** The proficiency bonus actually applied — 0 (not omitted) when not proficient. */
  proficiencyBonus: number;
  rangedBonus: number;
  attackRollBonus: number;
}

/**
 * Decomposed damage addends for a weapon damage roll (`deriveWeaponDamage`).
 * `abilityMod + meleeDamageBonus` sums to the damage roll's flat modifier.
 */
export interface RollEventDamageComponents {
  abilityMod: number;
  meleeDamageBonus: number;
}

/**
 * `data` on a roll-category `CharacterEvent` (`POST .../sessions/:sessionId/roll`).
 * `target`/`outcome` are RESERVED for a future per-swing "Goblin hit/dropped"
 * annotation — no producer populates them; the engine has no enemy/target
 * model and building one is an explicit non-goal (self-or-announce, CLAUDE.md).
 */
export interface RollEventData {
  kind: RollEventKind;
  source: string;
  total: number;
  specLabel?: string;
  damageType?: string;
  /** Raw kept die faces (non-dropped), e.g. [12] for 1d20 or [3, 5] for 2d6. */
  faces?: number[];
  /**
   * The non-kept d20 face(s) of an advantage/disadvantage roll — absent for a
   * normal roll and for pre-existing events logged before this field existed.
   * Currently at most one element; the drill-in display reads only the first.
   */
  droppedFaces?: number[];
  /** Ability key for check/save/initiative rolls — source carries the display text. */
  ability?: string;
  /** Skill key for check rolls. */
  skill?: string;
  /** Target difficulty class, when the roll is made against one. */
  dc?: number;
  /** Advantage state the d20 was rolled with. */
  rollMode?: RollEventMode;

  /**
   * Correlates an attack roll event with its damage roll event as one swing.
   * Client-generated (crypto.randomUUID) — NOT the same as the route's
   * server-side `batchId`, which is minted fresh per HTTP request and so
   * can't span the attack call and the separate damage call. Do not conflate
   * or "dedupe" the two ids; they answer different questions.
   */
  swingId?: string;
  /**
   * Set on attack rolls (auto nat-20/nat-1, else player-called) and on damage
   * rolls (an unset verdict resolves to "hit" the moment damage lands) — see
   * `RollEventVerdict`.
   */
  verdict?: RollEventVerdict;
  /** True natural 20 kept on the d20 (attack rolls only). */
  nat20?: boolean;
  /** True natural 1 kept on the d20 (attack rolls only). */
  nat1?: boolean;
  /**
   * Attack rolls: the nat-20 fact only — a manual "Crit!" call hasn't happened
   * yet at attack-roll time. Damage rolls: the EFFECTIVE crit (nat20 OR a
   * manual call) that decided whether this roll's dice were doubled.
   */
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
