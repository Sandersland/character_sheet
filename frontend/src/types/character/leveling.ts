/**
 * Advancement / feat / XP wire types and their operations.
 */

/**
 * A structured mechanical effect defined on a catalog or custom feat.
 * Snapshot into AdvancementEntry.improvements at take-time.
 */
export interface FeatImprovement {
  /** Numeric: "initiative" | "speed" | "armorClass" | "maxHp"
   *  Combat:  "unarmedDamageDie" (amount = die faces, e.g. 4 → d4; max across feats)
   *  Keyed:   "skillProficiency" | "savingThrowProficiency" (require `key`) */
  target: string;
  amount: number;
  perLevel?: boolean; // true → effective bonus = amount × hitDice.total (e.g. Tough)
  /** Skill name for skillProficiency; ability name for savingThrowProficiency. */
  key?: string;
}

/**
 * One taken Ability Score Improvement or feat on a character.
 * Mirrors the backend `AdvancementEntry`.
 */
export interface AdvancementEntry {
  id: string;
  level: number;
  kind: "asi" | "feat";
  /** Score bumps applied: e.g. { strength: 2 } or { dexterity: 1, constitution: 1 } */
  abilityDeltas: Record<string, number>;
  /** HP delta added to max/current at time of choice. */
  hpDelta: number;
  /** Initiative delta added at time of choice. */
  initDelta: number;
  featId?: string;
  featName?: string;
  featDescription?: string;
  /** Snapshot of the feat's structured mechanical effects. Applied as a read-time bonus layer. */
  improvements?: FeatImprovement[];
}

/** Slot count summary for advancement choices. */
export interface AdvancementSlots {
  total: number;
  used: number;
}

/** Catalog feat served by GET /api/feats. */
export interface CatalogFeat {
  id: string;
  name: string;
  description: string;
  prerequisite?: string;
  /** Ability names the player may choose to bump by abilityIncrease. Empty = not a half-feat. */
  abilityOptions: string[];
  /** Usually 1 for half-feats; 0 for full feats. */
  abilityIncrease: number;
  /** Structured static effects applied as a read-time bonus when this feat is active. */
  improvements: FeatImprovement[];
}

/**
 * Advancement operation types — mirror of `applyAdvancementOperations`. Sent as
 * `{ operations: AdvancementOperation[] }` to POST /api/characters/:id/advancement/transactions.
 */
export interface TakeAsiOperation {
  type: "takeAsi";
  increases: { ability: string; amount: 1 | 2 }[];
}

export interface TakeFeatOperation {
  type: "takeFeat";
  featId?: string;
  custom?: {
    name: string;
    description: string;
    improvements?: FeatImprovement[];
    /** Ability names the player may choose for a half-feat-style bump. */
    abilityOptions?: string[];
    /** Amount to apply to the chosen ability (default 1). */
    abilityIncrease?: number;
  };
  /** Required when taking a half-feat (catalog or custom) with abilityOptions. */
  abilityChoice?: string;
}

export interface RemoveAdvancementOperation {
  type: "removeAdvancement";
  entryId: string;
}

export type AdvancementOperation =
  | TakeAsiOperation
  | TakeFeatOperation
  | RemoveAdvancementOperation;

/**
 * XP operation types — mirror of `applyExperienceOperations`. Sent as
 * `{ operations: ExperienceOperation[] }` to POST /api/characters/:id/experience.
 *
 * Award or deduct XP by a signed delta.
 */
export interface XpAwardOperation { type: "award"; amount: number }

/** Set total XP to an exact value. */
export interface XpSetOperation { type: "set"; value: number }

export type ExperienceOperation = XpAwardOperation | XpSetOperation;
