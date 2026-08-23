// Flattens the per-class definitions in classes/<class>.ts into the dispatch
// tables deriveResources() merges from, and exposes the class-features.ts
// public surface (resolveClassDie / deriveResources / deriveResourcesForCharacterRow).
import type { RulesEdition } from "@character-sheet/shared-types";

import { levelForExperience, proficiencyBonusForLevel } from "@/lib/leveling/experience.js";
import { effectiveEntryLevel, subclassActiveAt } from "@/lib/leveling/effective-levels.js";
import { logger } from "@/lib/core/logger.js";
import { editionOf } from "@/lib/rules/edition.js";
import { deriveAnnouncedSaveDC } from "@/lib/srd/srd.js";

import { bard } from "./bard.js";
import { derivedStatFromRows, featuresFromRows, improvementsFromRows, poolsFromRows, type ClassFeatureRow, type ClassFeatureRowsCarrier } from "./class-feature-rows.js";
import { druid } from "./druid.js";
import { monk } from "./monk.js";
import { paladin } from "./paladin.js";
import { ranger } from "./ranger.js";
import type { FeatImprovement } from "./resources-state.js";
import { sorcerer } from "./sorcerer.js";
import { SUBCLASS_IDENTITY, type SubclassIdentity, type SubclassSlug } from "./subclass-slug.js";
import type { ClassDefinition, ClassExtras, DerivedClassInfo, DerivedFeature, DerivedResource, DerivedSubclassChoice, SubclassDefinition } from "./types.js";

// Fighter, Barbarian, Rogue, Cleric, Warlock and Wizard have no module —
// their subclasses resolve entirely through the SUBCLASS_IDENTITY seeding
// pass below; deriveBaseLayer's optional chaining on `classDef` already
// tolerates a missing key.
const CLASSES: Record<string, ClassDefinition> = {
  bard,
  druid,
  monk,
  paladin,
  ranger,
  sorcerer,
};

// Subclass keys are global, not scoped per class. Seeded identity-only first
// (from SUBCLASS_IDENTITY), so a subclass with no TS module still resolves
// its seeded ClassFeature rows; then overlaid by each CLASSES definition, so
// a class still on the TS migration path (its own resourceFn/deriveExtras/
// choices catalog) wins over its own identity-only stub.
const SUBCLASSES: Record<string, SubclassDefinition> = {};
for (const [slug, { nameKey }] of Object.entries(SUBCLASS_IDENTITY) as [SubclassSlug, SubclassIdentity][]) {
  SUBCLASSES[nameKey] = { slug };
}
for (const classDef of Object.values(CLASSES)) {
  for (const [subclassKey, subclassDef] of Object.entries(classDef.subclasses ?? {})) {
    SUBCLASSES[subclassKey] = subclassDef;
  }
}

// Resolve a class-die reference (e.g. "superiorityDice") to its die-face count
// from derived info; null when the pool is absent or carries no die.
export function resolveClassDie(source: string, info: DerivedClassInfo): number | null {
  const die = info.resources.find((r) => r.key === source)?.die;
  if (!die) return null;
  const faces = Number(die.replace(/^d/i, ""));
  return Number.isFinite(faces) && faces > 0 ? faces : null;
}

interface ClassLayer {
  pools: DerivedResource[];
  features: DerivedFeature[];
  improvements: FeatImprovement[];
}

// A resourceFn pool wins over a row-declared pool of the same key (mirrors
// mergeLayers' base-wins policy) — defense against a class mid-migration
// (resourceFn for some pools, rows for others) ever double-declaring a key.
function mergePoolSources(fromFn: DerivedResource[], fromRows: DerivedResource[]): DerivedResource[] {
  if (fromRows.length === 0) return fromFn;
  const seenKeys = new Set(fromFn.map((p) => p.key));
  return [...fromFn, ...fromRows.filter((p) => !seenKeys.has(p.key))];
}

