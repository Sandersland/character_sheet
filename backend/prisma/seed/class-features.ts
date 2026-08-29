// DATA MODULE ONLY (#1277 AC 4, machine-enforced): no database calls or
// async write logic here — seedClassFeatures is the executable counterpart.
import { z } from "zod";

import {
  ARMOR_ACTIVATION_REQUIREMENTS,
  CLEAR_ON_TRIGGERS,
  type ActivationRequirement,
  type BuffModifierFormula,
  type ChoiceCountTier,
  type EffectBuffRow,
  type InitiativeRegenRow,
  type ResourceTotalAbility,
  type ResourceTotalFormula,
} from "../../src/lib/classes/class-feature-rows.js";
import type { RechargeOn } from "../../src/lib/classes/types.js";
import type { ActionCost } from "../../src/lib/classes/actions.js";
import type { AbilityCost } from "../../src/lib/spellcasting/ability-cost.js";
import { SUBCLASS_SLUGS, type SubclassSlug } from "../../src/lib/classes/subclass-slug.js";
import type { FeatImprovement } from "../../src/lib/classes/resources-state.js";
import { featImprovementSchema } from "../../src/lib/srd/feats.js";
import { SKILL_KEYS } from "../../src/lib/srd/alignments.js";
import type { EffectType, ResolutionKind } from "@character-sheet/shared-types";
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

// Exported so tests key off one authoritative set per side — a separate
// lowercase twin exists only because a src file importing anything under
// prisma/ is a TS6059 compile error (rootDir "src").
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

// `edition` is REQUIRED here, unlike other edition-tagged seed rows: each class file authors it
// as optional on its own Raw*Feature interface, and that file's own expand() splits every row
// one-per-edition before it reaches this type, mirroring the DB column's non-nullability. Omitted
// on a Raw*Feature row -> expand() seeds identical text for both editions; set -> exactly the one
// edition named. A "removed in 2024" feature means not authoring a 2024 row, never deleting the
// 2014 row. A level-shift is two rows with two `level` values, never one row edited in place.
// Descriptor fields mirror ClassFeature's columns 1:1 — writeResolvedRows walks DESCRIPTOR_RESET's
// key set.
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
  resourceRecharge?: (typeof RECHARGE_ON_VALUES)[number];
  resourceTotals?: { minLevel: number; total: ResourceTotalFormula; shortRestRegain?: number }[];
  resourceDieTiers?: { minLevel: number; die: string }[];
  resourceRechargeTiers?: { minLevel: number; recharge: RechargeOn }[];
  resourceDetailTiers?: { minLevel: number; label: string; value: string }[];
  resourceOnInitiative?: InitiativeRegenRow[];
  choiceKey?: string;
  choiceLabel?: string;
  choiceCatalogSource?: string;
  choiceCountTiers?: ChoiceCountTier[];
  activationCost?: (typeof ACTION_COST_VALUES)[number];
  resolverKind?: (typeof RESOLVER_KIND_VALUES)[number];
  requiresUnarmored?: boolean;
  regrants?: string[];
  activationRequires?: ActivationRequirement[];
  reminder?: string;
  count?: number;
  // `true` requires `activationCost` + `resourceKey` (classFeatureSeedSchema).
  actionOnly?: boolean;
  costKind?: (typeof COST_KIND_VALUES)[number];
  costPoolKey?: string;
  costBase?: number;
  costPerStep?: number;
  effectKind?: (typeof EFFECT_KIND_VALUES)[number];
  effectDiceCount?: number;
  effectDiceFaces?: number;
  effectDieSource?: string;
  effectModifier?: number;
  effectModifierSource?: (typeof EFFECT_MODIFIER_SOURCE_VALUES)[number];
  damageType?: (typeof DAMAGE_TYPE_VALUES)[number];
  attackType?: (typeof ATTACK_TYPE_VALUES)[number];
  saveAbility?: (typeof ABILITY_VALUES)[number];
  saveEffect?: (typeof SAVE_EFFECT_VALUES)[number];
  // Free string, not a derived union: KNOWN_BUFF_TARGETS is a runtime string[] built from
  // SKILL_KEYS, not a literal tuple a type can be derived from — membership is a schema-time
  // `.refine`, not a compile-time check (see classFeatureSeedSchema's buffTarget field).
  buffTarget?: string;
  buffModifier?: number;
  derivedStat?: (typeof DERIVED_STAT_VALUES)[number];
  derivedStatTiers?: { minLevel: number; value: number | string }[];
  saveDcAbilities?: (typeof ABILITY_VALUES)[number][];
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

