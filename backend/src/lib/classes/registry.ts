// Flattens the per-class definitions in classes/<class>.ts into the dispatch
// tables deriveResources() merges from, and exposes the class-features.ts
// public surface (resolveClassDie / deriveResources / deriveResourcesForCharacterRow).
import type { RulesEdition } from "@character-sheet/shared-types";

import { levelForExperience, proficiencyBonusForLevel } from "@/lib/leveling/experience.js";
import { effectiveEntryLevel, subclassActiveAt } from "@/lib/leveling/effective-levels.js";
import { editionOf } from "@/lib/rules/edition.js";
import { deriveAnnouncedSaveDC } from "@/lib/srd/srd.js";

import { bard } from "./bard.js";
import { derivedStatFromRows, featuresFromRows, poolsFromRows, type ClassFeatureRow, type ClassFeatureRowsCarrier } from "./class-feature-rows.js";
import { cleric } from "./cleric.js";
import { druid } from "./druid.js";
import { monk } from "./monk.js";
import { paladin } from "./paladin.js";
import { ranger } from "./ranger.js";
import { sorcerer } from "./sorcerer.js";
import { SUBCLASS_IDENTITY, type SubclassIdentity, type SubclassSlug } from "./subclass-slug.js";
import type { ClassDefinition, ClassExtras, DerivedClassInfo, DerivedFeature, DerivedResource, DerivedSubclassChoice, SubclassDefinition } from "./types.js";
import { warlock } from "./warlock.js";
import { wizard } from "./wizard.js";

// Fighter, Barbarian and Rogue are deliberately absent (#1532 / #1223 /
// #1231 — lib/classes/fighter.ts, lib/classes/barbarian.ts and
// lib/classes/rogue.ts are all deleted). Their subclasses (Fighter:
// Champion/Battle Master/Eldritch Knight; Barbarian: Totem Warrior/
// Berserker; Rogue: Arcane Trickster/Assassin/Thief) resolve entirely
// through the SUBCLASS_IDENTITY seeding pass below; deriveBaseLayer's
// optional-chaining on `classDef` already tolerates a missing key.
const CLASSES: Record<string, ClassDefinition> = {
  bard,
  cleric,
  druid,
  monk,
  paladin,
  ranger,
  sorcerer,
  warlock,
  wizard,
};

// Subclass keys are global (not scoped per class) — matching the original
// class-features.ts dispatch tables, where a subclass name is looked up
// independent of the character's base class.
//
// Seeded identity-only FIRST, from SUBCLASS_IDENTITY (subclass-slug.ts,
// #1277's sanctioned join table) — #1546 Part A. An identity-only entry is
// just `{ slug }`, no `grantLevel`, so isSubclassActive resolves it through
// subclassActiveAt/subclassGateLevel's undefined-grantLevel fallback, which is
// already 3 in BOTH editions (effective-levels.ts) — CORRECTLY the value for
// most classes not yet migrated off `lib/classes/<class>.ts` (Bard/Monk/
// Paladin/Ranger/Rogue, each `grantLevel: 3` in their own module), but NOT
// for all: Cleric/Sorcerer/Warlock supply `grantLevel: 1` and Druid/Wizard
// supply `grantLevel: 2` explicitly (PHB'14) — a false "same value" claim
// here would have shipped in #1234; those five classes' own TS overlay (the
// second pass below) is what corrects the fallback for them, not this
// identity-only seed. This is what lets deriveSubclassLayer resolve a subclass's
// seeded ClassFeature rows (poolsFromRows/featuresFromRows) even when no
// ClassDefinition registers it in TS at all (Fighter's three since fighter.ts
// was deleted, #1532; Barbarian's two since barbarian.ts was, #1223) —
// before this, a missing TS entry meant `deriveSubclassLayer` returned early
// with EMPTY pools and features, silently deleting every seeded row for that
// subclass (see #1532's probe).
//
// THEN overlaid by the CLASSES-derived definitions, in a second pass — order
// matters: a class still on the TS migration path (a non-3 grantLevel,
// resourceFn, deriveExtras, or the `choices` catalog) must win over its own
// identity-only stub, or those fields would silently vanish for the nine
// classes not yet fully row-driven. `SUBCLASS_IDENTITY` is 31 entries against
// 23 TS registrations now that Fighter's three (Champion/Battle
// Master/Eldritch Knight), Barbarian's two (Totem Warrior/Berserker) and
// Rogue's three (Arcane Trickster/Assassin/Thief) have none — so the overlay
// is behaviour-preserving by construction only for those 23: every key the
// first loop seeds for a still-TS-registered class is immediately replaced by
// the second loop's richer definition; Fighter's three, Barbarian's two and
// Rogue's three keep their identity-only seed as their final definition,
// which is correct — there is no richer TS definition left to overlay it
// with.
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
}