// Row-driven pools are DATA-gated, not class-gated: poolsFromRows reads
// whatever resourceKey a class's rows actually populate — never an
// `=== "fighter"` / `=== "barbarian"` / … check (CLAUDE.md).
function deriveBaseLayer(
  classDef: ClassDefinition | undefined,
  level: number,
  abilityScores: Record<string, number>,
  profBonus: number,
  subclassKey: string | undefined,
  featureRows: ClassFeatureRowsCarrier | undefined,
  edition: RulesEdition,
): ClassLayer {
  const fnPools = classDef?.resourceFn ? classDef.resourceFn(level, abilityScores, profBonus, subclassKey, edition) : [];
  const rowPools = poolsFromRows(featureRows?.classRows ?? [], level, abilityScores, profBonus, edition);
  return {
    pools: mergePoolSources(fnPools, rowPools),
    features: featuresFromRows(featureRows?.classRows ?? [], level, "class", edition),
    improvements: improvementsFromRows(featureRows?.classRows ?? [], level, edition),
  };
}

interface SubclassLayer extends ClassLayer {
  active: boolean;
  def: SubclassDefinition | undefined;
}

// A subclass contributes only once the character reaches its grant level,
// resolved through the same gate buildClassesView uses (subclassActiveAt).
// EDITION_2024 always hardcodes 3; EDITION_2014 prefers the seeded
// CharacterClass.subclassLevel when the caller carries it, else falls back to
// the TS module's own grantLevel — still correct for Sorcerer/Druid (whose
// modules exist), but Cleric/Warlock/Wizard have none left, so a
// narrow-select caller with no seeded value now gates them at the plain ?? 3
// default instead of their real PHB'14 gate (subclass-gate-data-source.test.ts
// pins both halves).
function isSubclassActive(
  def: SubclassDefinition | undefined,
  level: number,
  edition: RulesEdition,
  seededSubclassLevel: number | undefined,
): def is SubclassDefinition {
  if (!def) return false;
  return subclassActiveAt(level, seededSubclassLevel ?? def.grantLevel, edition);
}

// Scoped to the subclass only, gated by its grant level.
function deriveSubclassLayer(
  subclassKey: string,
  level: number,
  abilityScores: Record<string, number>,
  profBonus: number,
  featureRows: ClassFeatureRowsCarrier | undefined,
  edition: RulesEdition,
): SubclassLayer {
  const def = SUBCLASSES[subclassKey];
  if (!isSubclassActive(def, level, edition, featureRows?.subclassLevel)) {
    return { active: false, def, pools: [], features: [], improvements: [] };
  }
  // undefined, not this function's own subclassKey param — a subclass's own
  // resourceFn is already scoped to itself; the param exists so the BASE
  // layer can resolve a pool-key collision against the active subclass.
  const fnPools = def.resourceFn ? def.resourceFn(level, abilityScores, profBonus, undefined, edition) : [];
  const subclassRows = featureRows?.subclassRows ?? [];
  const rowPools = poolsFromRows(subclassRows, level, abilityScores, profBonus, edition);
  return {
    active: true,
    def,
    pools: mergePoolSources(fnPools, rowPools),
    features: featuresFromRows(subclassRows, level, "subclass", edition),
    improvements: improvementsFromRows(subclassRows, level, edition),
  };
}

// Base wins on pool-key collision; features sort by level then name;
// improvements simply concatenate (a repeated grant dedups downstream at
// deriveImprovementProficiencies' Set, lib/srd/feats.ts).
function mergeLayers(
  base: ClassLayer,
  sub: ClassLayer,
): { resources: DerivedResource[]; features: DerivedFeature[]; improvements: FeatImprovement[] } {
  const seenPoolKeys = new Set(base.pools.map((p) => p.key));
  const resources = [...base.pools, ...sub.pools.filter((p) => !seenPoolKeys.has(p.key))];
  const features = [...base.features, ...sub.features].sort(
    (a, b) => a.level - b.level || a.name.localeCompare(b.name),
  );
  const improvements = [...base.improvements, ...sub.improvements];
  return { resources, features, improvements };
}

function deriveSubclassClassExtras(
  sub: SubclassLayer,
  level: number,
  abilityScores: Record<string, number>,
  profBonus: number,
  edition: RulesEdition,
): ClassExtras | undefined {
  if (!sub.active || !sub.def?.deriveExtras) return undefined;
  return sub.def.deriveExtras(level, abilityScores, profBonus, edition);
}

