import type { RulesEdition } from "@character-sheet/shared-types";

import type { ActionCost } from "./actions.js";
import type { ActivationRequirement, EffectBuffRow } from "./class-feature-rows.js";
import type { FeatImprovement } from "./resources-state.js";
import type { SubclassSlug } from "./subclass-slug.js";

export type RechargeOn = "shortRest" | "longRest" | "short-or-long" | "none";

/**
 * A bonus HP heal tied to an `InitiativeRegen` firing (Uncanny Metabolism,
 * SRD 5.2, #1243): roll a `dieFaces` die and heal `flatBonus` + the roll.
 * Rolled server-side with no client input — an automatic combat-start effect,
 * not a player-initiated roll.
 */
export interface InitiativeBonusHeal {
  /** Attribution surfaced on the HP-heal audit event / toast (e.g. "Uncanny Metabolism"). */
  sourceName: string;
  dieFaces: number;
  flatBonus: number;
}

/**
 * Regain-on-rolling-Initiative descriptor (SRD 5.2), applied by the
 * `rollInitiative` resource op. Orthogonal to `recharge` and
 * `shortRestRegain` — a pool may declare all of them.
 */
export interface InitiativeRegen {
  /**
   * "all" fully refills the pool. A number tops the pool up to *at least* that
   * many available (never spends) — a pool already at/above the target is a
   * no-op, so e.g. Perfect Focus's "3 or fewer" trigger needs no separate check.
   */
  amount: "all" | number;
  /**
   * When true the regen fires at most once between long rests. Tracked by a
   * marker in `used`, cleared by clearInitiativeRegenMarkers on a long rest.
   * Absent ⇒ fires every combat.
   */
  oncePerLongRest?: boolean;
  /**
   * Discriminator for the once-per-long-rest marker when a pool declares
   * multiple onInitiative descriptors (#1243, e.g. Monk Focus at L15+).
   * Defaults to the descriptor's position in the array; only needs to be
   * unique within one pool's list.
   */
  id?: string;
  bonusHeal?: InitiativeBonusHeal;
  /**
   * Fire only when the pool's remaining count is at or below this value
   * (#1500) — 2014 Perfect Self ("when you roll initiative and have no ki
   * points remaining") is `{ amount: 4, threshold: 0 }`. Absent ⇒ the implicit
   * rule (fires whenever remaining < amount); 2024 Perfect Focus stays on the
   * implicit rule deliberately — an explicit `threshold: 3` would behave
   * identically, but class-features-snapshot.test.ts pins its exact shape.
   */
  threshold?: number;
}

export interface DerivedResource {
  key: string;
  label: string;
  total: number;
  die?: string;
  recharge: RechargeOn;
  /**
   * Regain on rolling Initiative / combat start (#1239). A pool may declare
   * several descriptors that fire independently (#1243). Inert when absent.
   */
  onInitiative?: InitiativeRegen | InitiativeRegen[];
  /**
   * Partial short-rest top-up (#1221, SRD 5.2's "regain one expended use on a
   * Short Rest, and all on a Long Rest"). Orthogonal to `recharge`, which
   * keeps meaning a FULL restore on the named rest: `shortRestRegain: N`
   * additionally regains up to N expended uses on a short rest. Where
   * `recharge` already fires on a short rest, the full reset wins and this
   * field is a no-op for that rest — never subtracted twice. Read only by
   * `restPoolRegain`.
   */
  shortRestRegain?: number;
  description?: string;
  /**
   * Labeled display parts rendered verbatim by the client next to the
   * description (the armorClassBreakdown pattern) — never parsed.
   */
  details?: { label: string; value: string }[];
}

/**
 * A feature exactly as authored in a class module — still the seed's AUTHORING
 * input after #1524 (`CLASS_FEATURES` compiles from the modules at seed time;
 * they no longer feed derivation directly). `edition` is optional: the large
 * majority of entries never set it (both editions share the text) and #1374
 * rejected a blanket tagging pass. `DerivedFeature` is the read-time
 * counterpart — split out because the two can no longer share one type.
 */
