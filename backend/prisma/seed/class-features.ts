// --- ClassFeature catalog (#1522/#1523) --------------------------------------
// Migrates the per-class DerivedFeature[] text that lived in twelve
// lib/classes/<class>.ts modules into seeded ClassFeature rows — no rules
// content changes here, a mechanical move with a checkable row count. Reading
// these rows (retiring featureAppliesToEdition) is #1524's job, not this
// file's.
//
// Rows are LITERAL data, authored once in their final DB-row shape — Monk
// (monk-features.ts, #1675) was the last class still deriving its rows from
// a TS-authored AuthoredFeature[] registry (collectRawFeatures/
// expandFeatureRow, retired by #1675 once Monk migrated); every class's rows
// are now concatenated in below the same way.
//
// DATA MODULE ONLY (#1277 AC 4, machine-enforced by
// scripts/check-seed-data-modules.sh): no direct database calls or async
// write logic may live in this file. The executable seeder is
// seed-class-features.ts — the same content/logic split spells.ts /
// rename-spells.ts already establishes, one level up from the issue's
// original filing (which named this single file for both the rows AND the
// exported seeder function; corrected here to keep the pre-existing gate
// green rather than adding a bespoke exception whose file also holds data).
import { z } from "zod";

import {
  ARMOR_ACTIVATION_REQUIREMENTS,
  CLEAR_ON_TRIGGERS,
  type ActivationRequirement,
  type BuffModifierFormula,
  type EffectBuffRow,
  type ResourceTotalFormula,
} from "../../src/lib/classes/class-feature-rows.js";
import type { RechargeOn } from "../../src/lib/classes/types.js";
import { SUBCLASS_SLUGS, type SubclassSlug } from "../../src/lib/classes/subclass-slug.js";
import type { FeatImprovement } from "../../src/lib/classes/resources-state.js";
import { featImprovementSchema } from "../../src/lib/srd/feats.js";
import { SKILL_KEYS } from "../../src/lib/srd/alignments.js";
import type { SeedEdition } from "./edition.js";

import { MONK_FEATURES } from "./monk-features.js";
import { BARBARIAN_FEATURES } from "./barbarian-features.js";
import { BARD_FEATURES } from "./bard-features.js";
import { CLERIC_FEATURES } from "./cleric-features.js";
import { DRUID_FEATURES } from "./druid-features.js";
import { FIGHTER_FEATURES } from "./fighter-features.js";
import { PALADIN_FEATURES } from "./paladin-features.js";
import { RANGER_FEATURES } from "./ranger-features.js";
import { ROGUE_FEATURES } from "./rogue-features.js";
import { SORCERER_FEATURES } from "./sorcerer-features.js";
import { WARLOCK_FEATURES } from "./warlock-features.js";
import { WIZARD_FEATURES } from "./wizard-features.js";

// className must match a CharacterClass.name seed row (catalog-data.ts) —
// title case, not the lowercase registry.ts dispatch key. All twelve classes
// are ABSENT from this file's own authoring path (#1227, #1223, #1224,
// #1225, #1226, #1229, #1230, #1231, #1232, #1233, #1234, #1675): every
// class's rows are literal data (fighter-features.ts, barbarian-features.ts,
// bard-features.ts, cleric-features.ts, druid-features.ts,
// paladin-features.ts, ranger-features.ts, rogue-features.ts,
// sorcerer-features.ts, warlock-features.ts, wizard-features.ts,
// monk-features.ts) — see LITERAL_ROW_CLASSES below.
//
// A class's own lib/classes/<class>.ts module surviving does NOT imply its
// rows aren't literal — it means the module still carries a resourceFn/
// subclass grantLevel/choices catalog no seeded row can express (see each
// module's own header for its reason; monk.ts's resourceFn — the ki/focus
// pool and three subclass pools — is why it survives #1675's migration).
// `lib/classes/fighter.ts` (#1532), `lib/classes/barbarian.ts` (#1223) and
// `lib/classes/rogue.ts` (#1231) are the only three deleted outright —
// nothing was left in them once their features moved.
//
// Classes whose CLASS_FEATURES rows are authored as LITERAL seed data.
// Exported so every test that needs to skip/scope around these classes (the
// lowercase sibling set in src/lib/classes/__tests__/class-subclasses.fixture.ts,
// kept separate because backend/tsconfig.json's `rootDir: "src"` makes a src
// file importing anything under prisma/ a compile error — verified
// empirically, TS6059) keys off ONE authoritative set per side, never a
// second hand-maintained list.
export const LITERAL_ROW_CLASSES: ReadonlySet<string> = new Set([
  "Fighter",
  "Barbarian",
  "Bard",
  "Ranger",
  "Rogue",
  "Warlock",
  "Wizard",
  "Sorcerer",
  "Cleric",
  "Druid",
  "Paladin",
  "Monk",
]);