// Row-driven counterpart to deriveSubclassClassExtras. maneuverChoiceCount/
// toolProfChoiceCount/expertiseChoiceCount resolve via derivedStatFromRows;
// announcedSaveDC resolves separately via deriveAnnouncedSaveDC, keyed off
// saveDcAbilities rather than a derivedStat name match (a row's one
// derivedStat slot may already be claimed by something else, e.g. Combat
// Superiority's maneuverChoiceCount). UNGATED on subclass-active: `rows` may
// be a class's own base-class rows or an active subclass's rows — the caller
// decides which, and gates the subclass call on `sub.active` itself.
function deriveRowExtras(
  rows: readonly ClassFeatureRow[],
  level: number,
  edition: RulesEdition,
  abilityScores: Record<string, number>,
  profBonus: number,
): ClassExtras | undefined {
  const extras: ClassExtras = {};
  const maneuverChoiceCount = derivedStatFromRows(rows, level, edition, "maneuverChoiceCount");
  if (maneuverChoiceCount !== undefined) extras.maneuverChoiceCount = maneuverChoiceCount;
  const toolProfChoiceCount = derivedStatFromRows(rows, level, edition, "toolProfChoiceCount");
  if (toolProfChoiceCount !== undefined) extras.toolProfChoiceCount = toolProfChoiceCount;
  // Base-class feature (Rogue/Bard/Ranger/Wizard), so this ungated pass over base rows resolves it.
  const expertiseChoiceCount = derivedStatFromRows(rows, level, edition, "expertiseChoiceCount");
  if (expertiseChoiceCount !== undefined) extras.expertiseChoiceCount = expertiseChoiceCount;
  const announcedSaveDC = deriveAnnouncedSaveDC(rows, level, edition, abilityScores, profBonus);
  if (announcedSaveDC !== undefined) extras.announcedSaveDC = announcedSaveDC;
  return Object.keys(extras).length > 0 ? extras : undefined;
}

// Subclass wins on a same-key collision with the class's own base-row extras.
function combineRowExtras(fromClassRows: ClassExtras | undefined, fromSubclassRows: ClassExtras | undefined): ClassExtras | undefined {
  if (!fromClassRows && !fromSubclassRows) return undefined;
  const merged = { ...fromClassRows, ...fromSubclassRows };
  return Object.keys(merged).length > 0 ? merged : undefined;
}

// Merges code-authored (ExtrasFn) and row-authored extras for one subclass —
// defined-wins, fn side last, so a row never silently overwrites a still-live
// ExtrasFn value on a class mid-migration. Returns undefined (not {}) when
// neither side contributes, so `extras !== undefined` is the single presence check.
function combineExtras(fromFn: ClassExtras | undefined, fromRows: ClassExtras | undefined): ClassExtras | undefined {
  if (!fromFn && !fromRows) return undefined;
  const merged = { ...fromRows, ...fromFn };
  return Object.keys(merged).length > 0 ? merged : undefined;
}

// The generic subclass "choose N" list: each catalog entry's level-gated
// count, dropping any not yet available.
function deriveSubclassChoiceList(sub: SubclassLayer, level: number): DerivedSubclassChoice[] | undefined {
  if (!sub.active || !sub.def?.choices) return undefined;
  const computed = sub.def.choices
    .map((c) => ({ key: c.key, label: c.label, catalogSource: c.catalogSource, count: c.count(level) }))
    .filter((c) => c.count > 0);
  return computed.length > 0 ? computed : undefined;
}