export interface AuthoredFeature {
  name: string;
  level: number;        // character level at which this feature is gained
  description: string;
  source: "class" | "subclass";
  edition?: RulesEdition;
  /**
   * Permanent, level-gated derived-stat modifier pair (#1530), e.g.
   * `"attacksPerAction"` for Extra Attack — names the SERIALIZED field it
   * feeds. Distinct from the buff layer, which is duration-bound; this never
   * expires. Threaded straight through expandFeatureRow into the seeded row —
   * this file never interprets it.
   */
  derivedStat?: string;
  derivedStatTiers?: { minLevel: number; value: number | string }[];
  /**
   * Activation/resource-identity/cost/effectBuffs columns (#1686), threaded
   * through expandFeatureRow uninterpreted like derivedStat above.
   * `resourceKey` is the toggle's own IDENTITY (the activate action's `key`
   * and the seed for its synthesized endActionKey) — NOT necessarily a
   * resourceTotals-backed pool: Elemental Attunement sets
   * `resourceKey: "elementalAttunement"` with no resourceTotals, paying from
   * the shared "focus" pool via costPoolKey instead (see toggleActionsFromRow
   * for why the two axes are independent).
   */
  resourceKey?: string;
  activationCost?: ActionCost;
  resolverKind?: "toggle";
  costKind?: "pool" | "none";
  costPoolKey?: string;
  costBase?: number;
  effectBuffs?: EffectBuffRow[];
  // Declarative activation-time gates (#1688), threaded through expandFeatureRow uninterpreted.
  activationRequires?: ActivationRequirement[];
}

/**
 * A feature as derived for one character, resolved from seeded ClassFeature
 * rows by `featuresFromRows` — the one place the edition rule for feature
 * text lives (#1374/#1524). `edition` is REQUIRED here, unlike
 * `AuthoredFeature.edition?`: ClassFeature.edition is a non-nullable column
 * (#1522), so every row already names its edition — an untagged derived
 * feature would mean row resolution failed, not a valid "both editions"
 * state. Server-side only: `toWireFeatures` strips this field at the wire
 * boundary.
 */
export interface DerivedFeature {
  name: string;
  level: number;        // character level at which this feature is gained
  description: string;
  source: "class" | "subclass";
  edition: RulesEdition;
}

/**
 * The bespoke, non-generic level-gated choice-cap fields a subclass may
 * contribute (#1317) — extra scalar mechanics the generic SubclassChoice
 * count (#899) doesn't model, which is why these stay hand-rolled. Adding a
 * field is a deliberate edit here, not a silent addition to the wider
 * DerivedClassInfo wire shape (the #1276 escape hatch this type closes).
 */
export interface ClassExtras {
  /** How many picks the character may hold from a level-gated "choose N" cap at this level. */
  maneuverChoiceCount?: number;
  /**
   * A closed-form save DC a class/subclass row announces (#1589): 8 +
   * proficiency + max of the row's `saveDcAbilities` modifiers
   * (deriveAnnouncedSaveDC). Populated from either a base-class row or an
   * active subclass row, but stays a SINGLE scalar overlaid across every
   * class entry — two DIFFERENT entries each declaring one is a real
   * collision, not two independent values. On the read path
   * `assignAnnouncedSaveDC` degrades rather than throwing (warns, keeps the
   * first-declaring entry's DC) so a content/homebrew misconfiguration never
   * 500s serializeCharacter.
   */
  announcedSaveDC?: number;
  /**
   * Tool-proficiency choices granted by a subclass feature at this level.
   * Undefined when no subclass feature grants a tool choice — assignDefined
   * and entryContributesExtras both branch on exactly that.
   */
  toolProfChoiceCount?: number;
  /**
   * How many skills the character may hold Expertise in (#1588). Resolved via
   * derivedStatFromRows like maneuverChoiceCount/toolProfChoiceCount — never
   * a second inline copy.
   */
  expertiseChoiceCount?: number;
}

export interface DerivedClassInfo extends ClassExtras {
  resources: DerivedResource[];
  features: DerivedFeature[];
  /**
   * Generic subclass "choose N from a catalog" selections active at this
   * level (#899). Only choices whose derived count > 0 are listed, so a
   * feature not yet reached is absent. Drives the resources reconciler/clamp
   * and the level-up Choose-N step.
   */
  subclassChoices?: DerivedSubclassChoice[];
  /**
   * Flat FeatImprovement[] from every active ClassFeature row (#1691).
   * Optional rather than defaulting to `[]` so DerivedClassInfo test literals
   * that author no row-level grant need no edit. Consumed by applyFeatLayer
   * through the same deriveImprovementBonuses/deriveImprovementProficiencies
   * evaluator as advancement-sourced improvements.
   */
  improvements?: FeatImprovement[];
}

/**
 * A generic level-gated "choose N options" feature declared on a subclass
 * (#899). Its only persisted state is the selection
 * (ResourcesMutableState.choicesKnown[key]); the option catalog lives as
 * GrantedAbility rows keyed by `catalogSource`. Distinct from the bespoke
 * maneuvers/tool-prof lists, which carry extra mechanics.
 */
