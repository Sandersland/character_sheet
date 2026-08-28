import type { RulesEdition } from "@character-sheet/shared-types";

import { levelForExperience, proficiencyBonusForLevel } from "@/lib/leveling/experience.js";
import { effectiveEntryLevel, subclassActiveAt } from "@/lib/leveling/effective-levels.js";
import { logger } from "@/lib/core/logger.js";
import { editionOf } from "@/lib/rules/edition.js";
import { deriveAnnouncedSaveDC } from "@/lib/srd/srd.js";

import { derivedStatFromRows, featuresFromRows, improvementsFromRows, poolsFromRows, type ClassFeatureRow, type ClassFeatureRowsCarrier } from "./class-feature-rows.js";
import { monk } from "./monk.js";
import { ranger } from "./ranger.js";
import type { FeatImprovement } from "./resources-state.js";
import { SUBCLASS_IDENTITY, type SubclassIdentity, type SubclassSlug } from "./subclass-slug.js";
import type { ClassDefinition, ClassExtras, DerivedClassInfo, DerivedFeature, DerivedResource, DerivedSubclassChoice, SubclassDefinition } from "./types.js";

// Classes absent here (Fighter, Barbarian, Rogue, Cleric, Warlock, Wizard,
// Sorcerer, Bard, Paladin, Druid) resolve entirely through SUBCLASS_IDENTITY
// and seeded ClassFeature rows; deriveBaseLayer tolerates the missing key.
const CLASSES: Record<string, ClassDefinition> = {
  monk,
  ranger,
};

// Subclass keys are global, not scoped per class. Identity-only stubs seed
// first so a subclass with no TS module still resolves its seeded rows; a
// class definition still on the TS migration path then overlays its own stubs.
const SUBCLASSES: Record<string, SubclassDefinition> = {};
for (const [slug, { nameKey }] of Object.entries(SUBCLASS_IDENTITY) as [SubclassSlug, SubclassIdentity][]) {
  SUBCLASSES[nameKey] = { slug };
}
for (const classDef of Object.values(CLASSES)) {
  for (const [subclassKey, subclassDef] of Object.entries(classDef.subclasses ?? {})) {
    SUBCLASSES[subclassKey] = subclassDef;
  }
}

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

// A resourceFn pool wins over a row-declared pool of the same key, so a class
// mid-migration (resourceFn for some pools, rows for others) can never
// double-declare a key.
function mergePoolSources(fromFn: DerivedResource[], fromRows: DerivedResource[]): DerivedResource[] {
  if (fromRows.length === 0) return fromFn;
  const seenKeys = new Set(fromFn.map((p) => p.key));
  return [...fromFn, ...fromRows.filter((p) => !seenKeys.has(p.key))];
}

// `subclassKey` is already gated on the subclass being ACTIVE (see the call
// site below) — undefined otherwise, which is also the "no override" input
// poolsFromRows expects.
function activeSubclassRows(subclassKey: string | undefined, featureRows: ClassFeatureRowsCarrier | undefined): readonly ClassFeatureRow[] | undefined {
  return subclassKey ? featureRows?.subclassRows : undefined;
}

// Row-driven pools are data-gated: poolsFromRows reads whatever resourceKey
// the rows populate — never a per-class-name check. The active subclass's
// rows (activeSubclassRows) are passed through as poolsFromRows' overrideRows:
// a base row's resourceKey that the active subclass also declares resolves
// from the subclass's own row instead (druid wildShape's Circle of the Moon
// variant, #906/#1226).
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
  const rowPools = poolsFromRows(featureRows?.classRows ?? [], level, abilityScores, profBonus, edition, activeSubclassRows(subclassKey, featureRows));
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

// EDITION_2024 always gates at 3; EDITION_2014 prefers the seeded
// CharacterClass.subclassLevel when the caller carries it. Without it, a
// moduleless class (Cleric/Warlock/Wizard/Sorcerer) silently gates at the
// plain ?? 3 default instead of its real PHB'14 gate.
function isSubclassActive(
  def: SubclassDefinition | undefined,
  level: number,
  edition: RulesEdition,
  seededSubclassLevel: number | undefined,
): def is SubclassDefinition {
  if (!def) return false;
  return subclassActiveAt(level, seededSubclassLevel ?? def.grantLevel, edition);
}

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
  // undefined, not subclassKey: a subclass's own resourceFn is already scoped
  // to itself; the param exists so the BASE layer can resolve a pool-key
  // collision against the active subclass.
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

// Base wins on pool-key collision; improvements concatenate (repeated grants
// dedup at deriveImprovementProficiencies).
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

// announcedSaveDC resolves via deriveAnnouncedSaveDC keyed off saveDcAbilities,
// not a derivedStat name — a row's one derivedStat slot may already be claimed
// (e.g. Combat Superiority's maneuverChoiceCount). Ungated on subclass-active:
// the caller gates subclass rows on sub.active itself.
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

