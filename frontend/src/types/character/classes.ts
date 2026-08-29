import type { EffectSpec } from "@character-sheet/shared-types";
// A bare `export … from` doesn't bind a local name, so OpenHandRiderResult.rider
// needs this import despite the re-export below.
import type { OpenHandRider } from "@character-sheet/contracts";

export type {
  CastElementalBurstOperation,
  ElementalDamageType,
  ElementalStrikeOperation,
  ForgetExpertiseOperation,
  ForgetManeuverOperation,
  ForgetSubclassChoiceOperation,
  ForgetToolProficiencyOperation,
  LearnExpertiseOperation,
  LearnManeuverOperation,
  LearnSubclassChoiceOperation,
  LearnToolProficiencyOperation,
  ResourceOperation,
  RestoreResourceOperation,
  RollInitiativeOperation,
  SpendResourceOperation,
  WarriorOfElementsOperation,
  WarriorOfElementsResult,
} from "@character-sheet/shared-types";
// Shared declaration is named ResourceOpAudit; aliased since the client sees it as a per-op result.
export type { ResourceOpAudit as ResourceOpResult } from "@character-sheet/shared-types";

// `import type` only, so zod never enters the client bundle.
export type {
  AttemptStunningStrikeOperation,
  BondWeaponOperation,
  CastChannelDivinityOperation,
  CastShadowArtOperation,
  ChannelDivinityOperation,
  DisciplineOperation,
  ImposeOpenHandRiderOperation,
  ManeuverOperation,
  OpenHandRider,
  SetQuiveringPalmOperation,
  ShadowArtOperation,
  TriggerQuiveringPalmOperation,
  UnbondWeaponOperation,
  WeaponBondOperation,
} from "@character-sheet/contracts";

/** Focus (or other pool) cost of an activated ability. Mirror of backend AbilityCost. */
export type AbilityCost =
  | { kind: "pool"; key: string; base: number; perStep?: number }
  | { kind: "none" };

/** A Warrior of Shadow Shadow Art from GET /api/shadow-arts. */
export interface CatalogShadowArt {
  id: string;
  name: string;
  description: string;
  minLevel: number;
  cost: AbilityCost;
  effect: EffectSpec;
}

/** The client reads `roll` verbatim off the step — never computes ki-scaled dice. */
export interface DisciplineCastStep {
  ki: number;
  roll: { count: number; faces: number; modifier: number };
}

/** 2014-only. Per-cast ki cap (`maxKiPerDiscipline`) is enforced server-side; never clamp client-side. */
export interface CatalogDiscipline {
  id: string;
  name: string;
  description: string;
  minLevel: number;
  cost: AbilityCost;
  effect: EffectSpec;
  steps: DisciplineCastStep[];
}

export type ChannelDivinityKind = "announce" | "buff" | "advantage" | "invisible" | "reminder";

/** From GET /api/characters/:id/channel-divinity. */
export interface CatalogChannelDivinity {
  id: string;
  name: string;
  description: string;
  kind: ChannelDivinityKind;
  saveDc: number | null;
  saveAbility: string | null;
  reminder: string;
}

export type RechargeOn = "shortRest" | "longRest" | "short-or-long" | "none";

export interface ResourcePool {
  key: string;
  label: string;
  total: number;
  die?: string;
  recharge: RechargeOn;
  description?: string;
  // Rendered verbatim next to the description; never parsed.
  details?: { label: string; value: string }[];
  used: number;
  remaining: number;
}

export interface ClassFeature {
  name: string;
  level: number;
  description: string;
  source: "class" | "subclass";
}

/** attackRoll/damageRoll fold into that roll; reaction/attackOption consume a slot; effect is a gold strip. */
export type ManeuverPlacement =
  | "attackRoll"
  | "damageRoll"
  | "reaction"
  | "effect"
  | "attackOption";

