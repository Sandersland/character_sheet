// --- ClassFeature catalog (#1522/#1523) --------------------------------------
// Migrates the per-class DerivedFeature[] text that lived in twelve
// lib/classes/<class>.ts modules into seeded ClassFeature rows — no rules
// content changes here, a mechanical move with a checkable row count. Reading
// these rows (retiring featureAppliesToEdition) is #1524's job, not this
// file's; #1530 is the first descriptor column this file's own expandFeatureRow
// populates (derivedStat/derivedStatTiers, off Monk's AuthoredFeature entries
// — Barbarian's own Extra Attack tier moved to barbarian-features.ts's literal
// rows, #1223, Ranger's to ranger-features.ts's, #1230, Bard's College of
// Valor tier to bard-features.ts's, #1224, and Paladin's to
// paladin-features.ts's, #1229) — every other descriptor column below still
// resolves to DESCRIPTOR_RESET, populated nowhere yet (#1528+).
//
// Rows are DERIVED from the one remaining TS-authored class module (plus
// Fighter's, Barbarian's, Bard's, Cleric's, Druid's, Paladin's, Ranger's,
// Rogue's, Sorcerer's, Warlock's and Wizard's own literal rows, concatenated
// in below), not hand-transcribed:
// this guarantees byte-identical `description`/`level` text for the derived
// half (the migration's own acceptance criterion) and means that half's row
// count is a property of the registry, never a literal to keep in sync by
// hand.
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
import { SUBCLASS_SLUGS, type SubclassSlug } from "../../src/lib/classes/subclass-slug.js";
import type { AuthoredFeature, ClassDefinition, SubclassDefinition } from "../../src/lib/classes/types.js";
import type { FeatImprovement } from "../../src/lib/classes/resources-state.js";
import { featImprovementSchema } from "../../src/lib/srd/feats.js";
import { SKILL_KEYS } from "../../src/lib/srd/alignments.js";
import type { SeedEdition } from "./edition.js";

import { monk } from "../../src/lib/classes/monk.js";
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
// title case, not the lowercase registry.ts dispatch key. Fighter, Barbarian,
// Bard, Cleric, Druid, Paladin, Ranger, Rogue, Sorcerer, Warlock and Wizard
// are deliberately ABSENT (#1227, #1223, #1224, #1225, #1226, #1229, #1230,
// #1231, #1232, #1233, #1234): their rows are literal data
// (fighter-features.ts, barbarian-features.ts, bard-features.ts,
// cleric-features.ts, druid-features.ts, paladin-features.ts,
// ranger-features.ts, rogue-features.ts, sorcerer-features.ts,
// warlock-features.ts, wizard-features.ts), not derived from a
// ClassDefinition.features array — see LITERAL_ROW_CLASSES below.
//
// Absence here does NOT imply the class module is gone; there are FOUR
// distinct end states. `lib/classes/fighter.ts` (#1532), `lib/classes/
// barbarian.ts` (#1223) and `lib/classes/rogue.ts` (#1231) are deleted
// outright — nothing was left in them. Warlock, Wizard, Sorcerer, Cleric and
// Druid are the SECOND state: each carries a subclass `grantLevel` no seeded
// row can express today — 1 for Warlock's patrons (PHB'14 p.105), Sorcerer's
// origins (PHB'14 p.99, #1232) and Cleric's Divine Domain (PHB'14 p.57,
// #1225), 2 for Wizard's schools (PHB'14 p.114) and Druid's Circles (PHB'14
// p.66, #1226) — while subclassGateLevel's undefined-grantLevel fallback is 3,
// so deleting any of them would silently move that class's 2014 subclass gate
// (see each file's own header and #1576). Ranger (#1230) and Bard (#1224) are
// the THIRD state: each module also stays registered, but for reasons that
// have nothing to do with the gate — both subclasses' `grantLevel: 3` already
// equal the fallback. See ranger.ts's own header for the one that applies to
// it (Hunter's `choices` catalog, #899, owned by #1353 — its EDITION_2024
// Wisdom-modifier resourceFn was retired to a row by #1685) and bard.ts's own
// header for the one that applies to it (Bardic Inspiration's resourceFn — a Cha-modifier
// formula AND a level-tiered recharge, neither expressible as a row). Paladin
// (#1229) is a FOURTH state, for yet another reason: two of its three resource
// pools (divineSense, layOnHands) are formula-shaped (a Charisma-modifier
// count, a level x 5 total with a computed value in its own description)
// rather than tier tables, so `lib/classes/paladin.ts`'s `resourceFn` survives
// — only its `channelDivinity` pool (a flat/tiered total, #1221) moved onto
// its rows. All eleven are absent from CLASS_MODULES here only because their
// FEATURE TEXT has moved to seed data. `features` stays optional on
// ClassDefinition/SubclassDefinition for the one class still on the
// TS-authoring path, not because these eleven ever needed it to be.
const CLASS_MODULES: Record<string, ClassDefinition> = {
  Monk: monk,
};

