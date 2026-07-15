// Shared types for the per-class definitions in classes/<class>.ts, flattened
// by classes/registry.ts into the dispatch tables deriveResources() uses.

export type RechargeOn = "shortRest" | "longRest" | "short-or-long" | "none";

export interface DerivedResource {
  key: string;          // stable machine key, e.g. "superiorityDice"
  label: string;        // display label, e.g. "Superiority Dice"
  total: number;        // maximum count at this level
  die?: string;         // die size string, e.g. "d8" — absent for simple counters
  recharge: RechargeOn; // when the pool fully recharges
  description?: string;
}

export interface DerivedFeature {
  name: string;
  level: number;        // character level at which this feature is gained
  description: string;
  source: "class" | "subclass";
}

export interface DerivedClassInfo {
  resources: DerivedResource[];
  features: DerivedFeature[];
  /** Battle Master only: number of maneuvers the character may know at this level. */
  maneuverChoiceCount?: number;
  /** Battle Master only: save DC for maneuver effects (8 + prof + Str/Dex mod). */
  maneuverSaveDC?: number;
  /**
   * Number of artisan's-tool proficiency choices available from a subclass
   * feature (currently: Student of War = 1 at Battle Master level 3+).
   * Undefined when no subclass feature grants a tool choice.
   */
  toolProfChoiceCount?: number;
  /** Way of the Four Elements only: number of elemental disciplines known at this level. */
  disciplineChoiceCount?: number;
  /** Way of the Four Elements only: ki save DC for discipline effects (8 + prof + Wis mod). */
  disciplineSaveDC?: number;
  /** Way of Shadow only: whether the L3+ Shadow Arts ki-cast spells are available. */
  shadowArtsAvailable?: boolean;
  /** Way of Shadow only: whether the L11+ Cloak of Shadows self-invisible toggle is available. */
  cloakOfShadowsAvailable?: boolean;
  /**
   * Generic subclass "choose N from a catalog" selections active at this level
   * (issue #899). Only choices whose derived count > 0 are listed — so a
   * subclass feature not yet reached (e.g. Hunter's Defensive Tactics before L7)
   * is absent. Drives the resources reconciler/clamp and the level-up Choose-N
   * step. See SubclassChoice for the declaration shape.
   */
  subclassChoices?: DerivedSubclassChoice[];
}

/**
 * A generic level-gated "choose N options" feature declared on a subclass
 * (issue #899) — e.g. Ranger's Hunter's Prey, Barbarian totems. Its only
 * persisted state is the selection (ResourcesMutableState.choicesKnown[key]);
 * the option catalog lives as GrantedAbility rows keyed by `catalogSource`.
 * Distinct from the bespoke maneuvers/disciplines/tool-prof lists, which carry
 * extra mechanics (save DCs, cast/swap ops) and stay hand-rolled.
 */
export interface SubclassChoice {
  /** Stable machine key — the choicesKnown map key and the learn/forget op target. */
  key: string;
  /** Display label, e.g. "Hunter's Prey". */
  label: string;
  /** GrantedAbility.source the option catalog is drawn from, e.g. "huntersPrey". */
  catalogSource: string;
  /** Level-derived number of options the character may choose (0 below the grant level). */
  count: (level: number) => number;
}

/** A SubclassChoice resolved for a specific character level, surfaced on DerivedClassInfo. */
export interface DerivedSubclassChoice {
  key: string;
  label: string;
  catalogSource: string;
  count: number;
}

export type ResourceFn = (
  level: number,
  abilityScores: Record<string, number>,
  profBonus: number,
) => DerivedResource[];

/** Extra DerivedClassInfo fields a subclass contributes beyond resources/features (e.g. Battle Master maneuvers). */
export type ExtrasFn = (
  level: number,
  abilityScores: Record<string, number>,
  profBonus: number,
) => Partial<Omit<DerivedClassInfo, "resources" | "features">>;

export interface SubclassDefinition {
  /** Character level at which this subclass's features/resources/extras first apply. Defaults to 3. */
  grantLevel?: number;
  features: DerivedFeature[];
  resourceFn?: ResourceFn;
  deriveExtras?: ExtrasFn;
  /**
   * Generic "choose N from a catalog" features (issue #899). Declared as data —
   * a new choose-N needs a SubclassChoice entry + seed rows, not a bespoke
   * reconciler. Collected into DerivedClassInfo.subclassChoices in registry.ts.
   */
  choices?: SubclassChoice[];
}

export interface ClassDefinition {
  features: DerivedFeature[];
  resourceFn?: ResourceFn;
  /** Keyed by lowercase subclass name (entry.subclass.toLowerCase()). */
  subclasses?: Record<string, SubclassDefinition>;
}
