/**
 * Class-feature wire types: resources, maneuvers, fighting styles, and their operations.
 */

import type { EffectSpec } from "@character-sheet/shared-types";
// OpenHandRider is used below (OpenHandRiderResult.rider) as well as
// re-exported (the `export type` block further down) — a bare `export …
// from` doesn't bind a local name, so it needs its own `import type` too.
import type { OpenHandRider } from "@character-sheet/contracts";

// The resource + Warrior-of-the-Elements op shapes are the single cross-tier
// source of truth in shared-types (#1273); re-exported here so this module stays
// the frontend's class-types entry point (flowing through the @/types/character
// barrel).
export type {
  CastElementalBurstOperation,
  ElementalDamageType,
  ElementalStrikeOperation,
  ForgetManeuverOperation,
  ForgetSubclassChoiceOperation,
  ForgetToolProficiencyOperation,
  LearnManeuverOperation,
  LearnSubclassChoiceOperation,
  LearnToolProficiencyOperation,
  ResourceOperation,
  RestoreResourceOperation,
  RollInitiativeOperation,
  SpendResourceOperation,
  ToggleElementalAttunementOperation,
  WarriorOfElementsOperation,
  WarriorOfElementsResult,
} from "@character-sheet/shared-types";
// The per-op audit payload keeps its frontend name: the shared declaration is
// called ResourceOpAudit (what the server logs) where the client sees a result.
// Aliasing keeps api/client.ts out of this diff — #1275 is rewriting that file.
export type { ResourceOpAudit as ResourceOpResult } from "@character-sheet/shared-types";

// The Channel Divinity / Shadow Arts / maneuver / ability-op shapes are derived
// from the route zod schemas in @character-sheet/contracts (#1370) — `import
// type` only, so zod never enters the client bundle
// (scripts/check-no-zod-in-client-bundle.sh). Only the names this tier
// actually consumes are re-exported: CastManeuverOperation and
// ActivateCloakOfShadowsOperation have zero frontend call sites (mirrored
// backend-only in maneuvers.ts/shadow-arts.ts), and Hand of Harm / Hand of
// Ultimate Mercy have no frontend feature at all yet, so none of those three
// forward here — a forwarded-only name is a dead export under the repo-wide
// fallow gate.
export type {
  AttemptStunningStrikeOperation,
  CastChannelDivinityOperation,
  CastShadowArtOperation,
  ChannelDivinityOperation,
  ImposeOpenHandRiderOperation,
  ManeuverOperation,
  OpenHandRider,
  RollSneakAttackOperation,
  SetQuiveringPalmOperation,
  ShadowArtOperation,
  TriggerQuiveringPalmOperation,
} from "@character-sheet/contracts";

/** Focus (or other pool) cost of an activated ability. Mirror of backend AbilityCost. */
export type AbilityCost =
  | { kind: "pool"; key: string; base: number; perStep?: number }
  | { kind: "none" };

/** The Warrior of Shadow Shadow Art (Darkness) from GET /api/shadow-arts (flat 1-focus focus-cast spell). */
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
  // #1381: resolved by deriveManeuverEffect (backend), dice tracking the
  // character's current superiority die via resolveClassDie — never re-derived
  // client-side. Undefined for a custom/legacy entry with no catalog provenance.
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

/** Per-op result from POST …/sneak-attack/transactions — the server-rolled Nd6. */
export interface SneakAttackRollResult {
  roll: number;
  dice: number;
  faces: number;
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

/**
 * One picked option of a generic subclass "choose N" feature (#899), e.g. a
 * Ranger's Hunter's Prey selection. Mirrors ManeuverEntry but carries no
 * mechanics — the option catalog is GrantedAbility rows and this is just the
 * snapshot. `optionId` is catalog provenance only, so it's absent for a
 * custom (non-catalog) pick.
 */
export interface ChoiceEntry {
  id: string;
  optionId?: string;
  name: string;
  description: string;
}

/** Derived class/subclass resource data merged with stored mutable state. */
export interface CharacterResources {
  features: ClassFeature[];
  maneuverChoiceCount?: number;
  /** Number of artisan's-tool proficiency choices from a subclass feature. */
  toolProfChoiceCount?: number;
  pools: ResourcePool[];
  maneuversKnown: ManeuverEntry[];
  /** Level-gated tool proficiency choices (e.g. Student of War). */
  toolProficienciesKnown: ToolProfEntry[];
  // buildResourcesPayload always sends both of these (subclassChoices defaults
  // to [] server-side), so required here — optional would let the drift these
  // two fields close (#1422) reopen.
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