// The seed-authoring shape for one ClassFeature DB row. Only the identity
// fields are populated by this migration — every descriptor column stays at
// its NULL/default reset value (#1522 decision 3's "authored once, populated
// nowhere" scope — the reset payload itself lives in seed-class-features.ts,
// the logic module, since it's part of the WRITE, not the row's identity).
// `edition` is REQUIRED (not optional): unlike every other edition-tagged seed
// row (SubclassSeed, ActionSeed, ManeuverSeed, ...), a ClassFeatureSeedRow has
// already been split one-per-edition by each literal seed file's own expand()
// (fighter-features.ts's pattern, followed by every other class) — there is
// no "omitted = shared" case left by the time a row reaches this shape,
// mirroring the DB column's own non-nullability.
// Descriptor fields mirror ClassFeature's columns 1:1 (schema.prisma) — added
// here (#1227) so a literal seed row (fighter-features.ts) and any future
// population pass (#1528+) share ONE row shape, never two. This migration
// itself never sets any of them (Fighter's pools stay in resourceFn, actions
// stay in DERIVED_ACTIONS): every field is optional and every row authored so
// far leaves them all undefined, so writeResolvedRows' DESCRIPTOR_RESET
// (seed-class-features.ts) is what actually lands in the DB — identical to
// every other class today.
export interface ClassFeatureSeedRow {
  className: string;
  subclassSlug: SubclassSlug | null;
  name: string;
  level: number;
  description: string;
  edition: SeedEdition;
  resourceKey?: string;
  resourceLabel?: string;
  resourceRecharge?: string;
  // shortRestRegain (#1528) rides the SAME tier object as `total` rather than
  // a fifth top-level column — see class-feature-rows.ts's ResourceTotalTier
  // for why (the #1221 partial short-rest top-up had no column to populate
  // when #1523 shipped resourceTotals). Second Wind's 2024 row is the first
  // to set it. `total: ResourceTotalFormula` (#1685) is a type-only import —
  // this row is later handed straight to a `ClassFeatureRow[]`-typed
  // parameter in several seed tests, so a structurally-widened local literal
  // (e.g. `abilityMod: string`) would silently fail that assignment instead
  // of catching a typo'd ability name at compile time.
  resourceTotals?: { minLevel: number; total: ResourceTotalFormula; shortRestRegain?: number }[];
  resourceDieTiers?: { minLevel: number; die: string }[];
  // A level-tiered recharge cadence (e.g. longRest below a threshold,
  // short-or-long from it) for a pool whose `resourceRecharge` scalar can't
  // express the change — see ClassFeature.resourceRechargeTiers' own
  // schema.prisma comment for the ASCENDING/last-match-wins invariant.
  resourceRechargeTiers?: { minLevel: number; recharge: RechargeOn }[];
  activationCost?: string;
  resolverKind?: string;
  requiresUnarmored?: boolean;
  regrants?: string[];
  // Declarative activation-time gates (#1688) — see ClassFeature.activationRequires'
  // own schema.prisma comment for the vocabulary/evaluator. `ActivationRequirement`
  // is a type-only import, same reasoning as `ResourceTotalFormula` above.
  activationRequires?: ActivationRequirement[];
  // Static in-play announce text (#1909) — see ClassFeature.reminder's own
  // schema.prisma comment for what distinguishes it from `description`.
  reminder?: string;
  // A resolved numeric fact (#1912) — see ClassFeature.count's own
  // schema.prisma comment.
  count?: number;
  // Marks a row invisible outside `availableActions[]` (#1912) — see
  // ClassFeature.actionOnly's own schema.prisma comment. `true` requires
  // `activationCost` + `resourceKey`, enforced below (classFeatureSeedSchema).
  actionOnly?: boolean;
  costKind?: string;
  costPoolKey?: string;
  costBase?: number;
  costPerStep?: number;
  effectKind?: string;
  effectDiceCount?: number;
  effectDiceFaces?: number;
  effectDieSource?: string;
  effectModifier?: number;
  effectModifierSource?: string;
  damageType?: string;
  attackType?: string;
  saveAbility?: string;
  saveEffect?: string;
  buffTarget?: string;
  buffModifier?: number;
  derivedStat?: string;
  derivedStatTiers?: { minLevel: number; value: number | string }[];
  // The ability list a closed-form announced save DC is computed from
  // (#1546) — see ClassFeature.saveDcAbilities' own schema.prisma comment for
  // why this is read directly rather than matched against derivedStat by
  // name. Only Fighter's Combat Superiority rows set it today.
  saveDcAbilities?: string[];
  // A passive, always-on grant (#1691) — see ClassFeature.improvements' own
  // schema.prisma comment. Life Domain's 2014 "Bonus Proficiency" row is the
  // proving case.
  improvements?: FeatImprovement[];
  // The row-declared while-active buff list a "toggle" resolverKind
  // activates (#1686) — see ClassFeature.effectBuffs' own schema.prisma
  // comment for the shape/evaluator. `EffectBuffRow` is a type-only import,
  // same reasoning as `ResourceTotalFormula` above.
  effectBuffs?: EffectBuffRow[];
  // #1121 — see ClassFeature.conditionImmunities/conditionImmunitiesRequireActiveBuff/
  // conditionImmunitiesOnBuffStart's own schema.prisma comments for the vocabulary.
  conditionImmunities?: string[];
  conditionImmunitiesRequireActiveBuff?: string;
  conditionImmunitiesOnBuffStart?: "clear" | "suspend";
}

