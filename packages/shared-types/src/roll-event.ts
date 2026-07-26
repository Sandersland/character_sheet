// Roll-event wire type (#1235) — the single cross-tier shape for the `data`
// JSON persisted on a roll-category CharacterEvent (POST .../sessions/:id/roll).
// Frontend's useRollLogger/api/session.ts and backend's parseRollInput/
// logRollEvent both read/write this same shape instead of hand-mirroring it
// (epic #820) — it is BOTH the request payload and the persisted `data` column,
// since the column is free-form JSON with no schema of its own.
//
// Additive-only: every field beyond the original five (kind/source/total) is
// optional, so pre-#1235 events (and rolls that don't carry the new data, e.g.
// a bare check/save) still parse under this type.

/** The five roll-log categories over the session-roll route. */
export type RollEventKind = "attack" | "damage" | "check" | "save" | "initiative";

export type RollEventMode = "normal" | "advantage" | "disadvantage";

/**
 * Hit/miss/crit call for an attack roll, threaded from the turn-state tally
 * (attackTallySummary.ts's TallyVerdict): nat-20/nat-1 auto-verdict, otherwise
 * player-called via "Call it". Never computed against a target's AC — the
 * engine has no enemy/target model (self-or-announce, CLAUDE.md).
 */
export type RollEventVerdict = "hit" | "miss" | "crit";

/**
 * One provenance-labeled source contributing advantage/disadvantage or a flat
 * modifier to a d20 roll (mirrors frontend's `RollModifier` / backend's
 * `lib/srd/roll-effects.ts` `RollEffect & { source }`, kept structural here
 * rather than imported so this package stays free of that pre-existing,
 * out-of-scope mirror). Persisted as structure, NOT the formatted "why" chip
 * string (`rollModeChip`) — wording can change; a durable log entry shouldn't
 * freeze it.
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
 * `abilityMod + proficiencyBonus + rangedBonus + attackRollBonus` sums to the
 * attack event's `total` minus any manual roll-mode flat modifier — see
 * `RollEventData.total` for what it composes with.
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
 *
 * `target`/`outcome` are RESERVED for a future per-swing "Goblin hit / dropped"
 * annotation (#1235) — infra only. No producer populates them today, and none
 * should until an actual target/outcome feature is built: the engine has no
 * enemy/target model, and building one is an explicit product non-goal
 * (self-or-announce, CLAUDE.md). Leave them unset.
 */
export interface RollEventData {
  kind: RollEventKind;
  source: string;
  total: number;
  specLabel?: string;
  damageType?: string;
  /** Raw kept die faces (non-dropped), e.g. [12] for 1d20 or [3, 5] for 2d6. */
  faces?: number[];
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
  /** Attack rolls only — see `RollEventVerdict`. */
  verdict?: RollEventVerdict;
  /** True natural 20 kept on the d20 (attack rolls only). */
  nat20?: boolean;
  /** True natural 1 kept on the d20 (attack rolls only). */
  nat1?: boolean;
  /** Effective crit (nat20 OR a manual "Crit!" call) — drives damage-dice doubling. */
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