// Tier arrays are ASCENDING by minLevel, last-match-wins (#1522).
function isAscendingByMinLevel(tiers: { minLevel: number }[]): boolean {
  return tiers.every((tier, i) => i === 0 || tier.minLevel > tiers[i - 1].minLevel);
}

const ASCENDING_TIER_MESSAGE = { message: "tier array must be strictly ascending by minLevel" };

// The six ability score keys — this is the ONE seed-side copy (exported so spells.ts,
// disciplines.ts, and channel-divinity.ts import it instead of each re-declaring it).
// `satisfies` + the coverage check make this a two-way COMPILE latch against
// ResourceTotalAbility: a member added/removed on either side fails typecheck, the same
// pattern actionResolvers.ts uses for ResolutionKind/RESOLUTION_KINDS.
export const ABILITY_VALUES = [
  "strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma",
] as const satisfies readonly ResourceTotalAbility[];
type _AbilityValuesCoverResourceTotalAbility = ResourceTotalAbility extends (typeof ABILITY_VALUES)[number] ? true : never;
const _abilityValuesCoverResourceTotalAbility: _AbilityValuesCoverResourceTotalAbility = true;
void _abilityValuesCoverResourceTotalAbility;

// Mirrors ResourceTotalFormula field-for-field; evaluateResourceTotal is the one interpreter.
const resourceTotalFormulaSchema = z.union([
  z.number().int().nonnegative(),
  z.literal("proficiencyBonus"),
  z.object({
    abilityMod: z.enum(ABILITY_VALUES),
    // PHB'14 p.84 — Divine Sense's own "1 + Charisma modifier" formula.
    plus: z.number().int().nonnegative().optional(),
    // A floor for the modifier (+ plus); never a source of negative totals (#1685).
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
  .min(1)
  .refine(isAscendingByMinLevel, ASCENDING_TIER_MESSAGE);

// resourceDetailTiers is ascending by minLevel PER LABEL, not globally
// (#1685) — labels interleave freely in the flat array. If you change this
// grouping, also update its resolution twin groupDetailTiersByLabel — both
// must group identically.
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

// Distinct from ASCENDING_TIER_MESSAGE, which describes a GLOBAL order.
const PER_LABEL_ASCENDING_TIER_MESSAGE = { message: "each label's tiers must be ascending by minLevel" };

const resourceDetailTiersSchema = z
  .array(z.object({ minLevel: z.number().int().positive(), label: z.string().min(1), value: z.string().min(1) }))
  .min(1)
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
  .min(1)
  .refine(hasUniqueInitiativeRegenIds, {
    message: "resourceOnInitiative ids must be unique within one row's array (the id disambiguates once-per-long-rest markers)",
  });

// Mirrors evaluateBuffModifier's vocabulary (#1686): a formula OR a tier
// array (same ascending invariant).
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

// Every `target` a row-declared buff may name (#1686) — widen only in the
// same diff that adds a new consumer in buildTargetModifiers. A marker buff
// (`target === key`) is admitted separately by the `.refine` below. Exported
// so channel-divinity.ts's schema (a flat ClassFeature-sibling buffTarget
// column feeding the SAME buffsByTarget consumer) can reuse it too.
export const KNOWN_BUFF_TARGETS: readonly string[] = [
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
// requiresActiveBuff resolves to a real effectBuffs entry — it can
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

// Split out to stay under the seed CC ceiling (prisma/seed/** has no coverage
// instrumentation, so CRAP floors at CC^2+CC). The `.refine` call site's
// message states the rule.
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

// Mirrors ActionCost (src/lib/classes/actions.ts) — activationCost's closed vocabulary. Two-way
// compile latch, same shape as ABILITY_VALUES above.
const ACTION_COST_VALUES = [
  "action", "bonusAction", "reaction", "free", "special",
] as const satisfies readonly ActionCost[];
type _ActionCostValuesCoverActionCost = ActionCost extends (typeof ACTION_COST_VALUES)[number] ? true : never;
const _actionCostValuesCoverActionCost: _ActionCostValuesCoverActionCost = true;
void _actionCostValuesCoverActionCost;

// Mirrors ResolutionKind (shared-types) — resolverKind is served on the wire and switched on by
// ACTION_RESOLVERS. Two-way compile latch, same shape as ABILITY_VALUES above.
const RESOLVER_KIND_VALUES = [
  "attack-picker",
  "twf-picker",
  "flurry-picker",
  "spell-picker",
  "item-picker",
  "heal-roll",
  "heal-input",
  "loadout-picker",
  "simple-confirm",
  "toggle",
  "slot-picker",
] as const satisfies readonly ResolutionKind[];
type _ResolverKindValuesCoverResolutionKind = ResolutionKind extends (typeof RESOLVER_KIND_VALUES)[number] ? true : never;
const _resolverKindValuesCoverResolutionKind: _ResolverKindValuesCoverResolutionKind = true;
void _resolverKindValuesCoverResolutionKind;

// Mirrors AbilityCost's `kind` discriminant (src/lib/spellcasting/ability-cost.ts). Two-way
// compile latch, same shape as ABILITY_VALUES above.
const COST_KIND_VALUES = ["none", "pool", "slot"] as const satisfies readonly AbilityCost["kind"][];
type _CostKindValuesCoverAbilityCostKind = AbilityCost["kind"] extends (typeof COST_KIND_VALUES)[number] ? true : never;
const _costKindValuesCoverAbilityCostKind: _CostKindValuesCoverAbilityCostKind = true;
void _costKindValuesCoverAbilityCostKind;

// Mirrors EffectType (packages/shared-types/src/effects.ts). "utility" is sometimes authored
// explicitly (Song of Defense) even though an absent effectKind resolves to the same value via
// resolveEffectType's fallback (src/lib/combat/effects.ts). Two-way compile latch, same shape as
// ABILITY_VALUES above.
const EFFECT_KIND_VALUES = ["damage", "heal", "buff", "utility"] as const satisfies readonly EffectType[];
type _EffectKindValuesCoverEffectType = EffectType extends (typeof EFFECT_KIND_VALUES)[number] ? true : never;
const _effectKindValuesCoverEffectType: _EffectKindValuesCoverEffectType = true;
void _effectKindValuesCoverEffectType;

// Every 5e damage type (SRD 5.2 / SRD 5.1 PHB'14 p.196) — a closed rules vocabulary, not open
// text. Exported so spells.ts and disciplines.ts import it instead of each re-declaring it.
export const DAMAGE_TYPE_VALUES = [
  "acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic",
  "piercing", "poison", "psychic", "radiant", "slashing", "thunder",
] as const;

// Exported so spells.ts and disciplines.ts import it instead of each re-declaring it.
export const ATTACK_TYPE_VALUES = ["attack", "save"] as const;
// The full vocabulary — exported so spells.ts imports it (spells author both values). Disciplines
// only ever author "half" (no discipline negates damage entirely on a successful save), so
// disciplines.ts keeps its own deliberately narrower local array rather than importing this one.
export const SAVE_EFFECT_VALUES = ["half", "none"] as const;

// Every derivedStat name a reader matches against — class-feature-rows.ts's
// derivedStatFromRows callers (registry.ts, srd/crit-range.ts, srd/extra-attack.ts). Adding a
// new derivedStat consumer means adding its name here too, or its rows fail seed validation.
const DERIVED_STAT_VALUES = [
  "attacksPerAction", "critRange", "expertiseChoiceCount", "maneuverChoiceCount", "toolProfChoiceCount",
] as const;

// "abilityMod:<ability>" is reserved (EffectSpec.modifierSource, shared-types/effects.ts;
// schema.prisma's effectModifierSource column comment) but no reader resolves it yet — accepting
// it here would validate content nothing acts on. Widen only alongside a real reader.
const EFFECT_MODIFIER_SOURCE_VALUES = ["classLevel"] as const;

// Named aliases for the per-class-file Raw*Feature interfaces (fighter-features.ts,
// wizard-features.ts, …) to import instead of `string` — every literal those files author is then
// checked against the SAME vocabulary classFeatureSeedSchema validates at runtime, catching a
// typo at compile time too.
export type ResourceRechargeSeed = RechargeOn;
export type ActionCostSeed = (typeof ACTION_COST_VALUES)[number];
export type ResolverKindSeed = (typeof RESOLVER_KIND_VALUES)[number];
export type CostKindSeed = (typeof COST_KIND_VALUES)[number];
export type EffectKindSeed = (typeof EFFECT_KIND_VALUES)[number];
export type DerivedStatSeed = (typeof DERIVED_STAT_VALUES)[number];
export type EffectModifierSourceSeed = (typeof EFFECT_MODIFIER_SOURCE_VALUES)[number];

// classFeatureSeedSchema is the one validation surface anything outside this
// file should parse against — the per-column tier schemas stay un-exported.
// Only the identity fields are required; descriptor fields are declared here
// too so a population pass validates against this SAME schema, never a second one.
// Not `.strict()`: tsconfig.seed.json type-checks every CLASS_FEATURES literal against
// ClassFeatureSeedRow, so TS's excess-property check already rejects a typo'd key at the
// authoring site — a runtime `.strict()` here would only duplicate that catch.
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
    resourceLabel: z.string().min(1).optional(),
    resourceTotals: resourceTotalsTierSchema.nullable().optional(),
    resourceDieTiers: resourceDieTiersSchema.nullable().optional(),
    resourceRechargeTiers: resourceRechargeTiersSchema.nullable().optional(),
    resourceDetailTiers: resourceDetailTiersSchema.nullable().optional(),
    resourceOnInitiative: resourceOnInitiativeSchema.nullable().optional(),
    choiceKey: z.string().min(1).optional(),
    choiceLabel: z.string().min(1).optional(),
    choiceCatalogSource: z.string().min(1).optional(),
    choiceCountTiers: choiceCountTiersSchema.nullable().optional(),
    derivedStat: z.enum(DERIVED_STAT_VALUES).optional(),
    derivedStatTiers: derivedStatTiersSchema.nullable().optional(),
    saveDcAbilities: z.array(z.enum(ABILITY_VALUES)).optional(),
    // The SAME zod a taken feat's improvements snapshot validates against
    // (#1691), never a second declaration.
    improvements: z.array(featImprovementSchema).nullable().optional(),
    effectBuffs: effectBuffsSchema.nullable().optional(),
    activationRequires: activationRequiresSchema.nullable().optional(),
    reminder: z.string().min(1).nullable().optional(),
    conditionImmunities: z.array(z.string().min(1)).optional(),
    conditionImmunitiesRequireActiveBuff: z.string().min(1).optional(),
    conditionImmunitiesOnBuffStart: z.enum(["clear", "suspend"]).optional(),
    activationCost: z.enum(ACTION_COST_VALUES).optional(),
    resolverKind: z.enum(RESOLVER_KIND_VALUES).optional(),
    requiresUnarmored: z.boolean().optional(),
    regrants: z.array(z.string().min(1)).optional(),
    resourceKey: z.string().min(1).optional(),
    count: z.number().int().optional(),
    actionOnly: z.boolean().optional(),
    costKind: z.enum(COST_KIND_VALUES).optional(),
    costPoolKey: z.string().min(1).optional(),
    costBase: z.number().int().nonnegative().optional(),
    costPerStep: z.number().int().nonnegative().optional(),
    effectKind: z.enum(EFFECT_KIND_VALUES).optional(),
    effectDiceCount: z.number().int().positive().optional(),
    effectDiceFaces: z.number().int().positive().optional(),
    effectDieSource: z.string().min(1).optional(),
    effectModifier: z.number().int().nonnegative().optional(),
    effectModifierSource: z.enum(EFFECT_MODIFIER_SOURCE_VALUES).optional(),
    damageType: z.enum(DAMAGE_TYPE_VALUES).optional(),
    attackType: z.enum(ATTACK_TYPE_VALUES).optional(),
    saveAbility: z.enum(ABILITY_VALUES).optional(),
    saveEffect: z.enum(SAVE_EFFECT_VALUES).optional(),
    // Free string, not z.enum: KNOWN_BUFF_TARGETS is a plain string[] built from SKILL_KEYS at
    // runtime, not a literal tuple zod can enumerate — membership is checked by the `.refine` below.
    buffTarget: z.string().min(1).optional(),
    buffModifier: z.number().int().nonnegative().optional(),
  })
  .refine((row) => !row.actionOnly || (Boolean(row.activationCost) && Boolean(row.resourceKey)), {
    message: "an actionOnly row must declare both activationCost and resourceKey",
  })
  .refine((row) => !row.buffTarget || KNOWN_BUFF_TARGETS.includes(row.buffTarget), {
    message: "buffTarget must be a known skill/stat key (see KNOWN_BUFF_TARGETS)",
    path: ["buffTarget"],
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