// The full seed family: Fighter's, Barbarian's, Bard's, Ranger's, Rogue's,
// Warlock's, Wizard's, Sorcerer's, Cleric's, Druid's, Paladin's and Monk's
// literal rows (fighter-features.ts #1227, barbarian-features.ts #1223,
// bard-features.ts #1224, cleric-features.ts #1225, druid-features.ts #1226,
// paladin-features.ts #1229, ranger-features.ts #1230, rogue-features.ts
// #1231, sorcerer-features.ts #1232, warlock-features.ts #1233,
// wizard-features.ts #1234, monk-features.ts #1675) — concatenated, not
// merged through a shared expand step, since every array is already in
// final ClassFeatureSeedRow[] shape.
export const CLASS_FEATURES: ClassFeatureSeedRow[] = [
  ...MONK_FEATURES,
  ...FIGHTER_FEATURES,
  ...BARBARIAN_FEATURES,
  ...BARD_FEATURES,
  ...RANGER_FEATURES,
  ...ROGUE_FEATURES,
  ...WARLOCK_FEATURES,
  ...WIZARD_FEATURES,
  ...SORCERER_FEATURES,
  ...CLERIC_FEATURES,
  ...DRUID_FEATURES,
  ...PALADIN_FEATURES,
];

// Shared ascending-by-minLevel invariant (#1522 decision: tier arrays are
// ASCENDING, last-match-wins — settled here because the two shapes being
// merged disagreed: EXTRA_ATTACK_TIERS is descending/first-match while
// #1522's resourceTotals example is ascending). Each concrete tier schema
// below stays a plain (non-generic) zod object — a generic factory spreading
// a type parameter into z.object's shape defeats TS's inference of the merged
// shape (verified: `minLevel` becomes unreachable through the resulting
// conditional type) — but every one of them `.refine`s the SAME predicate, so
// the invariant itself has exactly one definition.
function isAscendingByMinLevel(tiers: { minLevel: number }[]): boolean {
  return tiers.every((tier, i) => i === 0 || tier.minLevel > tiers[i - 1].minLevel);
}

