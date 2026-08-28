// Reads seeded ClassFeature rows into DerivedFeature[] — a pure leaf (no
// Prisma import); callers load the relation and pass plain rows in.
import type { RulesEdition } from "@character-sheet/shared-types";

import { abilityModifier } from "@/lib/srd/math.js";
import type { RollEffect } from "@/lib/srd/roll-effects.js";

import type { FeatImprovement } from "./resources-state.js";
import type { DerivedFeature, DerivedResource, RechargeOn } from "./types.js";

export type ResourceTotalAbility = "strength" | "dexterity" | "constitution" | "intelligence" | "wisdom" | "charisma";

export type ResourceTotalFormula =
  | number
  | "proficiencyBonus"
  | { abilityMod: ResourceTotalAbility; plus?: number; min?: number }
  | { levelTimes: number };

// Tiers are ASCENDING by minLevel, last-match-wins.
export interface ResourceTotalTier {
  minLevel: number;
  total: ResourceTotalFormula;
  shortRestRegain?: number;
}

export interface ResourceTotalContext {
  level: number;
  abilityScores: Record<string, number>;
  profBonus: number;
}

// The one place ResourceTotalFormula is evaluated — add new formula cases
// here, not at a second call site.
export function evaluateResourceTotal(total: ResourceTotalFormula, ctx: ResourceTotalContext): number {
  if (typeof total === "number") return total;
  if (total === "proficiencyBonus") return ctx.profBonus;
  if ("abilityMod" in total) {
    // A missing score reads as 10 (modifier 0), matching resourceFn's own default.
    const base = abilityModifier(ctx.abilityScores[total.abilityMod] ?? 10) + (total.plus ?? 0);
    return total.min !== undefined ? Math.max(total.min, base) : base;
  }
  return total.levelTimes * ctx.level;
}

// A tier array reads as 0 below its first tier — gate the whole entry with
// EffectBuffRow.minLevel if that isn't the intent.
export function evaluateBuffModifier(modifier: BuffModifierFormula, ctx: ResourceTotalContext): number {
  if (!Array.isArray(modifier)) return evaluateResourceTotal(modifier, ctx);
  return tierAt(modifier, ctx.level)?.value ?? 0;
}

export interface ResourceDieTier {
  minLevel: number;
  die: string;
}

// Tiers are ASCENDING by minLevel, last-match-wins — same invariant as
// ResourceTotalTier/ResourceDieTier.
export interface ResourceRechargeTier {
  minLevel: number;
  recharge: RechargeOn;
}

// Tiers are ASCENDING by minLevel PER LABEL, last-match-wins per label —
// different labels interleave freely in the flat array. If you change this
// invariant, also update the ClassFeature.resourceDetailTiers schema comment.
export interface ResourceDetailTier {
  minLevel: number;
  label: string;
  value: string;
}

export interface BuffModifierTier {
  minLevel: number;
  value: number;
}

export type BuffModifierFormula = ResourceTotalFormula | BuffModifierTier[];

// Re-declared, not imported, to keep this file Prisma-free; must stay assignable from ActiveBuff.duration.
export type EffectBuffDuration = "concentration" | "while-active" | "until-rest";

// equipBodyArmor fires for any body-armor category; equip<Category>Armor
// fires only for that one category; equipShield fires for a shield in OFF_HAND.
export const CLEAR_ON_TRIGGERS = ["equipLightArmor", "equipMediumArmor", "equipHeavyArmor", "equipBodyArmor", "equipShield"] as const;
export type ClearOnTrigger = (typeof CLEAR_ON_TRIGGERS)[number];

export interface EffectBuffRow {
  key: string;
  // May equal this entry's own `key` for a marker buff with no numeric effect (modifier: 0).
  target: string;
  modifier: BuffModifierFormula;
  duration: EffectBuffDuration;
  // Gates the WHOLE ENTRY at the character's level — distinct from a tiered modifier's own minLevel axis.
  minLevel?: number;
  clearOn?: ClearOnTrigger[];
  // Display text only; DURABLE_BUFF_END_CONDITIONS holds the actual end predicate, keyed by `key`.
  endReminder?: string;
  resistDamageTypes?: string[];
  conditionImmunities?: string[];
  rollEffects?: RollEffect[];
}

export interface DerivedStatTier {
  minLevel: number;
  // number | string so a future column (e.g. crit range) can use a string like "19-20"; attacksPerAction only reads the numeric case.
  value: number | string;
}