// Classes whose CLASS_FEATURES rows are authored as LITERAL seed data
// (fighter-features.ts, barbarian-features.ts, bard-features.ts,
// cleric-features.ts, druid-features.ts, paladin-features.ts,
// ranger-features.ts, rogue-features.ts, sorcerer-features.ts,
// warlock-features.ts, wizard-features.ts) rather than
// derived from a lib/classes/<class>.ts module's AuthoredFeature[] arrays via
// collectRawFeatures/expandFeatureRow below. Exported so every test that needs
// to skip/scope around these classes (class-feature-migration.test.ts's
// derived-half scoping; the lowercase sibling set in
// src/lib/classes/__tests__/class-subclasses.fixture.ts, kept separate
// because backend/tsconfig.json's `rootDir: "src"` makes a src file importing
// anything under prisma/ a compile error — verified empirically, TS6059) keys
// off ONE authoritative set per side, never a second hand-maintained list.
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
]);

// One entry per DerivedFeature exactly as authored in lib/classes/<class>.ts —
// pre-expansion (an untagged feature is still ONE entry here; expandFeatureRow
// below is what turns it into two DB rows). subclassSlug comes straight off
// SubclassDefinition.slug — the same field the seeded Subclass row's `slug`
// column must equal — rather than a second SUBCLASS_IDENTITY lookup: reading
// the authoritative field directly can't drift out of sync with itself the
// way a redundant (classKey, nameKey) -> slug re-derivation could. Internal
// (not exported): CLASS_FEATURES below is the derived artifact tests and
// production code both consume; this is only its intermediate step.
interface RawFeatureRow {
  className: string;
  subclassSlug: SubclassSlug | null;
  feature: AuthoredFeature;
}

// Split from collectRawFeatures purely to keep each function's cyclomatic
// complexity low (prisma/seed/** carries no vitest coverage instrumentation —
// vitest.config.ts's coverage.include is scoped to src/**/*.ts — so a function
// here floors at the UNCOVERED CRAP formula CC^2+CC regardless of how
// thoroughly class-feature-migration.test.ts exercises it; splitting the
// branches down is the only lever, not adding coverage).
function baseFeatureRows(className: string, classDef: ClassDefinition): RawFeatureRow[] {
  // `?? []` is Fighter-shaped defensive code that never fires today (Fighter
  // is absent from CLASS_MODULES, #1227; so are Barbarian #1223, Rogue #1231,
  // Warlock #1233 and Wizard #1234) — ClassDefinition.features is optional on
  // the TYPE now that Fighter has no ClassDefinition module at all
  // (`lib/classes/fighter.ts` deleted, #1532), so every caller through this
  // shared type must narrow, even the three classes that still always set it.
  return (classDef.features ?? []).map((feature) => ({ className, subclassSlug: null, feature }));
}

// Extracted purely to keep subclassFeatureRows' own cyclomatic/CRAP score
// under the ratchet (#1227's `?? []` narrowing pushed it over 16/25 —
// prisma/seed/** carries no coverage instrumentation, see baseFeatureRows'
// comment above for why splitting is the only lever here).
function rowsForSubclass(className: string, subclassDef: SubclassDefinition): RawFeatureRow[] {
  return (subclassDef.features ?? []).map((feature) => ({ className, subclassSlug: subclassDef.slug, feature }));
}

function subclassFeatureRows(className: string, classDef: ClassDefinition): RawFeatureRow[] {
  const rows: RawFeatureRow[] = [];
  for (const subclassDef of Object.values(classDef.subclasses ?? {})) {
    rows.push(...rowsForSubclass(className, subclassDef));
  }
  return rows;
}

function collectRawFeatures(): RawFeatureRow[] {
  const rows: RawFeatureRow[] = [];
  for (const [className, classDef] of Object.entries(CLASS_MODULES)) {
    rows.push(...baseFeatureRows(className, classDef), ...subclassFeatureRows(className, classDef));
  }
  return rows;
}

// The seed-authoring shape for one ClassFeature DB row. Only the identity
// fields are populated by this migration — every descriptor column stays at
// its NULL/default reset value (#1522 decision 3's "authored once, populated
// nowhere" scope — the reset payload itself lives in seed-class-features.ts,
// the logic module, since it's part of the WRITE, not the row's identity).
// `edition` is REQUIRED (not optional): unlike every other edition-tagged seed
// row (SubclassSeed, ActionSeed, ManeuverSeed, ...), a ClassFeatureSeedRow has
// already been split one-per-edition by expandFeatureRow below — there is no
// "omitted = shared" case left by the time a row reaches this shape,
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
  activationCost?: string;
  resolverKind?: string;
  requiresUnarmored?: boolean;
  regrants?: string[];
  // Declarative activation-time gates (#1688) — see ClassFeature.activationRequires'
  // own schema.prisma comment for the vocabulary/evaluator. `ActivationRequirement`
  // is a type-only import, same reasoning as `ResourceTotalFormula` above.
  activationRequires?: ActivationRequirement[];
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
}