const ASCENDING_TIER_MESSAGE = { message: "tier array must be strictly ascending by minLevel" };

// Authored for #1528/#1530 to reuse as each literal class populates
// resourceTotals/resourceDieTiers/derivedStatTiers on its own rows — every
// row's descriptor columns are set directly by its literal seed file now
// (monk-features.ts included, #1675), so derivedStatTiersSchema/
// resourceTotalsTierSchema/resourceDieTiersSchema below validate all twelve
// classes' rows the same way.
// Not exported:
// classFeatureSeedSchema (below) is the surface anything outside this file —
// including class-feature-tier-schema.test.ts — should validate against,
// since that's the schema that actually ships. Exporting these three
// individually would let a caller bypass classFeatureSeedSchema's other
// fields for no benefit now that at least one is load-bearing — un-exporting
// keeps ONE validation surface.
// #1685/#416 C3: a tier's `total` may be a formula instead of a flat number
// — evaluated at read time by evaluateResourceTotal
// (src/lib/classes/class-feature-rows.ts), the ONE place this vocabulary is
// interpreted. Mirrors ResourceTotalFormula there field-for-field; the
// ability list is the same six-literal enum subclass-granted-spells.ts's
// castingAbility already uses (no shared runtime const — six strings
// repeated inline is cheaper than a cross-module coupling for a fixed list).
const resourceTotalFormulaSchema = z.union([
  z.number().int().nonnegative(),
  z.literal("proficiencyBonus"),
  z.object({
    abilityMod: z.enum(["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"]),
    // A floor for the modifier, never a source of negative totals — 0 stays
    // valid (floor at zero), negatives are rejected at seed (#1685 review).
    min: z.number().int().nonnegative().optional(),
  }),
  z.object({ levelTimes: z.number().int().positive() }),
]);

const resourceTotalsTierSchema = z
  .array(
    z.object({
      minLevel: z.number().int().positive(),
      total: resourceTotalFormulaSchema,
      // #1528: Second Wind's 2024 partial short-rest top-up (#1221) — see
      // ClassFeatureSeedRow.resourceTotals' own comment for why this rides
      // the tier object rather than a fifth top-level column.
      shortRestRegain: z.number().int().nonnegative().optional(),
    }),
  )
  .refine(isAscendingByMinLevel, ASCENDING_TIER_MESSAGE);
const resourceDieTiersSchema = z
  .array(z.object({ minLevel: z.number().int().positive(), die: z.string().min(1) }))
  .refine(isAscendingByMinLevel, ASCENDING_TIER_MESSAGE);
// Mirrors RechargeOn (lib/classes/types.ts) — the same vocabulary
// poolFromRow's flat `resourceRecharge` scalar reads, now also usable per tier.
const RECHARGE_ON_VALUES = ["shortRest", "longRest", "short-or-long", "none"] as const;
const resourceRechargeTiersSchema = z
  .array(z.object({ minLevel: z.number().int().positive(), recharge: z.enum(RECHARGE_ON_VALUES) }))
  .min(1) // an empty tier array is authoring garbage
  .refine(isAscendingByMinLevel, ASCENDING_TIER_MESSAGE);
const derivedStatTiersSchema = z
  .array(z.object({ minLevel: z.number().int().positive(), value: z.union([z.number(), z.string()]) }))
  .refine(isAscendingByMinLevel, ASCENDING_TIER_MESSAGE);

// #1686: effectBuffs' `modifier` — evaluateBuffModifier's own vocabulary
// (class-feature-rows.ts): resourceTotalFormulaSchema's formula shapes, OR a
// tier array (ASCENDING minLevel, last-match-wins, same invariant as
// resourceTotals/derivedStatTiers) — Rage's +2/+3/+4 damage bonus is the
// forcing case. `value` (not `total`) mirrors derivedStatTiersSchema's own
// naming, since this scales a MODIFIER, not a pool total.
const buffModifierTiersSchema = z
  .array(z.object({ minLevel: z.number().int().positive(), value: z.number() }))
  .refine(isAscendingByMinLevel, ASCENDING_TIER_MESSAGE);