// A resourceFn pool wins over a row-declared pool of the same key (mirrors
// mergeLayers' base-wins policy) — no production collision exists today
// (Fighter's rows declare a resourceKey since #1528, Barbarian's since #1223,
// and Warlock's/Ranger's since #1233/#1230; Fighter's and Barbarian's modules
// are deleted outright, so neither has a resourceFn left to collide with.
// Warlock's Fiend subclass and Ranger's own base class are the two LIVE
// mergePoolSources cases: Warlock's 2024 Dark One's Own Luck pool and
// Ranger's 2024 Tireless/Nature's Veil pools are each a formula
// (Charisma/Wisdom modifier) resourceTotals can't express — but every one of
// those rows deliberately OMITS resourceTotals, so poolFromRow
// (class-feature-rows.ts) never even produces a same-keyed row pool to
// collide with; the resourceFn is each pool's ONLY source under 2024), but
// this keeps a class mid-migration (resourceFn for some pools, rows for
// others) from silently doubling a pool up if a row and a resourceFn ever
// named the same key during the transition.
function mergePoolSources(fromFn: DerivedResource[], fromRows: DerivedResource[]): DerivedResource[] {
  if (fromRows.length === 0) return fromFn;
  const seenKeys = new Set(fromFn.map((p) => p.key));
  return [...fromFn, ...fromRows.filter((p) => !seenKeys.has(p.key))];
}

// Row-driven pools are DATA-gated, not class-gated: `poolsFromRows` reads
// whatever `resourceKey` a class's rows actually populate, which today is
// Fighter (#1528), Barbarian's Rage (#1223), Wizard's Arcane Recovery/Illusory
// Self (#1234), Warlock's Magical Cunning/Dark One's Own Luck (2014
// only)/Hurl Through Hell/Fey Presence/Misty Escape/Dark Delirium/Entropic
// Ward (#1233), Ranger's Favored Enemy/Tireless (2024 only)/Nature's Veil
// (2024 only) (#1230), and Sorcerer's Innate Sorcery/Sorcerous Restoration/
// Dragon Wings/Tamed Surge (2024 only)/Tides of Chaos (both editions)
// (#1232) — every other class's rows carry no resourceKey, so this is a no-op
// for them until their own wave-2 retab (#1134) populates theirs. Rogue is the
// exception that stays a no-op even AFTER its retab (#1231): Sneak Attack's
// Nd6 is a computed rule function off the class entry's own level, never a
// persisted pool. No `=== "fighter"` / `=== "barbarian"` / `=== "rogue"` /
// `=== "warlock"` / `=== "wizard"` / `=== "ranger"` / `=== "sorcerer"` check
// anywhere (CLAUDE.md).
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
  const rowPools = poolsFromRows(featureRows?.classRows ?? [], level, edition);
  return {
    pools: mergePoolSources(fnPools, rowPools),
    features: featuresFromRows(featureRows?.classRows ?? [], level, "class", edition),
  };
}