// Derives trackable resources (pools with totals/die/recharge) and static
// feature descriptions for a character's class and subclass. Returns null
// when the class is unknown and no data exists. Pure — safe to call in serializeCharacter.
export function deriveResources(
  className: string,
  subclass: string | undefined,
  level: number,
  abilityScores: Record<string, number>,
  profBonus: number,
  // The seeded ClassFeature rows this character's class/subclass loaded.
  // Absent for every caller reaching this function through a narrow select
  // that can't carry the relation.
  featureRows: ClassFeatureRowsCarrier | undefined,
  edition: RulesEdition,
): DerivedClassInfo | null {
  const classKey = (className ?? "").toLowerCase();
  const subclassKey = (subclass ?? "").toLowerCase();

  const sub = deriveSubclassLayer(subclassKey, level, abilityScores, profBonus, featureRows, edition);
  // Feed the active subclass into the base pool derivation so base-wins pool-key
  // collisions (e.g. druid wildShape) resolve to the subclass's variant (#906).
  const base = deriveBaseLayer(
    CLASSES[classKey],
    level,
    abilityScores,
    profBonus,
    sub.active ? subclassKey : undefined,
    featureRows,
    edition,
  );
  const { resources, features, improvements } = mergeLayers(base, sub);

  // hasExtras must be computed BEFORE the null check below: with an absent
  // featureRows carrier, `features` can be empty even for a known class, so
  // resources+features alone would wrongly conclude there's nothing to return.
  // Base-class rows feed deriveRowExtras unconditionally; subclass rows stay gated on sub.active.
  const rowExtras = combineRowExtras(
    deriveRowExtras(featureRows?.classRows ?? [], level, edition, abilityScores, profBonus),
    sub.active ? deriveRowExtras(featureRows?.subclassRows ?? [], level, edition, abilityScores, profBonus) : undefined,
  );
  const extras = combineExtras(
    deriveSubclassClassExtras(sub, level, abilityScores, profBonus, edition),
    rowExtras,
  );
  const subclassChoices = deriveSubclassChoiceList(sub, level);
  const hasExtras = extras !== undefined || subclassChoices !== undefined;

  // Return null only for truly unknown/empty classes
  if (resources.length === 0 && features.length === 0 && !hasExtras) return null;

  const result: DerivedClassInfo = { resources, features };
  if (extras) Object.assign(result, extras);
  if (subclassChoices) result.subclassChoices = subclassChoices;
  // Same row set as `features` above (improvementsFromRows/featuresFromRows
  // share one filter), so improvements is never non-empty while features is
  // empty — no separate null-check branch needed.
  if (improvements.length > 0) result.improvements = improvements;

  return result;
}

// Row-shaped wrapper over deriveResources: derives level/proficiency bonus
// from a character row's XP + primary class entry.
export function deriveResourcesForCharacterRow(row: {
  experiencePoints: number;
  abilityScores: unknown;
  classEntries: { name: string; subclass: string | null }[];
  rulesEdition: RulesEdition;
}): { derived: DerivedClassInfo | null; level: number } {
  const level = levelForExperience(row.experiencePoints);
  const profBonus = proficiencyBonusForLevel(level);
  const primaryEntry = row.classEntries[0];
  const abilityScores = row.abilityScores as Record<string, number>;
  // No relation loaded here — a caller added would silently gate 2014
  // Cleric/Warlock/Wizard subclasses at the plain ?? 3 fallback instead of
  // their real PHB'14 gate; use featureRowsOf (feature-rows-select.ts) instead.
  const derived = deriveResources(
    primaryEntry?.name ?? "",
    primaryEntry?.subclass ?? undefined,
    level,
    abilityScores,
    profBonus,
    undefined,
    editionOf(row),
  );
  return { derived, level };
}

// Row-shaped wrapper over deriveEntryScopedResources: derives level +
// proficiency bonus from XP, then returns the entry-scoped derivation (every
// class entry's own caps/pools merged) — selects need classEntries with
// {name, subclass, level} for EVERY entry, not just the primary, so a
// secondary Monk's or Battle Master's own level drives its gate/DC/cap.
// getFeatureRows is optional — a caller whose select carries
// FEATURE_ROWS_ENTRY_SELECT passes featureRowsOf (feature-rows-select.ts).
export function deriveEntryScopedResourcesForCharacterRow<E extends EntryScopedClassEntry>(
  row: {
    experiencePoints: number;
    abilityScores: unknown;
    classEntries: E[];
    rulesEdition: RulesEdition;
  },
  getFeatureRows?: GetFeatureRows<E>,
): { derived: DerivedClassInfo | null; level: number } {
  const level = levelForExperience(row.experiencePoints);
  const profBonus = proficiencyBonusForLevel(level);
  const abilityScores = row.abilityScores as Record<string, number>;
  const { derived } = deriveEntryScopedResources(row.classEntries, level, abilityScores, profBonus, editionOf(row), getFeatureRows);
  return { derived, level };
}