export interface SubclassChoice {
  /** The choicesKnown map key and the learn/forget op target. */
  key: string;
  label: string;
  /** GrantedAbility.source the option catalog is drawn from, e.g. "huntersPrey". */
  catalogSource: string;
  /** Level-derived number of options the character may choose (0 below the grant level). */
  count: (level: number) => number;
}

export interface DerivedSubclassChoice {
  key: string;
  label: string;
  catalogSource: string;
  count: number;
}

/**
 * A choose-N subclass choice's swap-on-learn cadence (#1503, owner decision
 * 2026-08-03) — deliberately separate from `swapCadenceFor`, which feeds
 * `preparedSpellCountAt`/`maxSpellLevelForClass` and would read a non-caster
 * subclass as a caster. Lives here so leveling's pure planner can call it
 * without importing resources.ts's Prisma-typed machinery.
 *
 * Defaults to "never"; "onLevelUp" is reserved for a choice whose own 5e text
 * states "whenever you learn a new X, you may replace one you know" (PHB'14
 * p.80, Way of the Four Elements' Disciple of the Elements). `edition` last
 * (subclassGateLevel's pattern, #1499); future choose-N features extend this
 * function, never duplicate it. #1516 makes the privilege exclusive:
 * `forgetSubclassChoice` 400s outside a validated level-up step, so a "never"
 * catalogSource is unreachable end to end.
 */
export function subclassChoiceSwapCadence(catalogSource: string, edition: RulesEdition): "onLevelUp" | "never" {
  return catalogSource === "discipline" && edition === "EDITION_2014" ? "onLevelUp" : "never";
}

// `subclassKey`/`edition` are both required (never optional) so `edition` can
// sit last (the subclassGateLevel pattern, #1499) — a defaulted-then-skipped
// middle parameter can't coexist with a later required one. Implementations
// may declare fewer parameters: TS structurally allows a function value with
// fewer declared parameters than its target type, so only the monk resourceFn
// (which needs `edition` for its Martial Arts die) declares the full list.
export type ResourceFn = (
  level: number,
  abilityScores: Record<string, number>,
  profBonus: number,
  subclassKey: string | undefined,
  edition: RulesEdition,
) => DerivedResource[];

/**
 * ClassExtras, plus an explicit `never` for every other DerivedClassInfo key.
 * The `never` half is what actually closes the #1276 hatch: TypeScript's
 * excess-property check fires only on a fresh object literal, so on
 * `Partial<ClassExtras>` alone a returned variable, a spread, or a
 * DerivedClassInfo-typed value still smuggles arbitrary fields through the
 * Object.assign overlay in deriveResources.
 */
type ClassExtrasOnly = Partial<ClassExtras> &
  Partial<Record<Exclude<keyof DerivedClassInfo, keyof ClassExtras>, never>>;

/**
 * `edition` last, same rationale as ResourceFn (#1499) — no subclassKey since
 * an ExtrasFn is already scoped to one subclass.
 */
export type ExtrasFn = (
  level: number,
  abilityScores: Record<string, number>,
  profBonus: number,
  edition: RulesEdition,
) => ClassExtrasOnly;

export interface SubclassDefinition {
  /**
   * Stable mechanics-identity join key (#1277) — must equal the seeded
   * Subclass row's own `slug`; the SubclassSlug type is what enforces it.
   */
  slug: SubclassSlug;
  /**
   * The PHB'14 level at which this subclass's features/resources/extras first
   * apply — Cleric/Sorcerer/Warlock 1, Druid/Wizard 2, everything else (or
   * absent) 3. Resolved through subclassActiveAt, which hardcodes 3 for
   * EDITION_2024 regardless of this value — mirrors
   * CharacterClass.subclassLevel, the catalog-column half of the same 2014
   * gate (#1308/#1291).
   */
  grantLevel?: number;
  // Optional (#1227): Fighter's subclasses carry no authored features — their
  // text is literal seed data, and the seed treats an absent array as zero rows.
  features?: AuthoredFeature[];
  resourceFn?: ResourceFn;
  deriveExtras?: ExtrasFn;
  /**
   * Generic "choose N from a catalog" features (#899). Declared as data — a
   * new choose-N needs a SubclassChoice entry + seed rows, not a bespoke
   * reconciler.
   */
  choices?: SubclassChoice[];
}

export interface ClassDefinition {
  // Optional (#1227) — same rationale as SubclassDefinition.features.
  features?: AuthoredFeature[];
  resourceFn?: ResourceFn;
  /** Keyed by lowercase subclass name (entry.subclass.toLowerCase()). */
  subclasses?: Record<string, SubclassDefinition>;
}
