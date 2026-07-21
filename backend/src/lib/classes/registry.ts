// Flattens the per-class definitions in classes/<class>.ts into the dispatch
// tables deriveResources() merges from, and exposes the class-features.ts
// public surface (resolveClassDie / deriveResources / deriveResourcesForCharacterRow).
import { levelForExperience, proficiencyBonusForLevel } from "@/lib/leveling/experience.js";
import { effectiveEntryLevel } from "@/lib/leveling/effective-levels.js";

import { barbarian } from "./barbarian.js";
import { bard } from "./bard.js";
import { cleric } from "./cleric.js";
import { druid } from "./druid.js";
import { fighter } from "./fighter.js";
import { monk } from "./monk.js";
import { paladin } from "./paladin.js";
import { ranger } from "./ranger.js";
import { rogue } from "./rogue.js";
import { sorcerer } from "./sorcerer.js";
import type { ClassDefinition, DerivedClassInfo, DerivedFeature, DerivedResource, SubclassDefinition } from "./types.js";
import { warlock } from "./warlock.js";
import { wizard } from "./wizard.js";

const CLASSES: Record<string, ClassDefinition> = {
  barbarian,
  bard,
  cleric,
  druid,
  fighter,
  monk,
  paladin,
  ranger,
  rogue,
  sorcerer,
  warlock,
  wizard,
};

// Subclass keys are global (not scoped per class) — matching the original
// class-features.ts dispatch tables, where a subclass name is looked up
// independent of the character's base class.
const SUBCLASSES: Record<string, SubclassDefinition> = {};
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

function deriveBaseLayer(
  classDef: ClassDefinition | undefined,
  level: number,
  abilityScores: Record<string, number>,
  profBonus: number,
  subclassKey: string | undefined,
): ClassLayer {
  return {
    pools: classDef?.resourceFn ? classDef.resourceFn(level, abilityScores, profBonus, subclassKey) : [],
    features: (classDef?.features ?? []).filter((f) => f.level <= level),
  };
}

interface SubclassLayer extends ClassLayer {
  active: boolean;
  def: SubclassDefinition | undefined;
}

// A subclass contributes only once the character has reached its grant level (defaults to 3).
function isSubclassActive(def: SubclassDefinition | undefined, level: number): def is SubclassDefinition {
  if (!def) return false;
  return level >= (def.grantLevel ?? 3);
}

