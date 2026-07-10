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
}

export interface ClassDefinition {
  features: DerivedFeature[];
  resourceFn?: ResourceFn;
  /** Keyed by lowercase subclass name (entry.subclass.toLowerCase()). */
  subclasses?: Record<string, SubclassDefinition>;
}
