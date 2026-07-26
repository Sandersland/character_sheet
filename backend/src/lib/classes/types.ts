// Shared types for the per-class definitions in classes/<class>.ts, flattened
// by classes/registry.ts into the dispatch tables deriveResources() uses.

export type RechargeOn = "shortRest" | "longRest" | "short-or-long" | "none";

/**
 * A bonus HP heal tied to an `InitiativeRegen` descriptor firing (Uncanny
 * Metabolism, SRD 5.2, #1243): roll a `dieFaces` die and heal `flatBonus` +
 * the roll. Rolled server-side with no client input (mirrors the automatic
 * concentration-save roll, `lib/core/dice.ts`) since this is an automatic
 * combat-start effect, not a player-initiated roll.
 */
export interface InitiativeBonusHeal {
  /** Attribution surfaced on the HP-heal audit event / toast (e.g. "Uncanny Metabolism"). */
  sourceName: string;
  dieFaces: number;
  flatBonus: number;
}

/**
 * Regain-on-rolling-Initiative descriptor (SRD 5.2). Declared on a pool that
 * refills at combat start, applied by the `rollInitiative` resource op — e.g.
 * Uncanny Metabolism ({ amount: "all", oncePerLongRest: true, bonusHeal }) or
 * Perfect Focus ({ amount: 4 }). Orthogonal to `recharge` and independent of
 * any future short-rest-regain field (#1221) — resources may declare both.
 */
export interface InitiativeRegen {
  /**
   * "all" fully refills the pool. A number tops the pool up to *at least* that
   * many available (never spends) — e.g. Perfect Focus regains until you have 4
   * (only when you have 3 or fewer; a pool already at/above the target is a
   * no-op, so the "3 or fewer" trigger needs no separate check).
   */
  amount: "all" | number;
  /**
   * When true the regen fires at most once between long rests (Uncanny
   * Metabolism's 1/long-rest cap). Tracked by a marker in `used`, cleared on a
   * long rest by clearInitiativeRegenMarkers. Absent ⇒ fires every combat.
   */
  oncePerLongRest?: boolean;
  /**
   * Discriminator for the once-per-long-rest marker when a pool declares
   * MULTIPLE onInitiative descriptors (#1243 — e.g. Monk Focus at L15+ combines
   * Uncanny Metabolism's once/long-rest full refill with Perfect Focus's
   * every-combat top-up on the same pool). Defaults to the descriptor's
   * position in the array when omitted; only needs to be unique within one
   * pool's onInitiative list.
   */
  id?: string;
  /** A bonus HP heal this descriptor grants whenever it fires. Absent for a plain regen (Perfect Focus has none). */
  bonusHeal?: InitiativeBonusHeal;
}

export interface DerivedResource {
  key: string;          // stable machine key, e.g. "superiorityDice"
  label: string;        // display label, e.g. "Superiority Dice"
  total: number;        // maximum count at this level
  die?: string;         // die size string, e.g. "d8" — absent for simple counters
  recharge: RechargeOn; // when the pool fully recharges
  /**
   * Regain on rolling Initiative / combat start (#1239). A pool may declare
   * several descriptors (#1243) that fire independently — e.g. Monk Focus at
   * L15+ combines Uncanny Metabolism (once/long rest, full refill + heal) with
   * Perfect Focus (every combat, top-up to 4). Inert when absent.
   */
  onInitiative?: InitiativeRegen | InitiativeRegen[];
  description?: string;
}

export interface DerivedFeature {
  name: string;
  level: number;        // character level at which this feature is gained
  description: string;
  source: "class" | "subclass";
}

/**
 * The bespoke, non-generic level-gated choice-cap fields a subclass may
 * contribute (#1317): a "choose N" count plus, for maneuvers, an announced
 * save DC — extra scalar mechanics the generic SubclassChoice count (#899)
 * doesn't model, which is why these stay hand-rolled instead of migrating
 * onto it. This is the ONLY shape ExtrasFn may return — adding a fourth
 * bespoke field is a deliberate edit here, not a silent addition to the wider
 * DerivedClassInfo wire shape (the #1276 escape-hatch this type closes).
 */
export interface ClassExtras {
  /** Number of options available from a level-gated "choose N" cap this level. */
  maneuverChoiceCount?: number;
  /** Save DC for an announced effect gated by the same cap (8 + prof + ability mod). */
  maneuverSaveDC?: number;
  /** Number of tool-proficiency choices available from a subclass feature at this level. */
  toolProfChoiceCount?: number;
}

export interface DerivedClassInfo extends ClassExtras {
  resources: DerivedResource[];
  features: DerivedFeature[];
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
 * Distinct from the bespoke maneuvers/tool-prof lists, which carry
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
  subclassKey?: string,
) => DerivedResource[];

/** A subclass's bespoke level-gated choice-cap fields beyond its resources/features layer — see ClassExtras. */
export type ExtrasFn = (
  level: number,
  abilityScores: Record<string, number>,
  profBonus: number,
) => Partial<ClassExtras>;

export interface SubclassDefinition {
  /**
   * The PHB'14 (2014) level at which this subclass's features/resources/extras
   * first apply — Cleric/Sorcerer/Warlock 1, Druid/Wizard 2, everything else
   * (or absent) 3. Resolved through subclassActiveAt (registry.ts's
   * isSubclassActive), which hardcodes 3 for EDITION_2024 regardless of this
   * value — mirrors CharacterClass.subclassLevel, the catalog-column half of
   * the same 2014 gate (#1308/#1291).
   */
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