interface SubclassLayer extends ClassLayer {
  active: boolean;
  def: SubclassDefinition | undefined;
}

// A subclass contributes only once the character has reached its grant level.
// Resolved through the SAME gate buildClassesView uses (subclassActiveAt):
// grantLevel is the 2014 (PHB'14) value — Cleric/Sorcerer/Warlock 1,
// Druid/Wizard 2, everything else 3/absent — and EDITION_2024 always hardcodes
// 3, ignoring it (#1308's seeded catalog column is this table's DB-side twin;
// subclassGateLevel is the one function both resolve through). Was
// edition-blind (#1285's latch, closed by #1291): a 2014 Cleric at level 1
// used to show its subclass NAME (buildClassesView) with none of its derived
// FEATURES (deriveResources) because this function ignored edition entirely.
function isSubclassActive(
  def: SubclassDefinition | undefined,
  level: number,
  edition: RulesEdition,
): def is SubclassDefinition {
  if (!def) return false;
  return subclassActiveAt(level, def.grantLevel, edition);
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
  if (!isSubclassActive(def, level, edition)) return { active: false, def, pools: [], features: [] };
  // subclassKey is `undefined` here, not this function's own `subclassKey`
  // param (#1499) — ResourceFn's subclassKey exists so the BASE layer can
  // resolve #906's wildShape pool-key collision against the active
  // subclass; a subclass's own resourceFn is already scoped to that
  // subclass, so passing it again would be a silent semantic change under
  // deriveResources' byte-identical-2024-output AC.
  const fnPools = def.resourceFn ? def.resourceFn(level, abilityScores, profBonus, undefined, edition) : [];
  const rowPools = poolsFromRows(featureRows?.subclassRows ?? [], level, edition);
  return {
    active: true,
    def,
    pools: mergePoolSources(fnPools, rowPools),
    features: featuresFromRows(featureRows?.subclassRows ?? [], level, "subclass", edition),
  };
}

// Base-wins on pool-key collision; features are sorted by level.
function mergeLayers(base: ClassLayer, sub: ClassLayer): { resources: DerivedResource[]; features: DerivedFeature[] } {
  const seenPoolKeys = new Set(base.pools.map((p) => p.key));
  const resources = [...base.pools, ...sub.pools.filter((p) => !seenPoolKeys.has(p.key))];
  const features = [...base.features, ...sub.features].sort(
    (a, b) => a.level - b.level || a.name.localeCompare(b.name),
  );
  return { resources, features };
}

// Subclass-specific bespoke choice-cap fields (ClassExtras — maneuverChoiceCount/
// SaveDC, toolProfChoiceCount). Split from deriveSubclassChoiceList below (and
// from deriveResources itself, #1524's null-flip fix) because the two draw
// from unrelated SubclassDefinition axes — deriveExtras vs. the choices catalog
// — so each stays a single-branch guard clause instead of one function
// carrying both (that shape is what tripped the fallow complexity gate).
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