// Defined-wins with the fn side last, so a row never silently overwrites a
// still-live ExtrasFn value on a class mid-migration. Returns undefined (not
// {}) when neither side contributes.
function combineExtras(fromFn: ClassExtras | undefined, fromRows: ClassExtras | undefined): ClassExtras | undefined {
  if (!fromFn && !fromRows) return undefined;
  const merged = { ...fromRows, ...fromFn };
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function deriveSubclassChoiceList(sub: SubclassLayer, level: number): DerivedSubclassChoice[] | undefined {
  if (!sub.active || !sub.def?.choices) return undefined;
  const computed = sub.def.choices
    .map((c) => ({ key: c.key, label: c.label, catalogSource: c.catalogSource, count: c.count(level) }))
    .filter((c) => c.count > 0);
  return computed.length > 0 ? computed : undefined;
}

// Trackable resources + feature descriptions for a class/subclass; null for an
// unknown class with no data. Pure — safe to call in serializeCharacter.
export function deriveResources(
  className: string,
  subclass: string | undefined,
  level: number,
  abilityScores: Record<string, number>,
  profBonus: number,
  featureRows: ClassFeatureRowsCarrier | undefined,
  edition: RulesEdition,
): DerivedClassInfo | null {
  const classKey = (className ?? "").toLowerCase();
  const subclassKey = (subclass ?? "").toLowerCase();

  const sub = deriveSubclassLayer(subclassKey, level, abilityScores, profBonus, featureRows, edition);
  // Feed the active subclass into the base derivation so base-wins pool-key
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
  // featureRows carrier, `features` can be empty even for a known class.
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

  if (resources.length === 0 && features.length === 0 && !hasExtras) return null;

  const result: DerivedClassInfo = { resources, features };
  if (extras) Object.assign(result, extras);
  if (subclassChoices) result.subclassChoices = subclassChoices;
  if (improvements.length > 0) result.improvements = improvements;

  return result;
}

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
  // No featureRows here, so a 2014 Cleric/Warlock/Wizard subclass gates at the
  // plain ?? 3 fallback instead of its PHB'14 gate — a caller that needs the
  // real gate passes featureRowsOf.
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

// Selects must carry classEntries {name, subclass, level} for EVERY entry, not
// just the primary, so a secondary class's own level drives its gate/DC/cap.
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

// Overlaid per class entry by deriveEntryScopedResources. subclassChoices
// concats across entries instead of overlaying, so it lives on
// DerivedClassInfo rather than ClassExtras.
const EXTRAS_FIELDS = [
  "maneuverChoiceCount",
  "announcedSaveDC",
  "toolProfChoiceCount",
  "expertiseChoiceCount",
] as const satisfies readonly (keyof ClassExtras)[];

// Compile-time latch: a ClassExtras field missing from EXTRAS_FIELDS turns
// this assignment into a type error.
type _ExtrasFieldsCoverClassExtras = keyof ClassExtras extends (typeof EXTRAS_FIELDS)[number] ? true : never;
const _extrasFieldsCoverClassExtras: _ExtrasFieldsCoverClassExtras = true;
void _extrasFieldsCoverClassExtras;

function entryContributesExtras(info: DerivedClassInfo): boolean {
  return EXTRAS_FIELDS.some((field) => info[field] !== undefined) || info.subclassChoices !== undefined;
}

// Generic key so TS correlates each EXTRAS_FIELDS key with its own value type.
function assignDefined<T, K extends keyof T>(target: T, key: K, value: T[K] | undefined): void {
  if (value !== undefined) target[key] = value;
}

// Two entries contributing announcedSaveDC is a real misconfiguration, but
// this runs on the read path where throwing would 500 the character load —
// keep the primary entry's DC and log the collision.
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

// expertiseChoiceCount SUMS across entries: a multiclass character's Expertise
// picks from Rogue/Bard/Ranger/Wizard add RAW rather than the last entry winning.
function addExpertiseChoiceCount(target: DerivedClassInfo, value: number | undefined): void {
  if (value === undefined) return;
  target.expertiseChoiceCount = (target.expertiseChoiceCount ?? 0) + value;
}

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

// Generic over this shape rather than declaring an optional feature-carrier
// field: some narrow selects declare their own unrelated same-named `class`
// field, which TypeScript's weak-type check would reject against `class?: {...}`.
interface EntryScopedClassEntry {
  name: string;
  subclass?: string | null;
  level: number;
}

type GetFeatureRows<E> = (entry: E) => ClassFeatureRowsCarrier | undefined;

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

// PHB'14 p.164: gaining a shared feature again from a second class grants that
// class's effects but no additional use, so a shared pool's total is the
// greatest any contributing entry grants, never the sum.
type PoolMergeStrategy = "max";

// A pool key is class-scoped unless sanctioned here — an unsanctioned
// duplicate throws in addOrMergeEntryPool. channelDivinity is Cleric 2+ and
// Paladin 3+ sharing one pool.
export const SHARED_POOL_MERGE: Record<string, PoolMergeStrategy> = {
  channelDivinity: "max",
};

// Only `total` merges; other fields keep the earlier (primary-wins) entry's values.
function mergeSharedPool(existing: DerivedResource, incoming: DerivedResource, strategy: PoolMergeStrategy): DerivedResource {
  switch (strategy) {
    case "max":
      return { ...existing, total: Math.max(existing.total, incoming.total) };
  }
}

// PHB'24 p.163: each class's pool scales to its own effective level, not the
// primary's or the summed total. Also read by applySpendResourceOp's
// write-side cap and the rest-recharge logic, so merging here — and only here —
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

// Deduped by name with the PRIMARY entry winning ties. Features carry no
// source-class tag, so a same-named feature from two classes collapses into one.
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

// No name dedup — a repeated proficiency grant collapses at deriveImprovementProficiencies' Set.
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

// Re-derives extras, pools, and features per class entry at that entry's OWN
// effective level and merges (PHB'24 p.163). Collapses to a bare
// deriveResources() call for single-class characters.
export function deriveEntryScopedResources<E extends EntryScopedClassEntry>(
  classEntries: E[],
  totalLevel: number,
  abilityScores: Record<string, number>,
  profBonus: number,
  edition: RulesEdition,
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
