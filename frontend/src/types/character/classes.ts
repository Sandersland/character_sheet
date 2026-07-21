/**
 * Class-feature wire types: resources, maneuvers, disciplines, fighting styles, and their operations.
 */

import type { EffectSpec } from "@/lib/effects";

/** Ki (or other pool) cost of an activated ability. Mirror of backend AbilityCost. */
export type AbilityCost =
  | { kind: "pool"; key: string; base: number; perStep?: number }
  | { kind: "none" };

/** A Way of the Four Elements discipline from GET /api/disciplines. */
export interface CatalogDiscipline {
  id: string;
  name: string;
  description: string;
  minLevel: number;
  alwaysKnown: boolean;
  saveAbility?: string | null;
  cost: AbilityCost;
  effect: EffectSpec;
}

/** A Way of Shadow Shadow Art from GET /api/shadow-arts (flat 2-ki ki-cast spell). */
export interface CatalogShadowArt {
  id: string;
  name: string;
  description: string;
  minLevel: number;
  cost: AbilityCost;
  effect: EffectSpec;
}

/** How a Channel Divinity option expresses through the declarative core (#419). */
export type ChannelDivinityKind = "announce" | "buff" | "advantage" | "invisible" | "reminder";

/** An entitled Channel Divinity option from GET /api/characters/:id/channel-divinity (#419). */
export interface CatalogChannelDivinity {
  id: string;
  name: string;
  description: string;
  kind: ChannelDivinityKind;
  saveDc: number | null;
  saveAbility: string | null;
  reminder: string;
}

/** Class/subclass feature + resource-pool types. */
export type RechargeOn = "shortRest" | "longRest" | "short-or-long" | "none";

export interface ResourcePool {
  key: string;
  label: string;
  total: number;
  die?: string;        // e.g. "d8"
  recharge: RechargeOn;
  description?: string;
  used: number;
  remaining: number;
}

export interface ClassFeature {
  name: string;
  level: number;
  description: string;
  source: "class" | "subclass";
}

/**
 * Where a maneuver's session UI lives — resolved from catalog data (no longer a
 * hardcoded frontend table). "attackRoll"/"damageRoll" fold the die into that
 * roll; "reaction"/"attackOption" consume a slot with reminder text; "effect" is
 * a gold strip (Evasive Footwork, Rally).
 */
export type ManeuverPlacement =
  | "attackRoll"
  | "damageRoll"
  | "reaction"
  | "effect"
  | "attackOption";

/** A known maneuver entry on a character — per-character entry with catalog provenance. */
export interface ManeuverEntry {
  id: string;
  maneuverId?: string;   // catalog GrantedAbility.id provenance — undefined for custom
  name: string;
  description: string;
  // Session-UI routing snapshot from the catalog (undefined for custom/legacy
  // → session components treat as "damageRoll").
  placement?: ManeuverPlacement;
  actionSlot?: "bonusAction" | "reaction" | null;
}

/** Catalog maneuver served by GET /api/maneuvers. */
export interface CatalogManeuver {
  id: string;
  name: string;
  description: string;
  placement?: ManeuverPlacement;
  actionSlot?: "bonusAction" | "reaction" | null;
  saveAbility?: string | null;
}

/** Cast a known maneuver: spend one superiority die (the server rolls it). */
export interface CastManeuverOperation {
  type: "castManeuver";
  entryId: string;
}

export type ManeuverOperation = CastManeuverOperation;

/** Per-op result from POST …/maneuvers/transactions — die + announced save DC. */
export interface ManeuverCastResult {
  roll: number;
  saveDc: number | null;
  summary: string;
}

/** Per-op result from POST …/sneak-attack/transactions — the server-rolled Nd6. */
export interface SneakAttackRollResult {
  roll: number;
  dice: number;
  faces: number;
  summary: string;
}

/** A known elemental discipline entry on a character (Way of the Four Elements). */
export interface DisciplineEntry {
  id: string;
  disciplineId?: string;  // catalog Discipline.id provenance — undefined for custom
  name: string;
  description: string;
}

/**
 * One merged tool proficiency entry on the character wire type.
 * Creation-fixed profs (background/class/race) and level-gated subclass
 * profs (Student of War) are merged by serializeCharacter before sending.
 */
export interface ToolProficiency {
  name: string;
  category: "artisan" | "gamingSet" | "musicalInstrument" | "other";
  /** Where this proficiency came from ("item" = a magic item grant, #529). */
  source: "background" | "class" | "race" | "subclass" | "item";
}

/** Armor category that a character is proficient with. */
export type ArmorProficiencyCategory = "light" | "medium" | "heavy" | "shield";

/**
 * One armor proficiency entry — derived at read time from class + race + feats.
 * `category` identifies the armor type; `source` is the highest-priority origin
 * (class wins over race over feat when multiple sources would grant the same category).
 */
export interface ArmorProficiency {
  category: ArmorProficiencyCategory;
  source: "class" | "race" | "feat";
}

/**
 * One weapon proficiency entry — derived at read time from class + race + feats.
 * `name` may be a category ("Simple Weapons", "Martial Weapons") or a specific
 * weapon ("Longswords"). `source` is the highest-priority origin.
 */
export interface WeaponProficiency {
  name: string;
  source: "class" | "race" | "feat" | "item";
}

/** Level-gated tool proficiency entry within the resources JSON. */
export interface ToolProfEntry {
  id: string;   // per-character entry UUID
  name: string; // matches a TOOLS entry name
}

