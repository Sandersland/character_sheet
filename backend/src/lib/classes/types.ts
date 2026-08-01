// Shared types for the per-class definitions in classes/<class>.ts, flattened
// by classes/registry.ts into the dispatch tables deriveResources() uses.

import type { RulesEdition } from "@character-sheet/shared-types";

import type { SubclassSlug } from "./subclass-slug.js";

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
  /**
   * Partial short-rest top-up (#1221, SRD 5.2's "regain one expended use on a
   * Short Rest, and all on a Long Rest" — 2024 Rage / Channel Divinity /
   * Second Wind / Wild Shape). Orthogonal to `recharge`, which keeps meaning a
   * FULL restore on the named rest: `shortRestRegain: N` additionally regains
   * up to N expended uses on a short rest. Where `recharge` already fires on a
   * short rest (`shortRest` / `short-or-long`), the full reset wins and this
   * field is a no-op for that rest — never subtracted twice. Absent ⇒ today's
   * behaviour exactly (no partial top-up). Read only by `restPoolRegain`
   * (lib/combat/rest.ts). Independent of `onInitiative`, which fires on a
   * different trigger (combat start, not a rest) — a pool may declare both.
   */
  shortRestRegain?: number;
  description?: string;
}

/**
 * A feature exactly as authored in a lib/classes/<class>.ts module (and the
 * seed's mirroring `RawFeatureRow`, prisma/seed/class-features.ts) — the
 * pre-migration shape, kept because the twelve class modules stay the seed's
 * AUTHORING input even after #1524 (they no longer feed the derivation
 * directly; `CLASS_FEATURES` compiles from them at seed time — #1524's Fact
 * 1). `edition` optional: the ~256-entry majority never sets it (both
 * editions share the text) and #1374 rejected a blanket tagging pass to force
 * one. `DerivedFeature` below is the read-time counterpart — split out
 * because the two can no longer share one type (see its own comment).
 */
export interface AuthoredFeature {
  name: string;
  level: number;        // character level at which this feature is gained
  description: string;
  source: "class" | "subclass";
  edition?: RulesEdition;
  /**
   * ClassFeature's descriptor-column pair for a permanent, level-gated
   * derived-stat modifier (#1530) — e.g. `"attacksPerAction"` for Extra
   * Attack. Distinct from #900's C2b buff layer, which is duration-bound
   * (`while-active`/`until-rest`); these two columns are for a modifier that
   * never expires. Both threaded straight through expandFeatureRow into the
   * seeded ClassFeatureSeedRow unchanged — this file never interprets them.
   */
  derivedStat?: string;
  derivedStatTiers?: { minLevel: number; value: number | string }[];
}

/**
 * A feature as DERIVED for one character (registry.ts's deriveResources
 * output), resolved from seeded `ClassFeature` rows by `featuresFromRows`
 * (lib/classes/class-feature-rows.ts) — now the ONE place the edition rule
 * for feature TEXT lives, retiring `featureAppliesToEdition` (#1374/#1524).
 * `edition` is REQUIRED here, unlike `AuthoredFeature.edition?` above:
 * `ClassFeature.edition` is a non-nullable DB column (#1522 decision 3 — every
 * row forks one-per-edition), so every row `featuresFromRows` reads already
 * names its edition; an untagged *derived* feature would mean row-resolution
 * failed, not a valid "both editions" state. (#1524 is what makes this split
 * possible: before it, this type's `edition` was optional too, and its
 * comment claimed "absent means both editions" / "a blanket tagging pass is
 * not wanted" — both now false at the DERIVED layer, because #1522 already
 * tagged every row at the AUTHORING layer; the untagged case didn't
 * disappear, it relocated to `AuthoredFeature` above.) Still server-side
 * only: `toWireFeatures` (serialize/classes.ts) strips this field at the wire
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
 * contribute (#1317): a "choose N" count plus an announced save DC — extra
 * scalar mechanics the generic SubclassChoice count (#899) doesn't model,
 * which is why these stay hand-rolled instead of migrating onto it. Adding a
 * fourth bespoke field is a deliberate edit here, not a silent addition to the
 * wider DerivedClassInfo wire shape (the #1276 escape hatch this type closes).
 */
export interface ClassExtras {
  /** How many picks the character may hold from a level-gated "choose N" cap at this level. */
  maneuverChoiceCount?: number;
  /** DC an announced effect from that cap is rolled against: 8 + proficiency + max(Str, Dex) mod. */
  maneuverSaveDC?: number;
  /**
   * Tool-proficiency choices granted by a subclass feature at this level.
   * Undefined when no subclass feature grants a tool choice — assignDefined
   * and entryContributesExtras both branch on exactly that.
   */
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

// `subclassKey`/`edition` are both required (never optional) so `edition` can
// sit last (the subclassGateLevel pattern, #1499) — a defaulted-then-skipped
// middle parameter can't coexist with a later required one. Every existing
// resourceFn implementation still typechecks: TS structurally allows a
// function value with FEWER declared parameters than its target type (the
// extra call args are simply ignored), so only monk.ts's own resourceFn (the
// one implementation that needs `edition` for its Martial Arts die) declares
// the full parameter list.
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
 * `Partial<ClassExtras>` alone a `const out = {…}; return out` — or a spread,
 * or a DerivedClassInfo-typed variable — still smuggles arbitrary fields
 * through the Object.assign overlay in deriveResources.
 */
type ClassExtrasOnly = Partial<ClassExtras> &
  Partial<Record<Exclude<keyof DerivedClassInfo, keyof ClassExtras>, never>>;

/**
 * A subclass's bespoke level-gated choice-cap fields beyond its resources/
 * features layer — see ClassExtras. `edition` last, same rationale as
 * ResourceFn (#1499) — no subclassKey here since an ExtrasFn is already
 * scoped to one subclass.
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
   * Subclass row's own `slug` (prisma/seed/subclasses.ts). See
   * subclass-slug.ts's header for why this lives in a zero-import leaf and
   * why a declared field here, rather than rekeying the registry.ts SUBCLASSES
   * map itself, is the chosen shape.
   */
  slug: SubclassSlug;
  /**
   * The PHB'14 (2014) level at which this subclass's features/resources/extras
   * first apply — Cleric/Sorcerer/Warlock 1, Druid/Wizard 2, everything else
   * (or absent) 3. Resolved through subclassActiveAt (registry.ts's
   * isSubclassActive), which hardcodes 3 for EDITION_2024 regardless of this
   * value — mirrors CharacterClass.subclassLevel, the catalog-column half of
   * the same 2014 gate (#1308/#1291).
   */
  grantLevel?: number;
  // Optional (#1227): Fighter's subclasses carry no AuthoredFeature[] at all
  // — their text is literal seed data (prisma/seed/fighter-features.ts), and
  // collectRawFeatures/baseFeatureRows (prisma/seed/class-features.ts) treat
  // an absent array as zero rows to derive, never a crash.
  features?: AuthoredFeature[];
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
  // Optional (#1227) — same rationale as SubclassDefinition.features above.
  // Fighter is the only class today with no array at all: its base-class
  // text is literal seed data too.
  features?: AuthoredFeature[];
  resourceFn?: ResourceFn;
  /** Keyed by lowercase subclass name (entry.subclass.toLowerCase()). */
  subclasses?: Record<string, SubclassDefinition>;
}