// Every ClassExtras field, overlaid per class entry by deriveEntryScopedResources.
// subclassChoices lives on DerivedClassInfo, not ClassExtras, since it
// concats across entries instead of overlaying (below). Kept as a typed list
// so the overlay loop and the exhaustiveness check below share one enumeration.
const EXTRAS_FIELDS = [
  "maneuverChoiceCount",
  "announcedSaveDC",
  "toolProfChoiceCount",
  "expertiseChoiceCount",
] as const satisfies readonly (keyof ClassExtras)[];

// Compile-time latch: a ClassExtras field missing from EXTRAS_FIELDS makes this
// assignment a type error (keyof ClassExtras no longer extends the array's
// element union), so adding a field to one without the other fails typecheck.
type _ExtrasFieldsCoverClassExtras = keyof ClassExtras extends (typeof EXTRAS_FIELDS)[number] ? true : never;
const _extrasFieldsCoverClassExtras: _ExtrasFieldsCoverClassExtras = true;
void _extrasFieldsCoverClassExtras;

// Whether an entry's own-level derivation has any extras field to overlay
// (a plain class/subclass with only pools/features contributes nothing here).
function entryContributesExtras(info: DerivedClassInfo): boolean {
  return EXTRAS_FIELDS.some((field) => info[field] !== undefined) || info.subclassChoices !== undefined;
}

// Assigns through a generic key so TS correlates each EXTRAS_FIELDS key with its own value type.
function assignDefined<T, K extends keyof T>(target: T, key: K, value: T[K] | undefined): void {
  if (value !== undefined) target[key] = value;
}

// Unlike the other EXTRAS_FIELDS, announcedSaveDC can have more than one
// contributing class entry — a real misconfiguration, but this runs on the
// read path (serializeCharacter), so throwing here would 500 the whole
// character load. Keep the first (primary) entry's DC, drop the collision,
// and log a warning instead.
function assignAnnouncedSaveDC(target: DerivedClassInfo, value: number | undefined): void {
  if (value === undefined) return;
  if (target.announcedSaveDC !== undefined) {
    logger.warn(
      { existing: target.announcedSaveDC, dropped: value },
      "deriveEntryScopedResources: multiple class entries declared an announced save DC — keeping the first (primary-class) DC and dropping the collision; announcedSaveDC needs per-feature scoping on the wire, not one shared ClassExtras field (#1589/#1875)",
    );
    return;
  }
  target.announcedSaveDC = value;
}

// Unlike the other EXTRAS_FIELDS, expertiseChoiceCount SUMS across entries:
// four classes grant Expertise (Rogue/Bard/Ranger/Wizard), and a multiclass
// character's picks add RAW rather than the last entry winning.
function addExpertiseChoiceCount(target: DerivedClassInfo, value: number | undefined): void {
  if (value === undefined) return;
  target.expertiseChoiceCount = (target.expertiseChoiceCount ?? 0) + value;
}

// Defined-wins overlay of one entry's extras onto the accumulator, except
// announcedSaveDC (degrades a collision) and expertiseChoiceCount (sums).
// Creates an empty resources/features shell on first contribution if `acc` is still null.
function overlayExtrasFields(acc: DerivedClassInfo | null, info: DerivedClassInfo): DerivedClassInfo {
  const target = acc ?? { resources: [], features: [] };
  for (const field of EXTRAS_FIELDS) {
    if (field === "announcedSaveDC") {
      assignAnnouncedSaveDC(target, info.announcedSaveDC);
      continue;
    }
    if (field === "expertiseChoiceCount") {
      addExpertiseChoiceCount(target, info.expertiseChoiceCount);
      continue;
    }
    assignDefined(target, field, info[field]);
  }
  if (info.subclassChoices) {
    // Concat can't collide: choice keys are subclass-specific and each class appears at most once per character.
    target.subclassChoices = [...(target.subclassChoices ?? []), ...info.subclassChoices];
  }
  return target;
}