const buffModifierFormulaSchema: z.ZodType<BuffModifierFormula> = z.union([resourceTotalFormulaSchema, buffModifierTiersSchema]);

// The state-driven roll grants (#486) a buff may carry — mirrors RollEffect
// (lib/srd/roll-effects.ts); this validator only ever needs the
// advantage/disadvantage form (AdvantageRollEffect) since no seeded content
// authors a flat roll modifier yet.
const rollEffectSchema = z.object({
  mode: z.enum(["advantage", "disadvantage"]),
  kind: z.enum(["attack", "check", "save", "initiative"]),
  ability: z.string().min(1).optional(),
});

// Every `target` a row-declared buff may name (#1686): the 18 skill keys plus
// the handful of derived-stat keys serializeCharacter's buildTargetModifiers
// actually sums (meleeDamage/attackRoll/ac/acFloor/acUnarmoredBase/speed —
// character-serialize.ts's serialize/{combat,inventory,proficiencies}.ts) —
// widen this list in the SAME diff that adds a new buffTargets[...] consumer,
// never speculatively. A marker buff (`target === key`, e.g. Elemental
// Attunement) is admitted by the object-level `.refine` below instead of
// living in this list, since it names no real stat.
const KNOWN_BUFF_TARGETS: readonly string[] = [
  ...SKILL_KEYS,
  "meleeDamage",
  "attackRoll",
  "ac",
  "acFloor",
  "acUnarmoredBase",
  "speed",
];

// One row-declared while-active buff (#1686) — EffectBuffRow's own seed-time
// mirror. `.refine` admits target === key (the marker-buff form, modifier: 0,
// Elemental Attunement's shape) as an alternative to KNOWN_BUFF_TARGETS
// membership, so a state-tracking-only toggle isn't rejected as "unknown".
const effectBuffSchema = z
  .object({
    key: z.string().min(1),
    target: z.string().min(1),
    modifier: buffModifierFormulaSchema,
    duration: z.enum(["concentration", "while-active", "until-rest"]),
    minLevel: z.number().int().positive().optional(),
    // The closed CLEAR_ON_TRIGGERS vocabulary (#1688) — a list, not a single
    // trigger, since one buff can need several (Bladesong: medium armor, OR
    // heavy armor, OR a shield).
    clearOn: z.array(z.enum(CLEAR_ON_TRIGGERS)).optional(),
    endReminder: z.string().min(1).optional(),
    resistDamageTypes: z.array(z.string().min(1)).optional(),
    // #1121, mirrors resistDamageTypes — see EffectBuffRow.conditionImmunities'
    // own comment for why no production row sets this yet.
    conditionImmunities: z.array(z.string().min(1)).optional(),
    rollEffects: z.array(rollEffectSchema).optional(),
  })
  .refine((buff) => buff.target === buff.key || KNOWN_BUFF_TARGETS.includes(buff.target), {
    message: "effectBuffs target must be a known skill/stat key, or equal the buff's own `key` (a marker buff)",
  });
const effectBuffsSchema = z.array(effectBuffSchema);

// The closed `activationRequires` vocabulary (#1688): an armor/shield literal
// or a `requiresActiveBuff` object naming another buff's key. No cross-row
// check that the named key actually resolves to a real effectBuffs entry
// elsewhere in the seed — requiresActiveBuff can legitimately name a DIFFERENT
// row's buff (Song of Defense names Bladesong's own key), which this file has
// no cross-row pass to verify against.
const activationRequirementSchema = z.union([
  z.enum(ARMOR_ACTIVATION_REQUIREMENTS),
  z.object({ requiresActiveBuff: z.string().min(1) }).strict(),
]);
const activationRequiresSchema = z.array(activationRequirementSchema);

function firstMinLevel(tiers: { minLevel: number }[] | null | undefined): number | undefined {
  return tiers?.length ? tiers[0].minLevel : undefined;
}

interface RechargeGapRow {
  resourceRecharge?: string;
  resourceRechargeTiers?: { minLevel: number }[] | null;
  resourceTotals?: { minLevel: number }[] | null;
}

