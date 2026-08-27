import type { EffectSpec } from "@character-sheet/shared-types";
// A bare `export … from` doesn't bind a local name, so OpenHandRiderResult.rider
// needs this import despite the re-export below.
import type { OpenHandRider } from "@character-sheet/contracts";

// Op shapes live once in shared-types (#1273); re-exported so this module stays
// the frontend's class-types entry point.
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
// The shared declaration is named ResourceOpAudit (what the server logs);
// aliased here because the client sees it as a per-op result.
export type { ResourceOpAudit as ResourceOpResult } from "@character-sheet/shared-types";

// Derived from the route zod schemas in @character-sheet/contracts (#1370) —
// `import type` only, so zod never enters the client bundle. Only names with
// frontend call sites are forwarded: a forwarded-only name is a dead export
// under the fallow gate.
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

/**
 * One selectable ki amount in a Four Elements discipline's cast picker (#1505).
 * The client reads `roll` verbatim off the step — never computes ki-scaled dice.
 */
export interface DisciplineCastStep {
  ki: number;
  roll: { count: number; faces: number; modifier: number };
}

/**
 * A Way of the Four Elements discipline (2014-only, #1503/#1505) from GET
 * /api/disciplines. `steps` is empty for no-dice utility disciplines and for
 * `cost.kind !== "pool"`. `steps` may offer more ki than the monk can afford:
 * the per-cast cap (`maxKiPerDiscipline`) is enforced server-side at cast time,
 * never clamped client-side.
 */
export interface CatalogDiscipline {
  id: string;
  name: string;
  description: string;
  minLevel: number;
  cost: AbilityCost;
  effect: EffectSpec;
  steps: DisciplineCastStep[];
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

export type RechargeOn = "shortRest" | "longRest" | "short-or-long" | "none";

export interface ResourcePool {
  key: string;
  label: string;
  total: number;
  die?: string;        // e.g. "d8"
  recharge: RechargeOn;
  description?: string;
  // Labeled display parts rendered verbatim next to the description (the
  // armorClassBreakdown pattern) — never parsed.
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

/**
 * Where a maneuver's session UI lives. "attackRoll"/"damageRoll" fold the die
 * into that roll; "reaction"/"attackOption" consume a slot with reminder text;
 * "effect" is a gold strip.
 */
export type ManeuverPlacement =
  | "attackRoll"
  | "damageRoll"
  | "reaction"
  | "effect"
  | "attackOption";

/** A known maneuver on a character, with catalog provenance. */
export interface ManeuverEntry {
  id: string;
  maneuverId?: string;   // catalog GrantedAbility.id provenance — undefined for custom
  name: string;
  description: string;
  // Session-UI routing snapshot from the catalog (undefined for custom/legacy
  // → session components treat as "damageRoll").
  placement?: ManeuverPlacement;
  actionSlot?: "bonusAction" | "reaction" | null;
  // Resolved by deriveManeuverEffect against the character's current superiority
  // die (#1381) — never re-derived client-side. Undefined for custom/legacy.
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
  /** Where this proficiency came from ("item" = a magic item grant, #529). */
  source: "background" | "class" | "subclass" | "item";
}

/** Armor category that a character is proficient with. */
export type ArmorProficiencyCategory = "light" | "medium" | "heavy" | "shield";

/**
 * One armor proficiency — derived at read time; species grants arrive
 * feat-sourced (#1682). `source` is the highest-priority origin: class wins
 * over feat for the same category.
 */
export interface ArmorProficiency {
  category: ArmorProficiencyCategory;
  source: "class" | "feat";
}

/**
 * One weapon proficiency — derived at read time; species grants arrive
 * feat-sourced (#1682). `name` may be a category ("Martial Weapons") or a
 * specific weapon ("Longswords"). `source` is the highest-priority origin.
 */
export interface WeaponProficiency {
  name: string;
  source: "class" | "feat" | "item";
}

/** Level-gated tool proficiency entry within the resources JSON. */
export interface ToolProfEntry {
  id: string;   // per-character entry UUID
  name: string; // matches a TOOLS entry name
}

/** Level-gated Expertise skill entry within the resources JSON (#1588). */
export interface ExpertiseEntry {
  id: string;    // per-character entry UUID
  skill: string; // camelCase skill key, e.g. "stealth"
}

/** One picked option of a subclass "choose N" feature (#899) — a snapshot, not mechanics. */
export interface ChoiceEntry {
  id: string;
  optionId?: string; // catalog provenance; absent for a custom (non-catalog) pick
  name: string;
  description: string;
}

/** Derived class/subclass resource data merged with stored mutable state. */
export interface CharacterResources {
  features: ClassFeature[];
  maneuverChoiceCount?: number;
  /** Number of artisan's-tool proficiency choices from a subclass feature. */
  toolProfChoiceCount?: number;
  /** Number of Expertise skill picks at this level (#1588 — Rogue/Bard/Ranger/Wizard). */
  expertiseChoiceCount?: number;
  pools: ResourcePool[];
  maneuversKnown: ManeuverEntry[];
  /** Level-gated tool proficiency choices (e.g. Student of War). */
  toolProficienciesKnown: ToolProfEntry[];
  /** Level-gated Expertise skill choices (#1588). */
  expertiseKnown: ExpertiseEntry[];
  // buildResourcesPayload always sends both, so required here — optional would
  // reopen the drift these fields closed (#1422).
  subclassChoices: { key: string; label: string; catalogSource: string; count: number }[];
  choicesKnown: Record<string, ChoiceEntry[]>;
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
  /**
   * Backend-computed by buildClassesView (#1598): true once this entry's
   * subclass-gate level has passed AND (no subclass chosen, or the held one is
   * `subclassUnavailable`). Read it verbatim — never re-derive
   * `level >= subclassGateLevel` client-side.
   */
  needsSubclass: boolean;
  /**
   * True when the held subclass row is edition-tagged for a DIFFERENT edition
   * than the character's (a catalog retag after the pick — fresh cross-edition
   * picks are blocked, #1598). The name still renders but features derive to
   * zero, so the sheet must explain the split rather than hide it.
   */
  subclassUnavailable: boolean;
}

/**
 * Class operation types — mirror of `applyClassOperations`. Sent as
 * `{ operations: ClassOperation[] }` to POST /api/characters/:id/class/transactions.
 */
export interface SetSubclassOperation { type: "setSubclass"; subclassId: string }

// Only ops the frontend dispatches are mirrored — applyClassOperations accepts
// more (addClass, #1131/#1170).
export type ClassOperation = SetSubclassOperation;