// Untagged (feature.edition undefined, #1522's ~256-row default) -> two rows,
// one per edition, IDENTICAL text. The derived half now has ZERO pre-forked
// names: Cleric's "Domain Spells" (#1225) was the last one, following
// Warlock's "Expanded Spell List" (#1233) off this path onto its own literal
// seed data — every RawFeatureRow reaching this function is untagged, so the
// tagged branch below exists only for a future class's own genuine fork.
function expandFeatureRow(raw: RawFeatureRow): ClassFeatureSeedRow[] {
  const base = {
    className: raw.className,
    subclassSlug: raw.subclassSlug,
    name: raw.feature.name,
    level: raw.feature.level,
    description: raw.feature.description,
    // #1530: derivedStat/derivedStatTiers. #1686 widens this to the
    // activation/cost/effectBuffs block a "toggle" resolverKind row needs
    // (Elemental Attunement, monk.ts); #1688 adds activationRequires —
    // every field `undefined` passes straight through — writeResolvedRows'
    // authoredDescriptors (seed-class-features.ts) skips undefined keys, so
    // every OTHER TS-authored row keeps resolving to DESCRIPTOR_RESET exactly
    // as before either field set existed.
    derivedStat: raw.feature.derivedStat,
    derivedStatTiers: raw.feature.derivedStatTiers,
    resourceKey: raw.feature.resourceKey,
    activationCost: raw.feature.activationCost,
    resolverKind: raw.feature.resolverKind,
    costKind: raw.feature.costKind,
    costPoolKey: raw.feature.costPoolKey,
    costBase: raw.feature.costBase,
    effectBuffs: raw.feature.effectBuffs,
    activationRequires: raw.feature.activationRequires,
  };
  const editions: SeedEdition[] = raw.feature.edition ? [raw.feature.edition] : ["EDITION_2014", "EDITION_2024"];
  return editions.map((edition) => ({ ...base, edition }));
}

// The full seed family: every derived-class row (re-derived from the
// one-class registry by class-feature-migration.test.ts, never hardcoded
// there either) PLUS Fighter's, Barbarian's, Bard's, Cleric's, Druid's,
// Paladin's, Ranger's, Rogue's, Sorcerer's, Warlock's and Wizard's literal
// rows (fighter-features.ts #1227, barbarian-features.ts #1223,
// bard-features.ts #1224, cleric-features.ts #1225, druid-features.ts #1226,
// paladin-features.ts #1229, ranger-features.ts #1230, rogue-features.ts
// #1231, sorcerer-features.ts #1232, warlock-features.ts #1233,
// wizard-features.ts #1234) — concatenated, not merged through
// expandFeatureRow, since those eleven arrays are already in final
// ClassFeatureSeedRow[] shape.
export const CLASS_FEATURES: ClassFeatureSeedRow[] = [
  ...collectRawFeatures().flatMap(expandFeatureRow),
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
// conditional type) — but all three `.refine` the SAME predicate, so the
// invariant itself has exactly one definition.
function isAscendingByMinLevel(tiers: { minLevel: number }[]): boolean {
  return tiers.every((tier, i) => i === 0 || tier.minLevel > tiers[i - 1].minLevel);
}

const ASCENDING_TIER_MESSAGE = { message: "tier array must be strictly ascending by minLevel" };

// Authored for #1528/#1530 to reuse when they first populate
// resourceTotals/resourceDieTiers/derivedStatTiers. #1530 has landed:
// expandFeatureRow above now sets derivedStatTiers on two classes' own rows
// here (Monk's Extra Attack alone — Barbarian's, Ranger's, Bard's and
// Paladin's were on this list until #1223, #1230, #1224 and #1229 made their
// rows literal, and Druid never had an Extra Attack row to begin with) and
// each literal seed file sets it directly on its own — so
// derivedStatTiersSchema is load-bearing today. resourceTotals/
// resourceDieTiers stay unset by any row THIS FILE derives — they're populated
// only on the literal seed files' rows (concatenated in below, not derived
// here) — until #1134 reaches Monk, the one class still on this file's
// TS-authoring path. When it does, this whole derived branch has a single
// consumer left and is worth retiring rather than extending.
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

// Validated at seed time (prisma/seed/validate.ts). Only the identity fields
// this migration actually populates are required; the descriptor fields are
// declared (using the tier schemas above) so a future population pass is
// validated by the SAME schema, not a second one authored later.
export const classFeatureSeedSchema = z.object({
  className: z.string().min(1),
  subclassSlug: z.enum(SUBCLASS_SLUGS).nullable(),
  name: z.string().min(1),
  level: z.number().int().positive(),
  description: z.string().min(1),
  edition: z.enum(["EDITION_2014", "EDITION_2024"]),
  resourceTotals: resourceTotalsTierSchema.nullable().optional(),
  resourceDieTiers: resourceDieTiersSchema.nullable().optional(),
  derivedStatTiers: derivedStatTiersSchema.nullable().optional(),
  saveDcAbilities: z.array(z.string().min(1)).optional(),
  // Reuses featImprovementSchema (lib/srd/feats.ts) — the SAME zod a taken
  // feat's improvements snapshot validates against (#1691) — rather than a
  // second declaration.
  improvements: z.array(featImprovementSchema).nullable().optional(),
  effectBuffs: effectBuffsSchema.nullable().optional(),
  activationRequires: activationRequiresSchema.nullable().optional(),
});