// The classFeatureSeedSchema.refine predicate below, split out to stay under
// the seed module's CC ceiling (prisma/seed/** carries no coverage
// instrumentation, so CRAP floors at CC^2+CC — see isAscendingByMinLevel's own
// comment on the same constraint). True unless a row declares
// resourceRechargeTiers with no resourceRecharge scalar fallback AND a
// resourceTotals pool that opens before the first recharge tier is reached —
// see the `.refine` call site's message for why that combination is rejected.
function rechargeTiersCoverPoolStart(row: RechargeGapRow): boolean {
  const rechargeStart = firstMinLevel(row.resourceRechargeTiers);
  if (rechargeStart === undefined || row.resourceRecharge !== undefined) return true;
  const poolStart = firstMinLevel(row.resourceTotals);
  return poolStart === undefined || rechargeStart <= poolStart;
}

// Validated at seed time (prisma/seed/validate.ts). Only the identity fields
// this migration actually populates are required; the descriptor fields are
// declared (using the tier schemas above) so a future population pass is
// validated by the SAME schema, not a second one authored later.
export const classFeatureSeedSchema = z
  .object({
    className: z.string().min(1),
    subclassSlug: z.enum(SUBCLASS_SLUGS).nullable(),
    name: z.string().min(1),
    level: z.number().int().positive(),
    description: z.string().min(1),
    edition: z.enum(["EDITION_2014", "EDITION_2024"]),
    // Declared here (not just on ClassFeatureSeedRow) so the resourceRechargeTiers
    // cross-field `.refine` below can see it.
    resourceRecharge: z.enum(RECHARGE_ON_VALUES).optional(),
    resourceTotals: resourceTotalsTierSchema.nullable().optional(),
    resourceDieTiers: resourceDieTiersSchema.nullable().optional(),
    resourceRechargeTiers: resourceRechargeTiersSchema.nullable().optional(),
    derivedStatTiers: derivedStatTiersSchema.nullable().optional(),
    saveDcAbilities: z.array(z.string().min(1)).optional(),
    // Reuses featImprovementSchema (lib/srd/feats.ts) — the SAME zod a taken
    // feat's improvements snapshot validates against (#1691) — rather than a
    // second declaration.
    improvements: z.array(featImprovementSchema).nullable().optional(),
    effectBuffs: effectBuffsSchema.nullable().optional(),
    activationRequires: activationRequiresSchema.nullable().optional(),
    reminder: z.string().min(1).nullable().optional(),
    // #1121 — see ClassFeature.conditionImmunities/conditionImmunitiesRequireActiveBuff/
    // conditionImmunitiesOnBuffStart's own schema.prisma comments for the vocabulary.
    conditionImmunities: z.array(z.string().min(1)).optional(),
    conditionImmunitiesRequireActiveBuff: z.string().min(1).optional(),
    conditionImmunitiesOnBuffStart: z.enum(["clear", "suspend"]).optional(),
    // #1912 — declared here (not just on ClassFeatureSeedRow) so the
    // `.refine` below can see them: an `actionOnly` row with no
    // activationCost/resourceKey is dead data, invisible everywhere
    // (featuresFromRows excludes actionOnly rows from feature cards;
    // rowIsAnAvailableAction/eligibleRowActions require both to serve it as
    // an action either).
    activationCost: z.string().min(1).optional(),
    resourceKey: z.string().min(1).optional(),
    count: z.number().int().optional(),
    actionOnly: z.boolean().optional(),
  })
  .refine((row) => !row.actionOnly || (Boolean(row.activationCost) && Boolean(row.resourceKey)), {
    message: "an actionOnly row must declare both activationCost and resourceKey",
  })
  // resourceRecharge is the ONLY fallback poolFromRow reads below a row's
  // first resourceRechargeTiers tier — a row with no scalar and a pool that
  // opens (resourceTotals) before that first tier is reached would silently
  // resolve to "none" at those levels, never a rules bug the seed itself catches.
  .refine(rechargeTiersCoverPoolStart, {
    message:
      'resourceRechargeTiers with no resourceRecharge fallback must reach its first tier at or before resourceTotals\' first tier, or the pool would silently recharge "none" below it',
  });
