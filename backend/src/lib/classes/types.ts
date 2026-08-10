// Shared types for the per-class definitions in classes/<class>.ts, flattened
// by classes/registry.ts into the dispatch tables deriveResources() uses.

import type { RulesEdition } from "@character-sheet/shared-types";

import type { ActionCost } from "./actions.js";
import type { ActivationRequirement, EffectBuffRow } from "./class-feature-rows.js";
import type { FeatImprovement } from "./resources-state.js";
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
  /**
   * Fire only when the pool's REMAINING (available) count is at or below this
   * value (#1500) — e.g. 2014 Perfect Self ("when you roll initiative and
   * have no ki points remaining") is `{ amount: 4, threshold: 0 }`: it never
   * fires with 1+ ki left, and tops to 4 when it does. Absent ⇒ the old
   * implicit rule (fires whenever remaining < amount) still applies — 2024
   * Perfect Focus stays on that implicit rule deliberately (an explicit
   * `threshold: 3` would behave identically, since amount:4 alone already
   * implies a remaining<4 ⇔ remaining<=3 trigger for an integer pool, but
   * class-features-snapshot.test.ts pins Perfect Focus's exact byte shape
   * for EDITION_2024 and this slice's own AC requires no delta there).
   */
  threshold?: number;
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
  /**
   * ClassFeature's activation/resource-identity/cost/effectBuffs columns
   * (#1686) — a "toggle" resolverKind row's own descriptor block, threaded
   * straight through expandFeatureRow the same way derivedStat/
   * derivedStatTiers already are (this file never interprets any of them).
   * `resourceKey` here is the toggle's own IDENTITY (both the activate
   * action's `key` and the seed for its synthesized "end" key,
   * endActionKey) — NOT necessarily a resourceTotals-backed pool: Elemental
   * Attunement sets `resourceKey: "elementalAttunement"` with no
   * resourceTotals of its own (its cost is paid from the SHARED "focus"
   * pool via costPoolKey instead — see toggleActionsFromRow's own comment
   * for why the two axes are independent). Elemental Attunement's own
   * AuthoredFeature entry (monk.ts) is the first — and, while Monk remains
   * the one class still on this TS-authoring path, the only — consumer.
   */
  resourceKey?: string;
  activationCost?: ActionCost;
  resolverKind?: "toggle";
  costKind?: "pool" | "none";
  costPoolKey?: string;
  costBase?: number;
  effectBuffs?: EffectBuffRow[];
  // Declarative activation-time gates (#1688) — threaded straight through
  // expandFeatureRow the same way effectBuffs already is.
  activationRequires?: ActivationRequirement[];
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
  /**
   * A closed-form save DC a class/subclass row announces (#1589, renamed from
   * the Fighter-specific `maneuverSaveDC`): 8 + proficiency + max of the
   * row's `saveDcAbilities` modifiers — Battle Master maneuvers today, Cleric
   * Turn Undead/Channel Divinity or a future Monk/Barbarian/Rogue retab
   * tomorrow (deriveAnnouncedSaveDC, lib/srd/announced-save-dc.ts). Populated
   * from EITHER a base-class row or an active subclass row (registry.ts's
   * deriveRowExtras runs over both) — but stays a SINGLE scalar overlaid
   * across every class entry (deriveEntryScopedResources), so two DIFFERENT
   * entries each declaring one is a real collision, not two independent
   * values. On the read path `assignAnnouncedSaveDC` degrades rather than
   * throwing (logs a warning, keeps the primary/first-declaring entry's DC) so
   * a content/homebrew misconfiguration never 500s serializeCharacter; a loud
   * rejection is reserved for a future write/validation path. No production
   * character can hit the collision today — see cleric-features.ts's own header
   * for why Cleric deliberately still leaves `saveDcAbilities` unset despite
   * this column now being reachable.
   */
  announcedSaveDC?: number;
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
  /**
   * Flat FeatImprovement[] from every active class/subclass ClassFeature row
   * (#1691) — the row-driven twin of a taken feat's own `improvements`
   * snapshot. Optional (like subclassChoices above) rather than defaulting to
   * `[]` so the majority of DerivedClassInfo literals across the test suite
   * (none of which author a row-level grant) don't need editing for this
   * field. Consumed by applyFeatLayer (serialize/classes.ts), which merges it
   * with advancement-sourced improvements through the SAME
   * deriveImprovementBonuses/deriveImprovementProficiencies evaluator.
   */
  improvements?: FeatImprovement[];
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

/**
 * A choose-N subclass choice's swap-on-learn cadence (#1503, owner decision
 * 2026-08-03) — the choose-N analog of spellcasting-tables.ts's
 * `swapCadenceFor`, deliberately a SEPARATE function: `swapCadenceFor` keys
 * on (class, subclass) and feeds `preparedSpellCountAt`/`maxSpellLevelForClass`,
 * both spell-shaped; adding a non-caster subclass there would make it read as
 * a caster to those. Lives here (not resources.ts) so leveling/level-up-plan.ts
 * — a "no DB, no Prisma" pure planner — can call it without importing
 * resources.ts's Prisma-typed transaction machinery.
 *
 * Every choose-N choice defaults to "never" (the original, still-correct
 * policy for every OTHER choose-N feature, e.g. Ranger's Hunter's Prey
 * tiers, Barbarian totems) — "onLevelUp" is the exception, reserved for a
 * choice whose OWN 5e text states "whenever you learn a new X, you may
 * replace one you know" (PHB'14 p.80, Way of the Four Elements' Disciple of
 * the Elements). `edition` last (subclassGateLevel's pattern, #1499) even
 * though only one source/edition pair currently answers "onLevelUp" — future
 * choose-N features (#1516) extend this function, never duplicate it. Gates
 * only the LEVEL-UP CEREMONY's own swap path (LevelUpSubmission.subclassChoicesForgotten);
 * the generic forgetSubclassChoice op on POST .../resources/transactions
 * stays unrestricted, same as every other choose-N feature's forget — #1516
 * is the tracked follow-up for a global choose-N forget policy.
 */
export function subclassChoiceSwapCadence(catalogSource: string, edition: RulesEdition): "onLevelUp" | "never" {
  return catalogSource === "discipline" && edition === "EDITION_2014" ? "onLevelUp" : "never";
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