// The minimal shape every classEntries caller has. deriveEntryScopedResources
// and its collectors below are generic over it rather than declaring an
// optional class?/subclassRef? feature-carrier field directly: some narrow
// selects declare their own unrelated same-named `class` field, which
// TypeScript's weak-type check would reject against a type declaring
// `class?: {...}` even though both are optional.
interface EntryScopedClassEntry {
  name: string;
  subclass?: string | null;
  level: number;
}

// Extracts one entry's feature-carrier rows, supplied by the one caller that
// has them loaded (buildResourcesView); every narrow-select caller omits it,
// so undefined flows through to deriveResources unedited.
type GetFeatureRows<E> = (entry: E) => ClassFeatureRowsCarrier | undefined;

// One class entry's own DerivedClassInfo at its OWN effective level — the
// single derivation point every collector below shares.
function deriveEntryInfo<E extends EntryScopedClassEntry>(
  entry: E,
  entryCount: number,
  totalLevel: number,
  abilityScores: Record<string, number>,
  profBonus: number,
  getFeatureRows: GetFeatureRows<E> | undefined,
  edition: RulesEdition,
): DerivedClassInfo | null {
  const effLevel = effectiveEntryLevel(entry.level, entryCount, totalLevel);
  return deriveResources(entry.name, entry.subclass ?? undefined, effLevel, abilityScores, profBonus, getFeatureRows?.(entry), edition);
}

// PHB'14 p.164: gaining a shared feature again from a second class grants
// that class's effects but no additional use, so a shared pool's total is the
// greatest any contributing entry grants, never the sum.
type PoolMergeStrategy = "max";

// A pool key is class-scoped unless sanctioned here — an unsanctioned
// duplicate is a hard error (collectEntryScopedPools below). channelDivinity
// is Cleric 2+ and Paladin 3+ sharing one pool.
export const SHARED_POOL_MERGE: Record<string, PoolMergeStrategy> = {
  channelDivinity: "max",
};

// Non-total fields stay the earlier (primary-wins) entry's; only `total` is a
// 5e-mandated exception, mirroring mergeLayers' base-wins policy.
function mergeSharedPool(existing: DerivedResource, incoming: DerivedResource, strategy: PoolMergeStrategy): DerivedResource {
  switch (strategy) {
    case "max":
      return { ...existing, total: Math.max(existing.total, incoming.total) };
  }
}

// Rebuilds the resources pool layer from EVERY class entry at its own
// effective level (PHB'24 p.163: each class's pool scales to its own level,
// not the primary's or the summed total). Also read by applySpendResourceOp's
// write-side cap and rest.ts's recharge, so merging here — and only here —
// keeps the read and write sides structurally unable to diverge.
function collectEntryScopedPools<E extends EntryScopedClassEntry>(
  classEntries: E[],
  totalLevel: number,
  abilityScores: Record<string, number>,
  profBonus: number,
  getFeatureRows: GetFeatureRows<E> | undefined,
  edition: RulesEdition,
): DerivedResource[] {
  const indexByKey = new Map<string, number>();
  const pools: DerivedResource[] = [];
  for (const entry of classEntries) {
    const info = deriveEntryInfo(entry, classEntries.length, totalLevel, abilityScores, profBonus, getFeatureRows, edition);
    for (const pool of info?.resources ?? []) {
      addOrMergeEntryPool(pools, indexByKey, pool, entry.name);
    }
  }
  return pools;
}

// One pool's contribution to the accumulator: merges into an already-seen
// sanctioned key (SHARED_POOL_MERGE) in place, or throws on an unsanctioned
// collision, or appends as a new pool. Extracted so collectEntryScopedPools
// keeps its existing branching budget.
function addOrMergeEntryPool(
  pools: DerivedResource[],
  indexByKey: Map<string, number>,
  pool: DerivedResource,
  entryName: string,
): void {
  const at = indexByKey.get(pool.key);
  if (at === undefined) {
    indexByKey.set(pool.key, pools.length);
    pools.push(pool);
    return;
  }
  const strategy = SHARED_POOL_MERGE[pool.key];
  if (!strategy) {
    throw new Error(`collectEntryScopedPools: duplicate pool key "${pool.key}" from entry "${entryName}"`);
  }
  pools[at] = mergeSharedPool(pools[at], pool, strategy);
}

