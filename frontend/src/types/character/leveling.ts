/**
 * Advancement / feat / XP / level-up-ceremony wire types and their operations.
 */
import type {
  LearnDisciplineOperation,
  LearnManeuverOperation,
  LearnSubclassChoiceOperation,
  LearnToolProficiencyOperation,
} from "./classes";
import type { LevelUpTarget } from "./combat";
import type { ForgetSpellOperation, LearnSpellOperation } from "./spells";

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

/** PHB'24 feat categories — mirror of the backend FeatCategory. */
export type FeatCategory = "origin" | "general" | "fighting_style" | "epic_boon";

/** Catalog feat served by GET /api/feats. */
export interface CatalogFeat {
  id: string;
  name: string;
  description: string;
  category: FeatCategory;
  /** General ⇒ 4, Epic Boon ⇒ 19 (PHB'24). */
  levelPrerequisite?: number;
  repeatable?: boolean;
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

/** Mirror of the backend `LevelUpStepKind` (buildLevelUpPlan). */
export type LevelUpStepKind =
  | "hitPoints"
  | "advancement"
  | "subclass"
  | "maneuvers"
  | "fightingStyle"
  | "disciplines"
  | "toolProficiency"
  | "subclassChoice"
  | "newSpells"
  | "review";

/** One ceremony step. `meta.key`/`meta.label` identify a subclassChoice step. */
export interface LevelUpStep {
  kind: LevelUpStepKind;
  count?: number;
  meta?: Record<string, unknown>;
}

/** GET /api/characters/:id/level-up/plan — the derived ceremony plan (#886). */
export interface LevelUpPlanResponse {
  target: {
    className: string;
    /** Effective subclass: the pending pick when a subclassId query was sent, else the persisted one. */
    subclass: string | null;
    newLevel: number;
    /** False for a non-primary multiclass target — subclass/fightingStyle steps can't commit yet (#1065). */
    isPrimary: boolean;
  };
  steps: LevelUpStep[];
}

/**
 * POST /api/characters/:id/level-up/transactions body — sent as-is, NOT wrapped
 * in { operations }. Every field must exactly satisfy the plan's steps; the
 * server validates the match and applies the whole ceremony atomically.
 */
export interface LevelUpSubmission {
  target: LevelUpTarget;
  hp: { method: "average" | "roll"; roll?: number };
  advancement?: TakeAsiOperation | TakeFeatOperation;
  subclassId?: string;
  fightingStyle?: string;
  maneuvers?: LearnManeuverOperation[];
  disciplines?: LearnDisciplineOperation[];
  toolProficiencies?: LearnToolProficiencyOperation[];
  subclassChoices?: LearnSubclassChoiceOperation[];
  spellsLearned?: LearnSpellOperation[];
  /** #1101: the one optional known-spell swap forget, offset by an extra learn. */
  spellsForgotten?: ForgetSpellOperation[];
}