// Row-driven counterpart to deriveSubclassClassExtras above (#1546) — the
// generic EXTRAS_FIELDS reader chunk B2 asks for. maneuverChoiceCount/
// toolProfChoiceCount resolve via derivedStatFromRows, the same tiered-value
// mechanism #1530 uses for attacksPerAction; maneuverSaveDC is a closed-form
// formula, not a tier, so it resolves separately through
// deriveAnnouncedSaveDC (lib/srd) keyed off `saveDcAbilities`'s own presence,
// never a `derivedStat` name match — Combat Superiority's single
// `derivedStat` column already names "maneuverChoiceCount" on the SAME row,
// so a second field can't also claim that slot for "maneuverSaveDC". Gated
// by `sub.active` to mirror deriveSubclassClassExtras' own gate (a below-gate
// subclass contributes nothing, even if its rows are loaded).
function deriveRowExtras(
  sub: SubclassLayer,
  rows: readonly ClassFeatureRow[],
  level: number,
  edition: RulesEdition,
  abilityScores: Record<string, number>,
  profBonus: number,
): ClassExtras | undefined {
  if (!sub.active) return undefined;
  const extras: ClassExtras = {};
  const maneuverChoiceCount = derivedStatFromRows(rows, level, edition, "maneuverChoiceCount");
  if (maneuverChoiceCount !== undefined) extras.maneuverChoiceCount = maneuverChoiceCount;
  const toolProfChoiceCount = derivedStatFromRows(rows, level, edition, "toolProfChoiceCount");
  if (toolProfChoiceCount !== undefined) extras.toolProfChoiceCount = toolProfChoiceCount;
  const maneuverSaveDC = deriveAnnouncedSaveDC(rows, level, edition, abilityScores, profBonus);
  if (maneuverSaveDC !== undefined) extras.maneuverSaveDC = maneuverSaveDC;
  return Object.keys(extras).length > 0 ? extras : undefined;
}

// Merges the code-authored (ExtrasFn) and row-authored extras for one
// subclass — defined-wins, fn side last so a class mid-migration (some
// extras still in TS, some already on rows) never has a row silently
// overwrite a still-live ExtrasFn value. No production subclass sets both
// sources for the same field today (Battle Master is rows-only after this
// issue; the other eleven classes' subclasses are ExtrasFn-only), so the
// merge order is defense-in-depth, not a live collision.
// Returns undefined rather than {} when neither side contributes a field, so
// "has extras" is the single predicate `extras !== undefined` at both the
// null-check and the Object.assign below — an empty object is falsy to
// Object.keys().length but truthy to `if`, and having the two disagree is how
// a reader concludes the assign is guarded when it isn't.
function combineExtras(fromFn: ClassExtras | undefined, fromRows: ClassExtras | undefined): ClassExtras | undefined {
  if (!fromFn && !fromRows) return undefined;
  const merged = { ...fromRows, ...fromFn };
  return Object.keys(merged).length > 0 ? merged : undefined;
}

// The generic subclass "choose N" list (#899): each catalog entry's level-gated
// count, dropping any not yet available. Its own unit because #899's catalog
// (`choices`) is independent of a subclass's bespoke deriveExtras above — a
// subclass can have either, neither, or both.
function deriveSubclassChoiceList(sub: SubclassLayer, level: number): DerivedSubclassChoice[] | undefined {
  if (!sub.active || !sub.def?.choices) return undefined;
  const computed = sub.def.choices
    .map((c) => ({ key: c.key, label: c.label, catalogSource: c.catalogSource, count: c.count(level) }))
    .filter((c) => c.count > 0);
  return computed.length > 0 ? computed : undefined;
}

/**
 * Derives trackable resources (pools with totals/die/recharge) and static
 * feature descriptions for a character's class and subclass. Returns null
 * when the class is unknown and no data exists — callers should render nothing.
 *
 * Pure function — no DB access, safe to call in serializeCharacter.
 */