// Entry-scoped features: each entry's list at its own effective level,
// concatenated then deduped by name with the PRIMARY entry winning ties, then
// sorted by level (ties by name) — mirrors mergeLayers' base-wins policy.
// Features carry no source-class tag, so a same-named feature from a
// different class collapses into one entry rather than being attributed to both.
function collectEntryScopedFeatures<E extends EntryScopedClassEntry>(
  classEntries: E[],
  totalLevel: number,
  abilityScores: Record<string, number>,
  profBonus: number,
  getFeatureRows: GetFeatureRows<E> | undefined,
  edition: RulesEdition,
): DerivedFeature[] {
  const seenNames = new Set<string>();
  const features: DerivedFeature[] = [];
  for (const entry of classEntries) {
    const info = deriveEntryInfo(entry, classEntries.length, totalLevel, abilityScores, profBonus, getFeatureRows, edition);
    for (const feature of info?.features ?? []) {
      if (seenNames.has(feature.name)) continue;
      seenNames.add(feature.name);
      features.push(feature);
    }
  }
  return features.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
}

// Mirrors collectEntryScopedFeatures's per-entry loop; no name-based dedup —
// a repeated proficiency grant collapses at deriveImprovementProficiencies'
// Set instead (lib/srd/feats.ts).
function collectEntryScopedImprovements<E extends EntryScopedClassEntry>(
  classEntries: E[],
  totalLevel: number,
  abilityScores: Record<string, number>,
  profBonus: number,
  getFeatureRows: GetFeatureRows<E> | undefined,
  edition: RulesEdition,
): FeatImprovement[] {
  const improvements: FeatImprovement[] = [];
  for (const entry of classEntries) {
    const info = deriveEntryInfo(entry, classEntries.length, totalLevel, abilityScores, profBonus, getFeatureRows, edition);
    improvements.push(...(info?.improvements ?? []));
  }
  return improvements;
}

// Entry-scoped resource caps + pools + features for multiclass level-up: the
// EXTRAS_FIELDS, the resources pool layer, and the features list are all
// re-derived per class entry at that entry's OWN effective level and merged
// (PHB'24 p.163: each class's pool scales to its own level). Level-gated
// action-availability gates are entry-scoped the same way but through
// deriveEntryScopedActions (actions.ts) instead. Collapses to a bare
// deriveResources() call for single-class characters.
export function deriveEntryScopedResources<E extends EntryScopedClassEntry>(
  classEntries: E[],
  totalLevel: number,
  abilityScores: Record<string, number>,
  profBonus: number,
  edition: RulesEdition,
  // Optional — only buildResourcesView (the one caller with real relations loaded) passes one.
  getFeatureRows?: GetFeatureRows<E>,
): { derived: DerivedClassInfo | null } {
  let derived: DerivedClassInfo | null = null;

  for (const entry of classEntries) {
    const info = deriveEntryInfo(entry, classEntries.length, totalLevel, abilityScores, profBonus, getFeatureRows, edition);
    if (!info || !entryContributesExtras(info)) continue;

    derived = overlayExtrasFields(derived, info);
  }

  const pools = collectEntryScopedPools(classEntries, totalLevel, abilityScores, profBonus, getFeatureRows, edition);
  const features = collectEntryScopedFeatures(classEntries, totalLevel, abilityScores, profBonus, getFeatureRows, edition);
  const improvements = collectEntryScopedImprovements(classEntries, totalLevel, abilityScores, profBonus, getFeatureRows, edition);

  if (derived) {
    derived.resources = pools;
    derived.features = features;
    if (improvements.length > 0) derived.improvements = improvements;
  } else if (pools.length > 0 || features.length > 0 || improvements.length > 0) {
    derived = { resources: pools, features, ...(improvements.length > 0 ? { improvements } : {}) };
  }

  return { derived };
}
