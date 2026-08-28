// ClassFeature catalog (#1522/#1523): every class's literal seed rows,
// concatenated into CLASS_FEATURES, plus the zod schema that validates them.
// DATA MODULE ONLY (#1277 AC 4, machine-enforced by
// scripts/check-seed-data-modules.sh): no database calls or async write logic
// here — the executable seeder is seedClassFeatures.
import { z } from "zod";

import {
  ARMOR_ACTIVATION_REQUIREMENTS,
  CLEAR_ON_TRIGGERS,
  type ActivationRequirement,
  type BuffModifierFormula,
  type ChoiceCountTier,
  type EffectBuffRow,
  type InitiativeRegenRow,
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

// Classes whose CLASS_FEATURES rows are authored as literal seed data (all
// twelve). Exported so tests key off one authoritative set per side — the
// lowercase LITERAL_ROW_CLASSES twin in class-subclasses.fixture.ts stays
// separate only because a src file importing anything under prisma/ is a
// TS6059 compile error (rootDir "src").
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

// The seed-authoring shape for one ClassFeature DB row. Descriptor fields
// mirror ClassFeature's columns 1:1 (writeResolvedRows walks DESCRIPTOR_RESET's
// key set). `edition` is REQUIRED, unlike other edition-tagged seed rows:
// each class's own expand() has already split every row one-per-edition, so
// there is no "omitted = shared" case, mirroring the DB column's
// non-nullability.
export interface ClassFeatureSeedRow {
  // Must match a CharacterClass.name seed row — title case, not registry.ts's
  // lowercase dispatch key.
  className: string;
  subclassSlug: SubclassSlug | null;
  name: string;
  level: number;
  description: string;
  edition: SeedEdition;
  resourceKey?: string;
  resourceLabel?: string;
  resourceRecharge?: string;
  // `total` is typed ResourceTotalFormula (not inlined): rows are handed to
  // ClassFeatureRow[]-typed parameters in seed tests, and a structurally
  // widened local literal would fail that assignment instead of catching a
  // typo'd ability name at compile time.
  resourceTotals?: { minLevel: number; total: ResourceTotalFormula; shortRestRegain?: number }[];
  resourceDieTiers?: { minLevel: number; die: string }[];
  resourceRechargeTiers?: { minLevel: number; recharge: RechargeOn }[];
  resourceDetailTiers?: { minLevel: number; label: string; value: string }[];
  resourceOnInitiative?: InitiativeRegenRow[];
  choiceKey?: string;
  choiceLabel?: string;
  choiceCatalogSource?: string;
  choiceCountTiers?: ChoiceCountTier[];
  activationCost?: string;
  resolverKind?: string;
  requiresUnarmored?: boolean;
  regrants?: string[];
  activationRequires?: ActivationRequirement[];
  reminder?: string;
  count?: number;
  // `true` requires `activationCost` + `resourceKey` (classFeatureSeedSchema).
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
  saveDcAbilities?: string[];
  improvements?: FeatImprovement[];
  effectBuffs?: EffectBuffRow[];
  conditionImmunities?: string[];
  conditionImmunitiesRequireActiveBuff?: string;
  conditionImmunitiesOnBuffStart?: "clear" | "suspend";
}

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

// Tier arrays are ASCENDING by minLevel, last-match-wins (#1522). Each tier
// schema below stays a plain (non-generic) zod object — a generic factory
// spreading into z.object's shape defeats TS's inference of the merged shape
// — but every one `.refine`s this same predicate, so the invariant has
// exactly one definition.
function isAscendingByMinLevel(tiers: { minLevel: number }[]): boolean {
  return tiers.every((tier, i) => i === 0 || tier.minLevel > tiers[i - 1].minLevel);
}

const ASCENDING_TIER_MESSAGE = { message: "tier array must be strictly ascending by minLevel" };

// The per-column tier schemas stay un-exported: classFeatureSeedSchema is the
// one validation surface anything outside this file should parse against.
// A tier's `total` may be a formula (#1685) — mirrors ResourceTotalFormula
// field-for-field; evaluateResourceTotal is the one interpreter.
const resourceTotalFormulaSchema = z.union([
  z.number().int().nonnegative(),
  z.literal("proficiencyBonus"),
  z.object({
    abilityMod: z.enum(["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"]),
    // An additive offset applied before `min` floors the sum — PHB'14 p.84
    // cites Divine Sense's own "1 + Charisma modifier" formula, not any floor
    // (nonnegative: nothing downstream guards a negative pool total).
    plus: z.number().int().nonnegative().optional(),
    // A floor for the modifier (+ plus, if set), never a source of negative totals (#1685).
    min: z.number().int().nonnegative().optional(),
  }),
  z.object({ levelTimes: z.number().int().positive() }),
]);

const resourceTotalsTierSchema = z
  .array(
    z.object({
      minLevel: z.number().int().positive(),
      total: resourceTotalFormulaSchema,
      shortRestRegain: z.number().int().nonnegative().optional(),
    }),
  )
  .refine(isAscendingByMinLevel, ASCENDING_TIER_MESSAGE);
const resourceDieTiersSchema = z
  .array(z.object({ minLevel: z.number().int().positive(), die: z.string().min(1) }))
  .refine(isAscendingByMinLevel, ASCENDING_TIER_MESSAGE);
// Mirrors RechargeOn — the vocabulary poolFromRow's flat `resourceRecharge`
// scalar reads, now also usable per tier.
const RECHARGE_ON_VALUES = ["shortRest", "longRest", "short-or-long", "none"] as const;
const resourceRechargeTiersSchema = z
  .array(z.object({ minLevel: z.number().int().positive(), recharge: z.enum(RECHARGE_ON_VALUES) }))
  .min(1) // an empty tier array is authoring garbage
  .refine(isAscendingByMinLevel, ASCENDING_TIER_MESSAGE);
const derivedStatTiersSchema = z
  .array(z.object({ minLevel: z.number().int().positive(), value: z.union([z.number(), z.string()]) }))
  .refine(isAscendingByMinLevel, ASCENDING_TIER_MESSAGE);
const choiceCountTiersSchema = z
  .array(z.object({ minLevel: z.number().int().positive(), count: z.number().int().positive() }))
  .min(1) // an empty tier array is authoring garbage, same as resourceRechargeTiers
  .refine(isAscendingByMinLevel, ASCENDING_TIER_MESSAGE);

// resourceDetailTiers' own invariant (#1685): ASCENDING by minLevel PER
// LABEL, not globally — labels interleave freely in the flat array. Reuses
// isAscendingByMinLevel per label, never a second ordering predicate.
// If you change this grouping, also update its resolution twin
// groupDetailTiersByLabel — both must group identically.
function groupMinLevelsByLabel(tiers: { minLevel: number; label: string }[]): number[][] {
  const byLabel = new Map<string, number[]>();
  for (const tier of tiers) {
    const levels = byLabel.get(tier.label);
    if (levels) levels.push(tier.minLevel);
    else byLabel.set(tier.label, [tier.minLevel]);
  }
  return [...byLabel.values()];
}

function isAscendingByMinLevelPerLabel(tiers: { minLevel: number; label: string }[]): boolean {
  return groupMinLevelsByLabel(tiers).every((levels) => isAscendingByMinLevel(levels.map((minLevel) => ({ minLevel }))));
}

// Not ASCENDING_TIER_MESSAGE: that describes a GLOBAL ascending order, which
// is not this schema's rule.
const PER_LABEL_ASCENDING_TIER_MESSAGE = { message: "each label's tiers must be ascending by minLevel" };

const resourceDetailTiersSchema = z
  .array(z.object({ minLevel: z.number().int().positive(), label: z.string().min(1), value: z.string().min(1) }))
  .min(1) // an empty tier array is authoring garbage, same as resourceRechargeTiers
  .refine(isAscendingByMinLevelPerLabel, PER_LABEL_ASCENDING_TIER_MESSAGE);

// Additive minLevel entries (InitiativeRegenRow) — deliberately no ascending refine, unlike the tier schemas above.
const initiativeRegenBonusHealSchema = z.object({
  sourceName: z.string().min(1),
  dieFaces: z.union([z.number().int().positive(), z.literal("martialArtsDie")]),
  flatBonus: resourceTotalFormulaSchema.optional(),
});

function hasUniqueInitiativeRegenIds(entries: { id: string }[]): boolean {
  return new Set(entries.map((entry) => entry.id)).size === entries.length;
}

const resourceOnInitiativeSchema = z
  .array(
    z.object({
      id: z.string().min(1),
      amount: z.union([z.literal("all"), z.number().int().positive()]),
      minLevel: z.number().int().positive().optional(),
      oncePerLongRest: z.boolean().optional(),
      threshold: z.number().int().nonnegative().optional(),
      bonusHeal: initiativeRegenBonusHealSchema.optional(),
    }),
  )
  .min(1) // an empty tier array is authoring garbage, same as resourceRechargeTiers/resourceDetailTiers
  .refine(hasUniqueInitiativeRegenIds, {
    message: "resourceOnInitiative ids must be unique within one row's array (the id disambiguates once-per-long-rest markers)",
  });

// effectBuffs' `modifier` (#1686): evaluateBuffModifier's vocabulary — a
// formula OR a tier array (same ascending invariant); `value` mirrors
// derivedStatTiersSchema's naming since this scales a modifier, not a pool.
const buffModifierTiersSchema = z
  .array(z.object({ minLevel: z.number().int().positive(), value: z.number() }))
  .refine(isAscendingByMinLevel, ASCENDING_TIER_MESSAGE);
const buffModifierFormulaSchema: z.ZodType<BuffModifierFormula> = z.union([resourceTotalFormulaSchema, buffModifierTiersSchema]);

// Mirrors RollEffect's advantage/disadvantage form (#486) — no seeded content
// authors a flat roll modifier yet.
const rollEffectSchema = z.object({
  mode: z.enum(["advantage", "disadvantage"]),
  kind: z.enum(["attack", "check", "save", "initiative"]),
  ability: z.string().min(1).optional(),
});

// Every `target` a row-declared buff may name (#1686): the 18 skill keys plus
// the derived-stat keys buildTargetModifiers actually sums — widen this list
// only in the SAME diff that adds a new consumer, never speculatively. A
// marker buff (`target === key`) is admitted by the `.refine` below instead.
const KNOWN_BUFF_TARGETS: readonly string[] = [
  ...SKILL_KEYS,
  "meleeDamage",
  "attackRoll",
  "ac",
  "acFloor",
  "acUnarmoredBase",
  "speed",
];

// EffectBuffRow's seed-time mirror (#1686).
const effectBuffSchema = z
  .object({
    key: z.string().min(1),
    target: z.string().min(1),
    modifier: buffModifierFormulaSchema,
    duration: z.enum(["concentration", "while-active", "until-rest"]),
    minLevel: z.number().int().positive().optional(),
    clearOn: z.array(z.enum(CLEAR_ON_TRIGGERS)).optional(),
    endReminder: z.string().min(1).optional(),
    resistDamageTypes: z.array(z.string().min(1)).optional(),
    conditionImmunities: z.array(z.string().min(1)).optional(),
    rollEffects: z.array(rollEffectSchema).optional(),
  })
  .refine((buff) => buff.target === buff.key || KNOWN_BUFF_TARGETS.includes(buff.target), {
    message: "effectBuffs target must be a known skill/stat key, or equal the buff's own `key` (a marker buff)",
  });
const effectBuffsSchema = z.array(effectBuffSchema);

// The closed `activationRequires` vocabulary (#1688). No cross-row check that
// a requiresActiveBuff key resolves to a real effectBuffs entry — it can
// legitimately name a DIFFERENT row's buff (Song of Defense names Bladesong's).
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

// classFeatureSeedSchema's refine predicate, split out to stay under the seed
// CC ceiling (prisma/seed/** carries no coverage instrumentation, so CRAP
// floors at CC^2+CC). The `.refine` call site's message states the rule.
function rechargeTiersCoverPoolStart(row: RechargeGapRow): boolean {
  const rechargeStart = firstMinLevel(row.resourceRechargeTiers);
  if (rechargeStart === undefined || row.resourceRecharge !== undefined) return true;
  const poolStart = firstMinLevel(row.resourceTotals);
  return poolStart === undefined || rechargeStart <= poolStart;
}

interface OnInitiativeGuardRow {
  resourceOnInitiative?: unknown[] | null;
  resourceKey?: string;
  resourceTotals?: unknown[] | null;
}

function onInitiativeDeclaresItsPool(row: OnInitiativeGuardRow): boolean {
  if (!row.resourceOnInitiative) return true;
  return Boolean(row.resourceKey) && Boolean(row.resourceTotals?.length);
}

interface ChoiceColumnsRow {
  choiceKey?: string;
  choiceLabel?: string;
  choiceCatalogSource?: string;
  choiceCountTiers?: unknown[] | null;
}

function choiceColumnsDeclareTogether(row: ChoiceColumnsRow): boolean {
  const trio = [row.choiceKey, row.choiceCatalogSource, row.choiceCountTiers];
  const trioComplete = trio.every(Boolean);
  if (!trioComplete && trio.some(Boolean)) return false;
  return trioComplete || !row.choiceLabel;
}

interface ChoiceScopeRow {
  choiceKey?: string;
  subclassSlug: string | null;
}

// Base-class rows never reach deriveSubclassChoiceList, so a class-scoped declaration would be silently dead (#899).
function choiceRowIsSubclassScoped(row: ChoiceScopeRow): boolean {
  return !row.choiceKey || row.subclassSlug !== null;
}

interface ChoiceTierGapRow {
  level: number;
  choiceCountTiers?: { minLevel: number }[] | null;
}

// A first tier below the row's own level is unreachable: choicesFromRows' row-level gate fires first.
function choiceTiersStartAtOrAfterRowLevel(row: ChoiceTierGapRow): boolean {
  const tiersStart = firstMinLevel(row.choiceCountTiers);
  return tiersStart === undefined || tiersStart >= row.level;
}

// Run at seed time (prisma/seed/validate.ts). Only the identity fields are
// required; descriptor fields are declared so a population pass is validated
// by this SAME schema, never a second one.
export const classFeatureSeedSchema = z
  .object({
    className: z.string().min(1),
    subclassSlug: z.enum(SUBCLASS_SLUGS).nullable(),
    name: z.string().min(1),
    level: z.number().int().positive(),
    description: z.string().min(1),
    edition: z.enum(["EDITION_2014", "EDITION_2024"]),
    // Declared here (not just on ClassFeatureSeedRow) so the cross-field
    // `.refine`s below can see it — same for activationCost/resourceKey.
    resourceRecharge: z.enum(RECHARGE_ON_VALUES).optional(),
    resourceTotals: resourceTotalsTierSchema.nullable().optional(),
    resourceDieTiers: resourceDieTiersSchema.nullable().optional(),
    resourceRechargeTiers: resourceRechargeTiersSchema.nullable().optional(),
    resourceDetailTiers: resourceDetailTiersSchema.nullable().optional(),
    resourceOnInitiative: resourceOnInitiativeSchema.nullable().optional(),
    choiceKey: z.string().min(1).optional(),
    choiceLabel: z.string().min(1).optional(),
    choiceCatalogSource: z.string().min(1).optional(),
    choiceCountTiers: choiceCountTiersSchema.nullable().optional(),
    derivedStatTiers: derivedStatTiersSchema.nullable().optional(),
    saveDcAbilities: z.array(z.string().min(1)).optional(),
    // The SAME zod a taken feat's improvements snapshot validates against
    // (#1691), never a second declaration.
    improvements: z.array(featImprovementSchema).nullable().optional(),
    effectBuffs: effectBuffsSchema.nullable().optional(),
    activationRequires: activationRequiresSchema.nullable().optional(),
    reminder: z.string().min(1).nullable().optional(),
    conditionImmunities: z.array(z.string().min(1)).optional(),
    conditionImmunitiesRequireActiveBuff: z.string().min(1).optional(),
    conditionImmunitiesOnBuffStart: z.enum(["clear", "suspend"]).optional(),
    activationCost: z.string().min(1).optional(),
    resourceKey: z.string().min(1).optional(),
    count: z.number().int().optional(),
    actionOnly: z.boolean().optional(),
  })
  .refine((row) => !row.actionOnly || (Boolean(row.activationCost) && Boolean(row.resourceKey)), {
    message: "an actionOnly row must declare both activationCost and resourceKey",
  })
  // resourceRecharge is the ONLY fallback poolFromRow reads below a row's
  // first recharge tier.
  .refine(rechargeTiersCoverPoolStart, {
    message:
      'resourceRechargeTiers with no resourceRecharge fallback must reach its first tier at or before resourceTotals\' first tier, or the pool would silently recharge "none" below it',
  })
  .refine(onInitiativeDeclaresItsPool, {
    message: "a row with resourceOnInitiative must also declare resourceKey and a non-empty resourceTotals",
  })
  .refine(choiceColumnsDeclareTogether, {
    message: "choiceKey, choiceCatalogSource, and choiceCountTiers must all be present or all be absent, and choiceLabel must not appear without them",
  })
  .refine(choiceRowIsSubclassScoped, {
    message: "choice columns are only valid on a subclass-scoped row (subclassSlug must not be null)",
  })
  .refine(choiceTiersStartAtOrAfterRowLevel, {
    message: "choiceCountTiers' first tier minLevel must be >= the row's own level, or it would silently never fire at its authored level",
  });
