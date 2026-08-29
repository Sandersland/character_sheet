import type {
  LearnExpertiseOperation,
  LearnManeuverOperation,
  LearnSubclassChoiceOperation,
  LearnToolProficiencyOperation,
} from "./classes";
import type { LevelUpTarget } from "./combat";
import type { ForgetSpellOperation, LearnSpellOperation, SpellSchool } from "./spells";

/** Snapshotted into `AdvancementEntry.improvements` at take-time. */
export interface FeatImprovement {
  /** "initiative"|"speed"|"armorClass"|"maxHp" (numeric); "unarmedDamageDie" (max across feats); "skillProficiency"|"savingThrowProficiency" (keyed, require `key`). */
  target: string;
  amount: number;
  perLevel?: boolean; // true → effective bonus = amount × hitDice.total
  /** Skill name for skillProficiency; ability name for savingThrowProficiency. */
  key?: string;
}

export interface AdvancementEntry {
  id: string;
  level: number;
  kind: "asi" | "feat";
  /** PHB'24 Origin feat from a background: slot-exempt, not removable. */
  origin?: true;
  /** Fighting Style feat: occupies a fightingStyle slot, not an ASI slot. */
  slot?: "fightingStyle";
  abilityDeltas: Record<string, number>;
  /** Added to max/current at time of choice. */
  hpDelta: number;
  /** Added at time of choice. */
  initDelta: number;
  featId?: string;
  featName?: string;
  featDescription?: string;
  /** Applied as a read-time bonus layer. */
  improvements?: FeatImprovement[];
}

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

/** Mirror of `applyAdvancementOperations`; sent as `{ operations: AdvancementOperation[] }` to POST /api/characters/:id/advancement/transactions. */
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
  /** Routes a Fighting Style feat through its own slot partition. */
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

// Sent as { operations: ExperienceOperation[] } to POST /api/characters/:id/experience.
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

/** Every number is resolved server-side; the client renders them and never re-derives them — read through `readHitPointsMeta`. */
export interface HitPointsStepMeta {
  die: string;
  faces: number;
  conMod: number;
  /** Served separately because the max(1, …) level-up floor makes it unrecoverable as `averageGain − conMod`. */
  fixedAverage: number;
  averageGain: number;
  minRoll: number;
  maxRoll: number;
  /** NOT `character.hitPoints.max + averageGain` — exhaustion halving can make that disagree; render this served number instead. */
  effectiveMaxAverage: number;
  /** Indexed 1..faces; index 0 is an inert placeholder — read via `effectiveMaxForRoll`, not `array[roll - 1]`. */
  effectiveMaxByRoll: number[];
}

/** GET /api/characters/:id/level-up/plan. */
export interface LevelUpPlanResponse {
  target: {
    className: string;
    /** Effective subclass: the pending pick when a subclassId query was sent, else the persisted one. */
    subclass: string | null;
    newLevel: number;
    /** False for a non-primary multiclass target — subclass/fightingStyle steps can't commit yet. */
    isPrimary: boolean;
    /** Absent/null for a non-caster; callers otherwise fall back to "prepared" when absent. */
    casterModel?: "known" | "prepared" | null;
  };
  steps: LevelUpStep[];
  /** Always present ([] when none). */
  grantedSpells: { name: string; level: number; school: SpellSchool }[];
}

/** POST /api/characters/:id/level-up/transactions body sent as-is, NOT wrapped in `{ operations }`. */
export interface LevelUpSubmission {
  target: LevelUpTarget;
  hp: { method: "average" | "roll"; roll?: number };
  advancement?: TakeAsiOperation | TakeFeatOperation;
  subclassId?: string;
  /** A Fighting Style feat pick — a takeFeat op (server forces the fs slot). */
  fightingStyleFeat?: TakeFeatOperation;
  maneuvers?: LearnManeuverOperation[];
  toolProficiencies?: LearnToolProficiencyOperation[];
  /** Freely reversible, no ceremony forget/swap. */
  expertise?: LearnExpertiseOperation[];
  subclassChoices?: LearnSubclassChoiceOperation[];
  spellsLearned?: LearnSpellOperation[];
  /** Counted against the newSpells step's meta.cantrips. */
  cantripsLearned?: LearnSpellOperation[];
  /** The one optional known-spell swap forget, offset by an extra learn. */
  spellsForgotten?: ForgetSpellOperation[];
}
