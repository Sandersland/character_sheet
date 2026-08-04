// #1524: reads seeded ClassFeature rows (#1522/#1523) into DerivedFeature[] —
// the read-time counterpart to prisma/seed/class-features.ts's write-time
// expandFeatureRow. A structural row type (no Prisma import) keeps this a
// pure leaf, same as lib/spellcasting/granted-spells.ts's GrantedSpellSource
// pattern: the caller loads the relation (characterInclude,
// lib/character/character-include.ts) and hands the plain rows in — nothing
// here ever touches the database.
import type { RulesEdition } from "@character-sheet/shared-types";

import { abilityModifier } from "@/lib/srd/math.js";

import type { DerivedFeature, DerivedResource, RechargeOn } from "./types.js";

/** The six abilities a `{ abilityMod }` formula tier (below) may name. */
export type ResourceTotalAbility = "strength" | "dexterity" | "constitution" | "intelligence" | "wisdom" | "charisma";

/**
 * A tier's `total` (#1685/#416's C3 evaluator): either the pre-existing flat
 * number, or a formula that reads the same inputs every `resourceFn` already
 * received — `"proficiencyBonus"`, an ability modifier (`min` floors it, the
 * `Math.max(1, mod)` shape Dark One's Own Luck/Tireless/Nature's Veil/
 * Moonlight Step all share), or `level x N` (the Lay on Hands *shape* —
 * Lay on Hands itself stays resourceFn; see paladin.ts's own header for why).
 * evaluateResourceTotal below is the one place this vocabulary is
 * interpreted.
 */
export type ResourceTotalFormula = number | "proficiencyBonus" | { abilityMod: ResourceTotalAbility; min?: number } | { levelTimes: number };

/**
 * A tiered resource total — ASCENDING by minLevel, last-match-wins (#1522
 * decision). `shortRestRegain` rides the SAME tier object as `total`/`die`
 * rather than a fifth top-level column (#1528): it is the #1221 partial
 * short-rest top-up (SRD 5.2 p.48's "regain one expended use on a Short Rest"),
 * which the shipped `resourceTotals`/`resourceDieTiers` columns (#1523) had no
 * slot for — extending the JSON tier shape costs no migration, unlike a new
 * scalar column would. Second Wind's 2024 row is the one consumer today.
 */
export interface ResourceTotalTier {
  minLevel: number;
  total: ResourceTotalFormula;
  shortRestRegain?: number;
}

/** The per-character inputs a formula `total` may read — identical to `ResourceFn`'s own (level, abilityScores, profBonus), minus `subclassKey`/`edition` (poolFromRow's row is already scoped to both). */
export interface ResourceTotalContext {
  level: number;
  abilityScores: Record<string, number>;
  profBonus: number;
}

/**
 * Resolves one tier's `total` to a number — the ONE evaluator for the
 * ResourceTotalFormula vocabulary, exported so #1686 (row-declared buff
 * modifiers) can reuse it unchanged for `buffModifier` instead of growing a
 * second copy: a new formula case belongs here, once, not at a second call
 * site.
 */
export function evaluateResourceTotal(total: ResourceTotalFormula, ctx: ResourceTotalContext): number {
  if (typeof total === "number") return total;
  if (total === "proficiencyBonus") return ctx.profBonus;
  if ("abilityMod" in total) {
    const mod = abilityModifier(ctx.abilityScores[total.abilityMod] ?? 10);
    return total.min !== undefined ? Math.max(total.min, mod) : mod;
  }
  return total.levelTimes * ctx.level;
}

export interface ResourceDieTier {
  minLevel: number;
  die: string;
}

/**
 * One tier of a permanent, level-gated derived-stat modifier (#1530) —
 * ASCENDING by minLevel, last-match-wins, same invariant as
 * ResourceTotalTier/ResourceDieTier. `value` is `number | string` because the
 * vocabulary is shared across future derivedStat columns (crit range, #1120,
 * would want a string like `"19-20"`); attacksPerAction only ever reads the
 * numeric case (derivedStatFromRows below).
 */
export interface DerivedStatTier {
  minLevel: number;
  value: number | string;
}

/**
 * ClassFeature's resource-block columns (schema.prisma) — the row-authored
 * counterpart to a resourceFn's returned pool. `resourceKey` absent means this
 * row declares no pool.
 */