/** Derived class/subclass resource data merged with stored mutable state. */
export interface CharacterResources {
  features: ClassFeature[];
  maneuverChoiceCount?: number;
  maneuverSaveDC?: number;
  /** Way of the Four Elements: elemental disciplines known at this level. */
  disciplineChoiceCount?: number;
  /** Way of the Four Elements: ki save DC for discipline effects (8 + prof + Wis mod). */
  disciplineSaveDC?: number;
  /** Way of Shadow: whether the L3+ Shadow Arts ki-cast spells are available. */
  shadowArtsAvailable?: boolean;
  /** Way of Shadow: whether the L11+ Cloak of Shadows self-invisible toggle is available. */
  cloakOfShadowsAvailable?: boolean;
  /** Number of artisan's-tool proficiency choices from a subclass feature. */
  toolProfChoiceCount?: number;
  pools: ResourcePool[];
  maneuversKnown: ManeuverEntry[];
  /** Level-gated elemental disciplines learned (Way of the Four Elements). */
  disciplinesKnown: DisciplineEntry[];
  /** Level-gated tool proficiency choices (e.g. Student of War). */
  toolProficienciesKnown: ToolProfEntry[];
}

/** One entry in `Character.classes` — structured multiclass-aware view. */
export interface ClassEntry {
  /** CharacterClassEntry row id — the levelUp "existing" target. */
  id: string;
  name: string;
  level: number;
  subclass?: string;
  subclassId?: string;
  classId?: string;
}

/**
 * Class operation types — mirror of `applyClassOperations`. Sent as
 * `{ operations: ClassOperation[] }` to POST /api/characters/:id/class/transactions.
 */
export interface SetSubclassOperation { type: "setSubclass"; subclassId: string }

// #1131/#1170: the frontend no longer dispatches an addClass op — the level-up
// ceremony's class-choice step routes a multiclass-add through it (?classId=).
// The backend addClass op stays for its other callers; the frontend mirror was
// dead and is dropped.
// #1137: setFightingStyle is gone — Fighting Style is now a feat taken via the
// advancement endpoint (fightingStyle slot), not a class-scalar op.
export type ClassOperation = SetSubclassOperation;

/**
 * Resource operation types — mirror of `applyResourceOperations`. Sent as
 * `{ operations: ResourceOperation[] }` to POST /api/characters/:id/resources/transactions.
 */
export interface SpendResourceOperation { type: "spendResource"; key: string; amount?: number; roll?: number }

export interface RestoreResourceOperation { type: "restoreResource"; key: string; amount?: number }

export interface LearnManeuverOperation { type: "learnManeuver"; maneuverId?: string; custom?: { name: string; description: string } }

export interface ForgetManeuverOperation { type: "forgetManeuver"; entryId: string }

/** Learn an elemental discipline from catalog (Way of the Four Elements). */
export interface LearnDisciplineOperation { type: "learnDiscipline"; disciplineId?: string; custom?: { name: string; description: string; minLevel?: number } }

/** Forget a known elemental discipline by its per-character entry id. */
export interface ForgetDisciplineOperation { type: "forgetDiscipline"; entryId: string }

/** Retrain one known discipline for another within the cap. */
export interface SwapDisciplineOperation { type: "swapDiscipline"; entryId: string; disciplineId?: string; custom?: { name: string; description: string; minLevel?: number } }

/** Choose an artisan's-tool proficiency from the Student of War feature. */
export interface LearnToolProficiencyOperation { type: "learnToolProficiency"; name: string }

/** Undo a subclass-granted tool proficiency choice. */
export interface ForgetToolProficiencyOperation { type: "forgetToolProficiency"; entryId: string }

/** Pick one option for a generic subclass "choose N" (e.g. Hunter's Prey). */
export interface LearnSubclassChoiceOperation {
  type: "learnSubclassChoice";
  choiceKey: string;
  /** Catalog GrantedAbility id; omit for a custom (homebrew) option. */
  optionId?: string;
  custom?: { name: string; description: string };
}

export type ResourceOperation =
  | SpendResourceOperation
  | RestoreResourceOperation
  | LearnManeuverOperation
  | ForgetManeuverOperation
  | LearnDisciplineOperation
  | ForgetDisciplineOperation
  | SwapDisciplineOperation
  | LearnToolProficiencyOperation
  | ForgetToolProficiencyOperation
  | LearnSubclassChoiceOperation;

/**
 * Discipline operation types — mirror of `applyDisciplineOperations`. Sent as
 * `{ operations: DisciplineOperation[] }` to POST /api/characters/:id/disciplines/transactions.
 *
 * Cast a known elemental discipline: spend ki, send the client-computed roll total (0 for utility).
 */
export interface CastDisciplineOperation {
  type: "castDiscipline";
  disciplineId: string;
  kiSpent: number;
  roll: number;
}

export type DisciplineOperation = CastDisciplineOperation;

/**
 * Shadow Arts operation types — mirror of `applyShadowArtsOperations`. Sent as
 * `{ operations: ShadowArtOperation[] }` to POST /api/characters/:id/shadow-arts/transactions.
 *
 * Cast a Shadow Art (Way of Shadow): spend a flat 2 ki, apply concentration/buff.
 */
export interface CastShadowArtOperation {
  type: "castShadowArt";
  shadowArtId: string;
}

export type ShadowArtOperation = CastShadowArtOperation;

/**
 * Channel Divinity operation types — mirror of `applyChannelDivinityOperations`.
 * Sent as `{ operations: ChannelDivinityOperation[] }` to
 * POST /api/characters/:id/channel-divinity/transactions.
 *
 * Use a Channel Divinity option (Cleric/Paladin): spend 1 CD charge.
 */
export interface CastChannelDivinityOperation {
  type: "castChannelDivinity";
  abilityId: string;
}

export type ChannelDivinityOperation = CastChannelDivinityOperation;