export interface ManeuverEntry {
  id: string;
  maneuverId?: string;   // catalog GrantedAbility.id provenance — undefined for custom
  name: string;
  description: string;
  // Undefined for custom/legacy — session components then treat it as "damageRoll".
  placement?: ManeuverPlacement;
  actionSlot?: "bonusAction" | "reaction" | null;
  // Resolved by deriveManeuverEffect; never re-derived client-side. Undefined for custom/legacy.
  effect?: EffectSpec;
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

/** Per-op result from POST …/maneuvers/transactions — die + announced save DC. */
export interface ManeuverCastResult {
  roll: number;
  saveDc: number | null;
  summary: string;
}

/** Per-op result from POST …/stunning-strike/transactions — DC + roll + fail/success rider. */
export interface StunningStrikeAttemptResult {
  dc: number;
  roll: number;
  outcome: "fail" | "success";
  summary: string;
}

/** Per-op result from POST …/open-hand-technique/transactions — Addle has no roll. */
export interface OpenHandRiderResult {
  rider: OpenHandRider;
  dc: number;
  roll?: number;
  outcome: "applied" | "resisted";
  summary: string;
}

/** Per-op result from POST …/quivering-palm/transactions — setQuiveringPalm. */
export interface SetQuiveringPalmResult {
  active: true;
  daysRemaining: number;
  summary: string;
}

/** Per-op result from POST …/quivering-palm/transactions — triggerQuiveringPalm. */
export interface TriggerQuiveringPalmResult {
  dc: number;
  saveRoll: number;
  outcome: "fail" | "success";
  rawDamage: number;
  appliedDamage: number;
  summary: string;
}

export type QuiveringPalmResult = SetQuiveringPalmResult | TriggerQuiveringPalmResult;

/**
 * One tool proficiency on the wire — serializeCharacter merges creation-fixed
 * (background/class) and level-gated subclass profs before sending.
 */
export interface ToolProficiency {
  name: string;
  category: "artisan" | "gamingSet" | "musicalInstrument" | "other";
  /** "item" means a magic item grant. */
  source: "background" | "class" | "subclass" | "item";
}

export type ArmorProficiencyCategory = "light" | "medium" | "heavy" | "shield";

/** `source` is the highest-priority origin: class wins over feat for the same category. */
export interface ArmorProficiency {
  category: ArmorProficiencyCategory;
  source: "class" | "feat";
}

/** `name` may be a category or a specific weapon; `source` is the highest-priority origin. */
export interface WeaponProficiency {
  name: string;
  source: "class" | "feat" | "item";
}

export interface ToolProfEntry {
  id: string;
  name: string; // matches a TOOLS entry name
}

export interface ExpertiseEntry {
  id: string;
  skill: string; // camelCase skill key
}

/** A snapshot, not mechanics. */
export interface ChoiceEntry {
  id: string;
  optionId?: string; // catalog provenance; absent for a custom (non-catalog) pick
  name: string;
  description: string;
}

export interface CharacterResources {
  features: ClassFeature[];
  maneuverChoiceCount?: number;
  toolProfChoiceCount?: number;
  expertiseChoiceCount?: number;
  pools: ResourcePool[];
  maneuversKnown: ManeuverEntry[];
  toolProficienciesKnown: ToolProfEntry[];
  expertiseKnown: ExpertiseEntry[];
  // `buildResourcesPayload` always sends both, so required here — keep it that way.
  subclassChoices: { key: string; label: string; catalogSource: string; count: number }[];
  choicesKnown: Record<string, ChoiceEntry[]>;
}

/** Structured multiclass-aware view of one entry in `Character.classes`. */
export interface ClassEntry {
  /** CharacterClassEntry row id — the levelUp "existing" target. */
  id: string;
  name: string;
  level: number;
  subclass?: string;
  subclassId?: string;
  classId?: string;
  /** Computed by `buildClassesView`; never re-derive `level >= subclassGateLevel` client-side. */
  needsSubclass: boolean;
  /** True when the held subclass is tagged for a different edition than the character's; name still renders but features derive to zero. */
  subclassUnavailable: boolean;
}

// Sent as { operations: ClassOperation[] } to POST /api/characters/:id/class/transactions.
export interface SetSubclassOperation { type: "setSubclass"; subclassId: string }

// Only ops the frontend dispatches are mirrored; `applyClassOperations` accepts more server-side.
export type ClassOperation = SetSubclassOperation;
