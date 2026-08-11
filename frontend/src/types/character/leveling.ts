/**
 * Advancement / feat / XP / level-up-ceremony wire types and their operations.
 */
import type {
  LearnExpertiseOperation,
  LearnManeuverOperation,
  LearnSubclassChoiceOperation,
  LearnToolProficiencyOperation,
} from "./classes";
import type { LevelUpTarget } from "./combat";
import type { ForgetSpellOperation, LearnSpellOperation, SpellSchool } from "./spells";

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
  /** PHB'24 Origin feat from a background (#1130): slot-exempt, not removable. */
  origin?: true;
  /** Fighting Style feat (#1137): occupies a fightingStyle slot, not an ASI slot. */
  slot?: "fightingStyle";
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
  /** #1137: routes a Fighting Style feat through its own slot partition. */
  slot?: "fightingStyle";
}

export interface RemoveAdvancementOperation {
  type: "removeAdvancement";
  entryId: string;
}

export type AdvancementOperation =
  | TakeAsiOperation
  | TakeFeatOperation
  | RemoveAdvancementOperation;

// XP ops are derived from the route zod schema in @character-sheet/contracts
// (#1390) — `import type` only, so zod never enters the client bundle. Sent as
// `{ operations: ExperienceOperation[] }` to POST /api/characters/:id/experience.
// Only the union forwards: the award/set member types have zero frontend call
// sites, and a forwarded-only name is a dead export under the fallow gate.
export type { ExperienceOperation } from "@character-sheet/contracts";

/** Mirror of the backend `LevelUpStepKind` (buildLevelUpPlan). */
export type LevelUpStepKind =
  | "hitPoints"
  | "advancement"
  | "subclass"
  | "maneuvers"
  | "fightingStyleFeat"
  | "toolProficiency"
  | "expertise"
  | "subclassChoice"
  | "newSpells"
  | "review";

/** One ceremony step. `meta.key`/`meta.label` identify a subclassChoice step. */
export interface LevelUpStep {
  kind: LevelUpStepKind;
  count?: number;
  meta?: Record<string, unknown>;
}

/**
 * The `hitPoints` step's served meta (#1380). Every number is resolved by the
 * backend planner from the functions the level-up transaction commits with, for
 * the class this level-up actually advances — the client renders them and never
 * re-derives them. Read through `readHitPointsMeta`.
 */
export interface HitPointsStepMeta {
  die: string;
  faces: number;
  conMod: number;
  /**
   * The die's Con-free fixed average (d6→4 … d12→7). Served separately because
   * the max(1, …) level-up floor makes it unrecoverable as averageGain − conMod.
   */
  fixedAverage: number;
  averageGain: number;
  minRoll: number;
  maxRoll: number;
  /**
   * #1497: the post-level EFFECTIVE max under "average" — the same
   * composition `character.hitPoints.max` serves (effectiveMaxHitPoints,
   * backend hp-core.ts), routed through the advancing die's average gain. NOT
   * `character.hitPoints.max + averageGain`: at 2014 exhaustion 4+ (PHB'14
   * p. 291) the halving grows with the new max too, so that addition can
   * disagree with what the level-up transaction actually commits — the
   * client renders this served number instead of re-deriving the halving.
   */
  effectiveMaxAverage: number;
  /**
   * #1497: the post-level EFFECTIVE max per roll outcome, indexed 1..faces
   * (index 0 is an inert placeholder, never a roll value) — read via
   * `effectiveMaxForRoll` rather than `array[roll - 1]`.
   */
  effectiveMaxByRoll: number[];
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
    /**
     * #1509 D5: the served known-vs-prepared model for this target (null/absent
     * for a non-caster). Drives the Review step's granted-spells footnote noun;
     * the newSpells step itself carries the SAME fact on its own
     * `meta.casterModel` (read via readNewSpellsMeta) — this is the top-level
     * echo for steps/cards that render outside that step, e.g. GrantedSpellsCard.
     * Optional (not every fixture across the ceremony's ~15 test files sets it)
     * — callers fall back to "prepared", the majority model.
     */
    casterModel?: "known" | "prepared" | null;
  };
  steps: LevelUpStep[];
  /** Subclass spells this level newly grants — always present ([] when none); shown in Review (#1139, #1159). */
  grantedSpells: { name: string; level: number; school: SpellSchool }[];
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
  /** #1137: a Fighting Style feat pick — a takeFeat op (server forces the fs slot). */
  fightingStyleFeat?: TakeFeatOperation;
  maneuvers?: LearnManeuverOperation[];
  toolProficiencies?: LearnToolProficiencyOperation[];
  /** #1588: Expertise skill picks — freely reversible, no ceremony forget/swap. */
  expertise?: LearnExpertiseOperation[];
  subclassChoices?: LearnSubclassChoiceOperation[];
  spellsLearned?: LearnSpellOperation[];
  /** #1131: new cantrips this level — counted against the newSpells step's meta.cantrips. */
  cantripsLearned?: LearnSpellOperation[];
  /** #1101: the one optional known-spell swap forget, offset by an extra learn. */
  spellsForgotten?: ForgetSpellOperation[];
}