export interface ResourceColumns {
  resourceKey?: string | null;
  resourceLabel?: string | null;
  resourceRecharge?: string | null; // RechargeOn
  resourceTotals?: ResourceTotalTier[] | null;
  resourceDieTiers?: ResourceDieTier[] | null;
}

/**
 * ClassFeature's activation-block columns — replaces a DERIVED_ACTIONS row
 * (#1528). No gate columns here: grantClass/grantSubclassSlugs/grantLevel are
 * the row's own classId/subclassId/level (one row, one gate).
 */
export interface ActivationColumns {
  activationCost?: string | null; // ActionCost
  resolverKind?: string | null;
  requiresUnarmored?: boolean | null;
  regrants?: string[] | null;
}

/**
 * The subset of a seeded ClassFeature row this module + its #1528 readers
 * need. classId/subclassId are the caller's join (characterInclude's
 * `class`/`subclassRef` relations already scope a row's partition — see
 * class-feature-rows.test.ts's no-Prisma-import assertion for why this file
 * doesn't re-derive that split).
 *
 * The cost/effect fields below are duplicated from AbilityCostColumns
 * (lib/spellcasting/ability-cost.ts) and EffectColumns (shared-types) rather
 * than imported — ability-cost.ts's PayCostContext carries a Prisma type, and
 * importing it here would drag this pure leaf's module graph through Prisma's
 * generated client (class-feature-rows.test.ts's no-Prisma-import assertion
 * only checks THIS file's own import text, but the intent — no DB coupling —
 * would still break). Structural typing is what lets a `ClassFeatureRow` be
 * passed directly to `readAbilityCost`/`readEffectSpec` at the call site
 * without either file importing the other. Effect fields are EffectColumns
 * MINUS upcastDicePerLevel/cantripScaling/concentration — see the #1528
 * EffectRow landmine comment at readEffectSpec's Fighter call site for why
 * those three must never be added here.
 */
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
  // "classLevel" | "abilityMod:<ability>" — see EffectSpec.modifierSource.
  effectModifierSource?: string | null;
  damageType?: string | null;
  attackType?: string | null;
  saveAbility?: string | null;
  saveEffect?: string | null;
  buffTarget?: string | null;
  buffModifier?: number | null;
  // Permanent derived-stat modifier block (#1530) — distinct from #900's C2b
  // buff layer, which is duration-bound. `derivedStat` names the SERIALIZED
  // field it feeds (e.g. "attacksPerAction"), so a reader can grep from the
  // wire back to the row.
  derivedStat?: string | null;
  derivedStatTiers?: DerivedStatTier[] | null;
  // The ability list a closed-form save DC is computed from (#1546) — read
  // directly by saveDcAbilitiesFromRows below, never matched against
  // `derivedStat` by name: a row may need BOTH a tiered derivedStat (Combat
  // Superiority's maneuverChoiceCount) AND this formula axis at once, and one
  // nullable String column can't name two fields. Empty/absent means "no
  // such axis" for every row but the one Battle Master row that sets it.
  saveDcAbilities?: string[] | null;
}

/**
 * Both halves of one class/subclass pairing's loaded feature rows — the
 * `deriveResources` carrier (#1524). `classRows` is already `subclassId: null`
 * filtered by the caller's include (characterInclude); `subclassRows` is
 * whatever the active subclass's own `features` relation loaded. Optional at
 * every call site through deriveEntryScopedResources' widened classEntries
 * element type (registry.ts) so the five narrow-select callers (maneuvers.ts,
 * focus-cast.ts, channel-divinity.ts, rest.ts, level-reconciliation.ts) keep
 * compiling unedited — none of them read `.features`.
 */
export interface ClassFeatureRowsCarrier {
  classRows: ClassFeatureRow[];
  subclassRows: ClassFeatureRow[];

  // The seeded CharacterClass.subclassLevel — this class's PHB'14 subclass
  // grant level (Cleric/Sorcerer/Warlock 1, Druid/Wizard 2, the rest 3), the
  // catalog column subclassGateLevel already resolves for buildClassesView,
  // character creation and the level-up ceremony. It rides HERE rather than as
  // a new deriveResources parameter because this carrier is already the
  // channel seeded class data travels on, and `edition` stays last by the
  // subclassGateLevel/#1499 convention (#1576).
  //
  // Undefined for the narrow-select callers that carry no class relation, in
  // which case isSubclassActive falls back to the TS module's own grantLevel —
  // so a class whose module still exists behaves identically either way. That
  // fallback is what makes deleting the module SAFE: without this field, doing
  // so silently moved five classes' 2014 gate to 3 (subclassGateLevel's
  // `?? 3`), leaving a character its subclass NAME and none of its FEATURES.
  subclassLevel?: number;
}