export interface ResourceColumns {
  resourceKey?: string | null;
  resourceLabel?: string | null;
  resourceRecharge?: string | null; // RechargeOn
  resourceTotals?: ResourceTotalTier[] | null;
  resourceDieTiers?: ResourceDieTier[] | null;
  resourceRechargeTiers?: ResourceRechargeTier[] | null;
  resourceDetailTiers?: ResourceDetailTier[] | null;
}

// Evaluated against the character's CURRENTLY EQUIPPED state at activation
// time, distinct from derive-time requiresUnarmored's blanket no-armor-and-no-shield condition.
export const ARMOR_ACTIVATION_REQUIREMENTS = ["noMediumArmor", "noHeavyArmor", "noShield", "noBodyArmor"] as const;
export type ArmorActivationRequirement = (typeof ARMOR_ACTIVATION_REQUIREMENTS)[number];

export interface RequiresActiveBuffRequirement {
  requiresActiveBuff: string;
}

// Interpreted by unmetActivationRequirements.
export type ActivationRequirement = ArmorActivationRequirement | RequiresActiveBuffRequirement;

// No gate columns here: the row's own classId/subclassId/level IS the gate.
export interface ActivationColumns {
  activationCost?: string | null; // ActionCost
  resolverKind?: string | null;
  requiresUnarmored?: boolean | null;
  regrants?: string[] | null;
  activationRequires?: ActivationRequirement[] | null;
  // Static in-play announce text — buildRowAction serves it only when describeRowReminder's derived heal text yields nothing.
  reminder?: string | null;
  count?: number | null;
  // Marks a row invisible outside availableActions[] — read only by featuresFromRows' filter and the seed's own assertion.
  actionOnly?: boolean | null;
}

// Cost/effect fields are duplicated from AbilityCostColumns/EffectColumns
// rather than imported, keeping this a Prisma-free structural type that
// readAbilityCost/readEffectSpec accept without a cross-import. Effect fields
// are EffectColumns MINUS upcastDicePerLevel/cantripScaling/concentration —
// see the EffectRow comment at readEffectSpec's Fighter call site for why
// those three must never be added here.
export interface ClassFeatureRow extends ResourceColumns, ActivationColumns {
  name: string;
  level: number;
  description: string;
  edition: RulesEdition;
  costKind?: string | null;
  costPoolKey?: string | null;
  costBase?: number | null;
  costPerStep?: number | null;
  effectKind?: string | null;
  effectDiceCount?: number | null;
  effectDiceFaces?: number | null;
  effectDieSource?: string | null;
  effectModifier?: number | null;
  effectModifierSource?: string | null; // "classLevel" | "abilityMod:<ability>" — see EffectSpec.modifierSource.
  damageType?: string | null;
  attackType?: string | null;
  saveAbility?: string | null;
  saveEffect?: string | null;
  buffTarget?: string | null;
  buffModifier?: number | null;
  // Permanent derived-stat modifier, distinct from the duration-bound buff layer. Names the SERIALIZED field it feeds (e.g. "attacksPerAction").
  derivedStat?: string | null;
  derivedStatTiers?: DerivedStatTier[] | null;
  // Read directly by saveDcAbilitiesFromRows, never matched against `derivedStat` by name — a row may need both axes at once.
  saveDcAbilities?: string[] | null;
  // The same FeatImprovement vocabulary a taken feat's own `improvements` snapshot uses.
  improvements?: FeatImprovement[] | null;
  // The buff list a "toggle" resolverKind activates.
  effectBuffs?: EffectBuffRow[] | null;
  conditionImmunities?: string[] | null;
  // Gates conditionImmunities on a buff of this key being active. Absent = unconditional.
  conditionImmunitiesRequireActiveBuff?: string | null;
  // "clear" | "suspend" — what happens to an existing matching condition when the gating buff above starts.
  conditionImmunitiesOnBuffStart?: "clear" | "suspend" | null;
}

// classRows must arrive already subclassId: null filtered by the caller's
// include; subclassRows is whatever the active subclass's features relation loaded.
export interface ClassFeatureRowsCarrier {
  classRows: ClassFeatureRow[];
  subclassRows: ClassFeatureRow[];