export function deriveResources(
  className: string,
  subclass: string | undefined,
  level: number,
  abilityScores: Record<string, number>,
  profBonus: number,
  // The seeded ClassFeature rows this character's class/subclass loaded
  // (characterInclude, #1522/#1523/#1524) — optional and positioned
  // immediately before `edition` (edition stays last, the subclassGateLevel/
  // #1499 convention). Absent for every caller reaching this function through
  // a narrow select that can't carry a relation (deriveEntryScopedResources'
  // five such callers); only deriveEntryInfo (below) ever builds a real one.
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
  const { resources, features } = mergeLayers(base, sub);

  // #1524: with an absent featureRows carrier (every narrow-select caller —
  // e.g. RESOURCES_SELECT's applyResourceOpInTx, which learnSubclassChoice
  // itself runs through), `features` is now empty for classes whose TS array
  // used to guarantee `features.length > 0` unconditionally (a resourceFn-less
  // class/subclass, e.g. Ranger/Hunter). Deciding null-ness on resources+
  // features alone — as pre-#1524 code safely could, since features was never
  // actually empty for a known class — would silently drop a subclass's
  // deriveExtras/choices contribution for exactly those classes, so `hasExtras`
  // must be computed BEFORE the null check below, never folded into it.
  const extras = combineExtras(
    deriveSubclassClassExtras(sub, level, abilityScores, profBonus, edition),
    deriveRowExtras(sub, featureRows?.subclassRows ?? [], level, edition, abilityScores, profBonus),
  );
  const subclassChoices = deriveSubclassChoiceList(sub, level);
  const hasExtras = extras !== undefined || subclassChoices !== undefined;

  // Return null only for truly unknown/empty classes
  if (resources.length === 0 && features.length === 0 && !hasExtras) return null;

  const result: DerivedClassInfo = { resources, features };
  if (extras) Object.assign(result, extras);
  if (subclassChoices) result.subclassChoices = subclassChoices;

  return result;
}

/**
 * Row-shaped convenience wrapper over {@link deriveResources}: derives level and
 * proficiency bonus from a character row's XP + primary class entry, then returns
 * that class's non-slot resource derivation plus the computed `level` — consumers
 * that also need level-scaled cost math (e.g. a future focus-cast subclass migration)
 * can destructure `level` directly. Shared by the die-fueled activated-ability
 * handlers (maneuvers, shadow arts), which each re-read the same
 * {name, subclass} + XP + abilityScores select shape per op.
 */
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
  // No relation on this row's narrow select — no production caller of this
  // wrapper exists today (barrel export + tests only, #1524); featureRows
  // stays absent rather than widening a shape nothing loads.
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