/**
 * The ONE place the edition rule for feature TEXT lives (#1374) — retired
 * from featureAppliesToEdition (registry.ts, #1524) onto seeded rows instead
 * of in-memory DerivedFeature literals. A row already names its one edition
 * (ClassFeature.edition is non-nullable, #1522 decision 3), so this filters
 * rather than defaults-to-both: a row whose edition doesn't match is simply
 * absent from the carrier's other edition, never merged in and never
 * defaulted. Filtering here — on the way OUT of the rows — rather than after
 * mergeLayers combines base+subclass layers is what keeps mergeLayers' dedup
 * from ever having to arbitrate between a fork's two halves (registry.ts).
 */
export function featuresFromRows(
  rows: readonly ClassFeatureRow[],
  level: number,
  source: "class" | "subclass",
  edition: RulesEdition,
): DerivedFeature[] {
  return rows
    .filter((row) => row.edition === edition && row.level <= level)
    .map((row) => ({ name: row.name, level: row.level, description: row.description, source, edition: row.edition }));
}

// Last tier whose minLevel <= level (ascending, last-match-wins, #1522). Tiers
// are authored in ascending order, so the first tier past `level` can never be
// followed by an earlier-qualifying one — safe to stop scanning there.
function tierAt<T extends { minLevel: number }>(tiers: readonly T[] | null | undefined, level: number): T | undefined {
  let match: T | undefined;
  for (const tier of tiers ?? []) {
    if (tier.minLevel > level) break;
    match = tier;
  }
  return match;
}

/**
 * One row's DerivedResource, or null when the row declares no pool
 * (`resourceKey` absent) or the character hasn't reached its first tier yet.
 * `description` IS the feature's `description` (#1528: never a second
 * string) — the row-driven counterpart to a resourceFn pool literal.
 */
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
    recharge: (row.resourceRecharge as RechargeOn | null) ?? "none",
    ...(totalTier.shortRestRegain !== undefined ? { shortRestRegain: totalTier.shortRestRegain } : {}),
    description: row.description,
  };
}

/**
 * Every resource pool declared across a class/subclass's rows, at one
 * character level — the row-driven counterpart to a resourceFn call
 * (`deriveBaseLayer`/`deriveSubclassLayer`, registry.ts, Fighter-gated #1528).
 * `abilityScores`/`profBonus` are the same two inputs `resourceFn` always
 * received, now threaded through for a formula-shaped `total` (#1685) — every
 * pre-existing flat-number caller is unaffected. Filters by edition + grant
 * level exactly like featuresFromRows, then drops any row with no resourceKey
 * or whose first tier isn't reached yet.
 */
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

/**
 * The MAX numeric derivedStatTiers value across every row named `stat`, at
 * one character level — the row-driven counterpart to a hardcoded per-class
 * Record (e.g. the retired EXTRA_ATTACK_TIERS, #1530). Takes the max over
 * EVERY qualifying row rather than the first match, which is what lets a
 * base-class row (Fighter's own "Extra Attack") and a subclass row (College
 * of Valor's) compose without either shadowing the other — same rationale as
 * poolsFromRows collecting every row instead of stopping at one. Filters by
 * edition + grant level exactly like featuresFromRows/poolsFromRows.
 * `undefined` return means no qualifying row at this level — the caller
 * supplies the floor (deriveAttacksPerAction's `1`), not this function.
 */
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

/**
 * The first qualifying row's `saveDcAbilities` list (#1546) — the row-driven
 * trigger for a closed-form announced save DC (8 + PB + max of these
 * abilities' modifiers; the arithmetic itself lives in
 * lib/srd/announced-save-dc.ts, alongside abilityModifier). Read directly,
 * NOT via a `derivedStat` name match like derivedStatFromRows above: Combat
 * Superiority's row already spends its one `derivedStat` slot on
 * `"maneuverChoiceCount"` (a tiered count), so the save-DC axis needs its own
 * trigger that doesn't collide with it on the same row. Filters by edition +
 * grant level exactly like derivedStatFromRows/poolsFromRows.
 */
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