  // The seeded CharacterClass.subclassLevel (PHB'14 subclass grant level).
  // Undefined only for narrow-select callers that carry no class relation, in
  // which case isSubclassActive falls back to the TS module's own grantLevel.
  subclassLevel?: number;
}

// The one place the edition rule for feature TEXT lives — a row already names
// its one edition (ClassFeature.edition is non-nullable), so this filters
// rather than defaults-to-both.
export function featuresFromRows(
  rows: readonly ClassFeatureRow[],
  level: number,
  source: "class" | "subclass",
  edition: RulesEdition,
): DerivedFeature[] {
  return rows
    // actionOnly rows carry only one action variant's activation columns, never player-facing text.
    .filter((row) => row.edition === edition && row.level <= level && !row.actionOnly)
    .map((row) => ({ name: row.name, level: row.level, description: row.description, source, edition: row.edition }));
}

export function improvementsFromRows(
  rows: readonly ClassFeatureRow[],
  level: number,
  edition: RulesEdition,
): FeatImprovement[] {
  return rows
    .filter((row) => row.edition === edition && row.level <= level)
    .flatMap((row) => row.improvements ?? []);
}

export interface ResolvedEffectBuff {
  key: string;
  target: string;
  modifier: number;
  duration: EffectBuffDuration;
  clearOn?: ClearOnTrigger[];
  resistDamageTypes?: string[];
  conditionImmunities?: string[];
  rollEffects?: RollEffect[];
}

export function effectBuffsFromRow(row: ClassFeatureRow, ctx: ResourceTotalContext): ResolvedEffectBuff[] {
  return (row.effectBuffs ?? [])
    .filter((buff) => buff.minLevel === undefined || ctx.level >= buff.minLevel)
    .map((buff) => ({
      key: buff.key,
      target: buff.target,
      modifier: evaluateBuffModifier(buff.modifier, ctx),
      duration: buff.duration,
      ...(buff.clearOn ? { clearOn: buff.clearOn } : {}),
      ...(buff.resistDamageTypes ? { resistDamageTypes: buff.resistDamageTypes } : {}),
      ...(buff.conditionImmunities ? { conditionImmunities: buff.conditionImmunities } : {}),
      ...(buff.rollEffects ? { rollEffects: buff.rollEffects } : {}),
    }));
}

// Last tier whose minLevel <= level; tiers are authored ascending, so scanning can stop there.
function tierAt<T extends { minLevel: number }>(tiers: readonly T[] | null | undefined, level: number): T | undefined {
  let match: T | undefined;
  for (const tier of tiers ?? []) {
    if (tier.minLevel > level) break;
    match = tier;
  }
  return match;
}

// Preserves each label's own relative tier order, which the
// ASCENDING-per-label authoring invariant (classFeatureSeedSchema's
// isAscendingByMinLevelPerLabel) requires for tierAt to resolve per group.
// If you change this grouping, also update its seed-validation twin
// groupMinLevelsByLabel — both must group identically.
function groupDetailTiersByLabel(tiers: readonly ResourceDetailTier[]): Map<string, ResourceDetailTier[]> {
  const byLabel = new Map<string, ResourceDetailTier[]>();
  for (const tier of tiers) {
    const group = byLabel.get(tier.label);
    if (group) group.push(tier);
    else byLabel.set(tier.label, [tier]);
  }
  return byLabel;
}

// Undefined rather than [] so poolFromRow omits `details` entirely.
function detailsFromRow(tiers: readonly ResourceDetailTier[] | null | undefined, level: number): { label: string; value: string }[] | undefined {
  if (!tiers?.length) return undefined;
  const details: { label: string; value: string }[] = [];
  for (const [label, labelTiers] of groupDetailTiersByLabel(tiers)) {
    const tier = tierAt(labelTiers, level);
    if (tier) details.push({ label, value: tier.value });
  }
  return details.length > 0 ? details : undefined;
}

function optionalPoolFields(
  row: ClassFeatureRow,
  ctx: ResourceTotalContext,
  totalTier: ResourceTotalTier,
): Pick<DerivedResource, "die" | "shortRestRegain" | "details"> {
  const dieTier = tierAt(row.resourceDieTiers, ctx.level);
  const details = detailsFromRow(row.resourceDetailTiers, ctx.level);
  return {
    ...(dieTier ? { die: dieTier.die } : {}),
    ...(totalTier.shortRestRegain !== undefined ? { shortRestRegain: totalTier.shortRestRegain } : {}),
    ...(details ? { details } : {}),
  };
}