/**
 * Row-shaped wrapper over {@link deriveEntryScopedResources}: derives level +
 * proficiency bonus from XP, then returns the entry-scoped derivation (every
 * class entry's own caps/pools merged). Selects need `classEntries: {name,
 * subclass, level}[]` for EVERY entry (not just the primary) — used by the
 * focus-cast/maneuver action seams so a secondary Monk's or Battle Master's own
 * level drives its gate/DC/per-cast cap (#1072).
 *
 * `getFeatureRows` is optional (#1528 chunk 0) — a caller whose select carries
 * `FEATURE_ROWS_ENTRY_SELECT` passes `featureRowsOf` (feature-rows-select.ts)
 * so a Fighter's row-driven pools (Second Wind/Action Surge/Indomitable)
 * resolve here too, not only through buildResourcesView's own real carrier.
 * Absent (as before #1528) for a caller with no such relation loaded.
 */
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
// A class appears at most once in classEntries, so listing every such field
// here needs no per-field cross-entry collision handling. `subclassChoices`
// lives on DerivedClassInfo but not ClassExtras: it concats across entries
// instead of overlaying (below). The pool `resources` and `features` layers
// are entry-scoped separately (#1071, #1206). Level-gated action-availability
// gates (Shadow Arts, Elemental Burst, …) no longer live here — they moved to
// DERIVED_ACTIONS rows (actions.ts, #1315). Kept as a typed list so the overlay
// loop and its "has anything to contribute" check share one enumeration; the
// exhaustiveness check below is what keeps this list and ClassExtras in sync (#1317).
const EXTRAS_FIELDS = [
  "maneuverChoiceCount",
  "maneuverSaveDC",
  "toolProfChoiceCount",
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

// Assigns through a generic key so TS correlates each EXTRAS_FIELDS entry's
// key with its own value type — a plain `target[field] = info[field]` inside
// the loop below doesn't typecheck against a non-generic union-typed key,
// which can't be correlated to a union-typed value (a future extras field
// could reintroduce a mixed-type union here, same as before #1315).
function assignDefined<T, K extends keyof T>(target: T, key: K, value: T[K] | undefined): void {
  if (value !== undefined) target[key] = value;
}

// Defined-wins overlay of one entry's extras fields onto the accumulator (a
// class appears at most once in classEntries, so no cross-entry collision).
// Creates an empty resources/features shell on first contribution if `derived`
// is still null (e.g. an empty-featured primary with a capped secondary).
function overlayExtrasFields(acc: DerivedClassInfo | null, info: DerivedClassInfo): DerivedClassInfo {
  const target = acc ?? { resources: [], features: [] };
  for (const field of EXTRAS_FIELDS) {
    assignDefined(target, field, info[field]);
  }
  if (info.subclassChoices) {
    // Concat can't collide: choice keys are subclass-specific and each class appears at most once per character.
    target.subclassChoices = [...(target.subclassChoices ?? []), ...info.subclassChoices];
  }
  return target;
}

// The minimal shape every classEntries caller has. `deriveEntryScopedResources`
// and its collectors below are GENERIC over it (`<E extends EntryScopedClassEntry>`)
// rather than structurally declaring an optional `class?`/`subclassRef?`
// feature-carrier shape on this type directly (#1524) — several narrow
// selects legitimately declare their OWN unrelated same-named field (e.g.
// combat/hp-context.ts's `ClassEntryRow.class = { hitDie: string } | null`),
// and TypeScript's weak-type check rejects assigning that to any type
// declaring `class?: { features?: ... }` even though both fields are
// optional, because the two `class` shapes share no properties at all. Generic
// + the getFeatureRows callback below sidesteps that: every caller's own
// concrete entry type only ever needs to satisfy THIS minimal constraint.
interface EntryScopedClassEntry {
  name: string;
  subclass?: string | null;
  level: number;
}

// Extracts one entry's feature-carrier rows, supplied by the caller that
// actually has them loaded — only buildResourcesView (serialize/classes.ts)
// passes one, built from the real characterInclude relations
// (entry.class?.features / entry.subclassRef?.features). Every narrow-select
// caller (MANEUVER_SELECT, FOCUS_CAST_CHARACTER_SELECT, SPELLCASTING_SELECT,
// rest.ts's HpOpContext, level-reconciliation.ts's three selects,
// channel-divinity.ts) omits this parameter entirely — none of them read
// `.features` (#1524's Fact 3) — so `undefined` flows through to
// deriveResources unedited at every one of those call sites.
type GetFeatureRows<E> = (entry: E) => ClassFeatureRowsCarrier | undefined;

// One class entry's own DerivedClassInfo at ITS OWN effective level (not the
// primary's or the summed total) — the single derivation the pools/features
// collectors and the extras-overlay loop below all key off, so the
// effectiveEntryLevel + deriveResources call lives in exactly one place.
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

// How a sanctioned shared pool key's contributions from multiple class entries
// combine into one pool. "max" is the only member today: PHB'14 p.164
// (multiclassing) — gaining a feature again from a second class grants that
// class's effects but no additional use, so the pool's `total` is the greatest
// any single contributing entry grants, never the sum. A future second shared
// key would add a union member here plus one switch arm in mergeSharedPool.
type PoolMergeStrategy = "max";

// A pool key is class-scoped (each class appears at most once in classEntries)
// UNLESS sanctioned here — an unsanctioned duplicate means two classes are
// silently fighting over one persisted `used` counter, which stays a hard
// error (collectEntryScopedPools below). channelDivinity is cleric 2+ and
// paladin 3+ sharing one pool (#1340); it is the only cross-class key in the
// catalog (pinned by entry-scoped-resources.test.ts's standing invariant).
export const SHARED_POOL_MERGE: Record<string, PoolMergeStrategy> = {
  channelDivinity: "max",
};

// Combines a newly-seen entry's pool into the already-accumulated one for the
// same sanctioned key, per its declared strategy. Non-total fields (label,
// recharge, description, …) stay the earlier (primary-wins) entry's — only
// `total` is a 5e-mandated exception, mirroring mergeLayers' base-wins policy.
function mergeSharedPool(existing: DerivedResource, incoming: DerivedResource, strategy: PoolMergeStrategy): DerivedResource {
  switch (strategy) {
    case "max":
      return { ...existing, total: Math.max(existing.total, incoming.total) };
  }
}

// Rebuilds the `resources` pool layer (#1071) from EVERY class entry at its own
// effective level — focus/superiority-dice/rage/sorcery-points all scale to that
// class's own level (PHB'24 p.163), not the primary entry's or the summed total.
// A pool key repeated across entries merges via SHARED_POOL_MERGE when sanctioned
// (#1340 — e.g. channelDivinity), else throws (see SHARED_POOL_MERGE's comment).
// THE MERGE MUST STAY HERE, NOT in buildResourcesPayload (serialize/classes.ts):
// this is also where applySpendResourceOp's write-side spend cap and rest.ts's
// recharge both read `pool.total` from, so merging here — and only here — keeps
// the read-side clamp and the write-side cap structurally unable to diverge
// (CLAUDE.md's one-shared-rule-function invariant), with no
// LEVEL_GATED_RECONCILERS entry needed (a merged pool's total is derived fresh
// on every read/write, never persisted). Split out of deriveEntryScopedResources
// to keep that function's branching budget for the (unrelated) choice-cap
// overlay loop.
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

// Entry-scoped `features` layer (#1206): each entry's static feature list at
// that entry's OWN effective level, concatenated then deduped by `name` with
// the PRIMARY entry winning ties (classEntries[0] is processed first, so its
// features are kept over any later entry's same-named feature) — mirrors
// mergeLayers' base-wins-on-pool-key policy — then sorted by level (ties by
// name) exactly like mergeLayers. Fixes a Monk 5 / Fighter 3 multiclass
// surfacing the monk's level-7 features (previously seeded from the primary
// entry at total level). Features carry no `source`-class tag today, so a
// same-named feature from a different class collapses into one entry rather
// than being attributed to both — if per-class attribution is later needed,
// that's a separate change.
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

/**
 * Entry-scoped resource caps + pools + features for multiclass level-up
 * (#1177 caps, #1071 pools, #1206 features + extras): the EXTRAS_FIELDS
 * (maneuverChoiceCount/SaveDC, toolProfChoiceCount, subclassChoices), the
 * `resources` pool layer (focus, superiority dice, rage, sorcery points, …),
 * and the `features` list are all re-derived per class entry at that entry's
 * OWN effective level and merged — so a secondary Battle Master's maneuver
 * cap, its superiority-dice pool, AND its features all come from the fighter
 * entry's own level, not the primary entry's or the summed total (PHB'24
 * p.163: each class's pool scales to that class's own level). Level-gated
 * action-availability gates (a secondary Warrior of Shadow monk's shadowArts/
 * cloakOfShadows) are entry-scoped the same way, but through
 * deriveEntryScopedActions (actions.ts, #1315) rather than this function.
 * `effectiveEntryLevel` collapses to the XP-derived total for single-class
 * characters, so single-class output is byte-identical to a bare
 * deriveResources() call (see the parity tests).
 */
export function deriveEntryScopedResources<E extends EntryScopedClassEntry>(
  classEntries: E[],
  totalLevel: number,
  abilityScores: Record<string, number>,
  profBonus: number,
  edition: RulesEdition,
  // Optional (#1524): only buildResourcesView (serialize/classes.ts) — the ONE
  // production caller with real ClassFeature relations loaded — passes one.
  // See GetFeatureRows's own comment for why every other caller omits it.
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

  if (derived) {
    derived.resources = pools;
    derived.features = features;
  } else if (pools.length > 0 || features.length > 0) {
    derived = { resources: pools, features };
  }

  return { derived };
}
