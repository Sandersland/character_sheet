// Reads seeded ClassFeature rows into DerivedFeature[] — a pure leaf (no
// Prisma import); callers load the relation and pass plain rows in.
import type { RulesEdition } from "@character-sheet/shared-types";

import { abilityModifier } from "@/lib/srd/math.js";
import type { RollEffect } from "@/lib/srd/roll-effects.js";

import type { FeatImprovement } from "./resources-state.js";
import type { DerivedFeature, DerivedResource, RechargeOn } from "./types.js";

export type ResourceTotalAbility = "strength" | "dexterity" | "constitution" | "intelligence" | "wisdom" | "charisma";

// A tier's total: a flat number, "proficiencyBonus", an ability-modifier formula (`min` floors it), or level times N.
export type ResourceTotalFormula = number | "proficiencyBonus" | { abilityMod: ResourceTotalAbility; min?: number } | { levelTimes: number };

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
    const mod = abilityModifier(ctx.abilityScores[total.abilityMod] ?? 10);
    return total.min !== undefined ? Math.max(total.min, mod) : mod;
  }
  return total.levelTimes * ctx.level;
}

// Reuses evaluateResourceTotal for a flat formula; a tier array resolves
// last-match-wins, defaulting to 0 below every tier — gate the whole entry
// with EffectBuffRow.minLevel if that isn't the intent.
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

// The row-authored counterpart to a resourceFn's returned pool.
export interface ResourceColumns {
  resourceKey?: string | null;
  resourceLabel?: string | null;
  resourceRecharge?: string | null; // RechargeOn
  resourceTotals?: ResourceTotalTier[] | null;
  resourceDieTiers?: ResourceDieTier[] | null;
  resourceRechargeTiers?: ResourceRechargeTier[] | null;
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

// Replaces a DERIVED_ACTIONS row — no gate columns here: the row's own
// classId/subclassId/level IS the gate.
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

// Cost/effect fields below are duplicated from AbilityCostColumns/EffectColumns
// rather than imported, to keep this a Prisma-free structural type that
// readAbilityCost/readEffectSpec can accept without either file importing the
// other. Effect fields are EffectColumns MINUS upcastDicePerLevel/
// cantripScaling/concentration — see the EffectRow comment at readEffectSpec's
// Fighter call site for why those three must never be added here.
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
  // The same FeatImprovement vocabulary a taken feat's own `improvements` snapshot uses. Read by improvementsFromRows.
  improvements?: FeatImprovement[] | null;
  // The buff list a "toggle" resolverKind activates — see EffectBuffRow.
  effectBuffs?: EffectBuffRow[] | null;
  // Read by conditionImmunitiesFromRows.
  conditionImmunities?: string[] | null;
  // Gates conditionImmunities on a buff of this key being active. Absent = unconditional.
  conditionImmunitiesRequireActiveBuff?: string | null;
  // "clear" | "suspend" — what happens to an existing matching condition when the gating buff above starts.
  conditionImmunitiesOnBuffStart?: "clear" | "suspend" | null;
}

// Both halves of one class/subclass pairing's loaded feature rows — the
// deriveResources carrier. classRows is already subclassId: null filtered by
// the caller's include; subclassRows is whatever the active subclass's own
// features relation loaded.
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

// The ClassFeature twin of a taken feat's own `improvements` snapshot.
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

// One row's own effectBuffs, filtered to entries whose per-entry minLevel is
// reached, with each entry's formula/tier modifier evaluated to a number.
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

// null when the row declares no pool or the character hasn't reached its
// first tier; description IS the feature's own description, never a second string.
function poolFromRow(row: ClassFeatureRow, ctx: ResourceTotalContext): DerivedResource | null {
  if (!row.resourceKey) return null;
  const totalTier = tierAt(row.resourceTotals, ctx.level);
  if (!totalTier) return null;
  const dieTier = tierAt(row.resourceDieTiers, ctx.level);
  return {
    key: row.resourceKey,
    label: row.resourceLabel ?? row.name,
    total: evaluateResourceTotal(totalTier.total, ctx),
    ...(dieTier ? { die: dieTier.die } : {}),
    recharge: tierAt(row.resourceRechargeTiers, ctx.level)?.recharge ?? (row.resourceRecharge as RechargeOn | null) ?? "none",
    ...(totalTier.shortRestRegain !== undefined ? { shortRestRegain: totalTier.shortRestRegain } : {}),
    description: row.description,
  };
}

// Every resource pool declared across a class/subclass's rows, at one
// character level — the row-driven counterpart to a resourceFn call.
export function poolsFromRows(
  rows: readonly ClassFeatureRow[],
  level: number,
  abilityScores: Record<string, number>,
  profBonus: number,
  edition: RulesEdition,
): DerivedResource[] {
  const pools: DerivedResource[] = [];
  for (const row of rows) {
    if (row.edition !== edition || row.level > level) continue;
    const pool = poolFromRow(row, { level, abilityScores, profBonus });
    if (pool) pools.push(pool);
  }
  return pools;
}

// The MAX numeric derivedStatTiers value across every row named `stat`, at
// one character level — takes the max over every qualifying row (not the
// first match) so a base-class row and a subclass row can compose. undefined
// means no qualifying row; the caller supplies the floor.
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

// The first qualifying row's saveDcAbilities list — the trigger for a
// closed-form announced save DC (arithmetic lives in deriveAnnouncedSaveDC).
// Read directly, not via a `derivedStat` name match, since a row may spend
// its one derivedStat slot on something else.
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

// Every condition key a class/subclass's rows grant immunity to, at one
// character level, further gated on conditionImmunitiesRequireActiveBuff
// being present in activeBuffKeys. deriveImmuneConditions unions this with
// buff-declared immunity into the actual immune set.
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