// The pool's description IS the row's own description, never a second string (#1528).
function poolFromRow(row: ClassFeatureRow, ctx: ResourceTotalContext): DerivedResource | null {
  if (!row.resourceKey) return null;
  const totalTier = tierAt(row.resourceTotals, ctx.level);
  if (!totalTier) return null;
  return {
    key: row.resourceKey,
    label: row.resourceLabel ?? row.name,
    total: evaluateResourceTotal(totalTier.total, ctx),
    recharge: tierAt(row.resourceRechargeTiers, ctx.level)?.recharge ?? (row.resourceRecharge as RechargeOn | null) ?? "none",
    ...optionalPoolFields(row, ctx, totalTier),
    description: row.description,
  };
}

// A base row's resourceKey that an active subclass's own row ALSO declares
// resolves from that subclass row instead — the row-driven counterpart to a
// resourceFn receiving the active subclassKey (#906). Swaps the WHOLE row
// (every descriptor column moves together), never a per-column merge, so a
// subclass's variant pool (e.g. druid Circle of the Moon's wildShape) reads
// as one coherent row, not a base/subclass hybrid.
function findOverrideRow(
  overrideRows: readonly ClassFeatureRow[] | undefined,
  resourceKey: string,
  level: number,
  edition: RulesEdition,
): ClassFeatureRow | undefined {
  return overrideRows?.find((row) => row.resourceKey === resourceKey && row.edition === edition && row.level <= level);
}

export function poolsFromRows(
  rows: readonly ClassFeatureRow[],
  level: number,
  abilityScores: Record<string, number>,
  profBonus: number,
  edition: RulesEdition,
  // The active subclass's own rows (undefined when no subclass is active) —
  // see findOverrideRow above. Only deriveBaseLayer passes this; a subclass
  // layer's own poolsFromRows call never needs to override itself.
  overrideRows?: readonly ClassFeatureRow[],
): DerivedResource[] {
  const pools: DerivedResource[] = [];
  for (const row of rows) {
    if (row.edition !== edition || row.level > level) continue;
    const sourceRow = row.resourceKey ? (findOverrideRow(overrideRows, row.resourceKey, level, edition) ?? row) : row;
    const pool = poolFromRow(sourceRow, { level, abilityScores, profBonus });
    if (pool) pools.push(pool);
  }
  return pools;
}

// Max over every qualifying row (not the first match) so a base-class row and
// a subclass row can compose. undefined means no qualifying row; the caller
// supplies the floor.
export function derivedStatFromRows(
  rows: readonly ClassFeatureRow[],
  level: number,
  edition: RulesEdition,
  stat: string,
): number | undefined {
  let best: number | undefined;
  for (const row of rows) {
    if (row.edition !== edition || row.level > level || row.derivedStat !== stat) continue;
    const tier = tierAt(row.derivedStatTiers, level);
    if (tier === undefined || typeof tier.value !== "number") continue;
    best = best === undefined ? tier.value : Math.max(best, tier.value);
  }
  return best;
}

// The trigger for a closed-form announced save DC; the arithmetic lives in
// deriveAnnouncedSaveDC. Read directly, not via a `derivedStat` name match,
// since a row may spend its one derivedStat slot on something else.
export function saveDcAbilitiesFromRows(
  rows: readonly ClassFeatureRow[],
  level: number,
  edition: RulesEdition,
): string[] | undefined {
  for (const row of rows) {
    if (row.edition !== edition || row.level > level) continue;
    if (row.saveDcAbilities && row.saveDcAbilities.length > 0) return row.saveDcAbilities;
  }
  return undefined;
}

// deriveImmuneConditions unions this with buff-declared immunity into the
// actual immune set.
export function conditionImmunitiesFromRows(
  rows: readonly ClassFeatureRow[],
  level: number,
  edition: RulesEdition,
  activeBuffKeys: ReadonlySet<string>,
): string[] {
  const out = new Set<string>();
  for (const row of rows) {
    if (row.edition !== edition || row.level > level || !row.conditionImmunities?.length) continue;
    if (row.conditionImmunitiesRequireActiveBuff && !activeBuffKeys.has(row.conditionImmunitiesRequireActiveBuff)) continue;
    for (const key of row.conditionImmunities) out.add(key);
  }
  return [...out];
}