// Scoped to the subclass only, gated by its grant level.
function deriveSubclassLayer(
  subclassKey: string,
  level: number,
  abilityScores: Record<string, number>,
  profBonus: number,
): SubclassLayer {
  const def = SUBCLASSES[subclassKey];
  if (!isSubclassActive(def, level)) return { active: false, def, pools: [], features: [] };
  return {
    active: true,
    def,
    pools: def.resourceFn ? def.resourceFn(level, abilityScores, profBonus) : [],
    features: def.features.filter((f) => f.level <= level),
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
): DerivedClassInfo | null {
  const classKey = (className ?? "").toLowerCase();
  const subclassKey = (subclass ?? "").toLowerCase();

  const sub = deriveSubclassLayer(subclassKey, level, abilityScores, profBonus);
  // Feed the active subclass into the base pool derivation so base-wins pool-key
  // collisions (e.g. druid wildShape) resolve to the subclass's variant (#906).
  const base = deriveBaseLayer(CLASSES[classKey], level, abilityScores, profBonus, sub.active ? subclassKey : undefined);
  const { resources, features } = mergeLayers(base, sub);

  // Return null only for truly unknown/empty classes
  if (resources.length === 0 && features.length === 0) return null;

  const result: DerivedClassInfo = { resources, features };

  // Subclass-specific extra derived fields (e.g. Battle Master maneuvers,
  // Way of the Four Elements disciplines, Way of Shadow ki-cast unlocks).
  if (sub.active && sub.def?.deriveExtras) {
    Object.assign(result, sub.def.deriveExtras(level, abilityScores, profBonus));
  }

  // Generic subclass "choose N" features (#899): list only those the character
  // has reached (count > 0). The reconciler/clamp and level-up step read this.
  if (sub.active && sub.def?.choices) {
    const subclassChoices = sub.def.choices
      .map((c) => ({ key: c.key, label: c.label, catalogSource: c.catalogSource, count: c.count(level) }))
      .filter((c) => c.count > 0);
    if (subclassChoices.length > 0) result.subclassChoices = subclassChoices;
  }

  return result;
}

/**
 * Row-shaped convenience wrapper over {@link deriveResources}: derives level and
 * proficiency bonus from a character row's XP + primary class entry, then returns
 * that class's non-slot resource derivation plus the computed `level` — consumers
 * that also need level-scaled cost math (e.g. a future `disciplines.ts` migration)
 * can destructure `level` directly. Shared by the die-fueled activated-ability
 * handlers (maneuvers, shadow arts), which each re-read the same
 * {name, subclass} + XP + abilityScores select shape per op.
 */
export function deriveResourcesForCharacterRow(row: {
  experiencePoints: number;
  abilityScores: unknown;
  classEntries: { name: string; subclass: string | null }[];
}): { derived: DerivedClassInfo | null; level: number } {
  const level = levelForExperience(row.experiencePoints);
  const profBonus = proficiencyBonusForLevel(level);
  const primaryEntry = row.classEntries[0];
  const abilityScores = row.abilityScores as Record<string, number>;
  const derived = deriveResources(
    primaryEntry?.name ?? "",
    primaryEntry?.subclass ?? undefined,
    level,
    abilityScores,
    profBonus,
  );
  return { derived, level };
}

// The five choice-cap fields overlaid per class entry by deriveEntryScopedResources.
// (The pool `resources` layer is entry-scoped separately, below — #1071; `features`
// stays primary-at-total-level, #1177 non-goal, audited but not expanded by #1071.)
// Kept as a typed list so the overlay loop and its "has anything to contribute"
// check share one enumeration.
const CAP_FIELDS = [
  "maneuverChoiceCount",
  "maneuverSaveDC",
  "disciplineChoiceCount",
  "disciplineSaveDC",
  "toolProfChoiceCount",
] as const satisfies readonly (keyof DerivedClassInfo)[];

// Whether an entry's own-level derivation has any choice-cap field to overlay
// (a plain class/subclass with only pools/features contributes nothing here).
function entryContributesCapFields(info: DerivedClassInfo): boolean {
  return CAP_FIELDS.some((field) => info[field] !== undefined) || info.subclassChoices !== undefined;
}

// Defined-wins overlay of one entry's choice-cap fields onto the accumulator (a
// class appears at most once in classEntries, so no cross-entry collision).
// Creates an empty resources/features shell on first contribution if `derived`
// is still null (e.g. an empty-featured primary with a capped secondary).
function overlayCapFields(acc: DerivedClassInfo | null, info: DerivedClassInfo): DerivedClassInfo {
  const target = acc ?? { resources: [], features: [] };
  for (const field of CAP_FIELDS) {
    if (info[field] !== undefined) target[field] = info[field];
  }
  if (info.subclassChoices) {
    // Concat can't collide: choice keys are subclass-specific and each class appears at most once per character.
    target.subclassChoices = [...(target.subclassChoices ?? []), ...info.subclassChoices];
  }
  return target;
}

// Rebuilds the `resources` pool layer (#1071) from EVERY class entry at its own
// effective level — ki/superiority-dice/rage/sorcery-points all scale to that
// class's own level (PHB'24 p.163), not the primary entry's or the summed total.
// Split out of deriveEntryScopedResources to keep that function's branching
// budget for the (unrelated) choice-cap overlay loop.
function collectEntryScopedPools(
  classEntries: { name: string; subclass?: string | null; level: number }[],
  totalLevel: number,
  abilityScores: Record<string, number>,
  profBonus: number,
): DerivedResource[] {
  // Pool keys are class-scoped (each class appears at most once in classEntries).
  const seenPoolKeys = new Set<string>();
  const pools: DerivedResource[] = [];
  for (const entry of classEntries) {
    const effLevel = effectiveEntryLevel(entry.level, classEntries.length, totalLevel);
    const info = deriveResources(entry.name, entry.subclass ?? undefined, effLevel, abilityScores, profBonus);
    for (const pool of info?.resources ?? []) {
      if (seenPoolKeys.has(pool.key)) {
        throw new Error(`collectEntryScopedPools: duplicate pool key "${pool.key}" from entry "${entry.name}"`);
      }
      seenPoolKeys.add(pool.key);
      pools.push(pool);
    }
  }
  return pools;
}

/**
 * Entry-scoped resource caps + pools for multiclass level-up (#1177 caps, #1071
 * pools): both the CHOICE-CAP fields (maneuverChoiceCount/SaveDC,
 * disciplineChoiceCount/SaveDC, toolProfChoiceCount, subclassChoices) and the
 * `resources` pool layer (ki, superiority dice, rage, sorcery points, …) are
 * re-derived per class entry at that entry's OWN effective level and merged —
 * so a secondary Battle Master's maneuver cap AND its superiority-dice pool
 * both come from the fighter entry's own level, not the primary entry's or the
 * summed total (PHB'24 p.163: each class's pool scales to that class's own
 * level). `features` and the two gate booleans (shadowArtsAvailable/
 * cloakOfShadowsAvailable) stay primary-at-total-level — audited for #1071 but
 * deliberately not entry-scoped here; see the issue for the follow-up note.
 * `effectiveEntryLevel` collapses to the XP-derived total for single-class
 * characters, so single-class output is byte-identical to a bare
 * deriveResources() call (see the parity tests).
 *
 * disciplineLevel is the effective level of whichever entry contributed
 * disciplineChoiceCount (fallback: totalLevel) — the level the discipline
 * learn/swap ops must gate against, since it may differ from totalLevel for a
 * secondary Way of the Four Elements monk.
 */
export function deriveEntryScopedResources(
  classEntries: { name: string; subclass?: string | null; level: number }[],
  totalLevel: number,
  abilityScores: Record<string, number>,
  profBonus: number,
): { derived: DerivedClassInfo | null; disciplineLevel: number } {
  const primary = classEntries[0];
  const base = deriveResources(primary?.name ?? "", primary?.subclass ?? undefined, totalLevel, abilityScores, profBonus);

  // Seed from base for features + the two out-of-scope gate booleans
  // (shadowArtsAvailable/cloakOfShadowsAvailable stay primary-at-total-level).
  // resources/subclassChoices are dropped here: the loop below rebuilds `pools`
  // from EVERY entry (including the primary) at its own effective level, so
  // carrying base's totalLevel-scaled resources over would double-count the
  // primary's pool. The scalar CAP_FIELDS are safe to carry over as-is — the
  // loop's defined-wins overlay replaces (never adds to) them. features is
  // cloned (not just spread) so mutating the returned object can't leak into base.
  let derived: DerivedClassInfo | null = base
    ? { ...base, resources: [], features: [...base.features], subclassChoices: undefined }
    : null;
  // Fallback for characters with no discipline-granting entry; discipline ops on them have no monk level to key off.
  let disciplineLevel = totalLevel;

  for (const entry of classEntries) {
    const effLevel = effectiveEntryLevel(entry.level, classEntries.length, totalLevel);
    const info = deriveResources(entry.name, entry.subclass ?? undefined, effLevel, abilityScores, profBonus);
    if (!info || !entryContributesCapFields(info)) continue;

    derived = overlayCapFields(derived, info);
    if (info.disciplineChoiceCount !== undefined) disciplineLevel = effLevel;
  }

  const pools = collectEntryScopedPools(classEntries, totalLevel, abilityScores, profBonus);
  if (derived) {
    derived.resources = pools;
  } else if (pools.length > 0) {
    derived = { resources: pools, features: [] };
  }

  return { derived, disciplineLevel };
}
