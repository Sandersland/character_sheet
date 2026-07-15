// Flattens the per-class definitions in classes/<class>.ts into the dispatch
// tables deriveResources() merges from, and exposes the class-features.ts
// public surface (resolveClassDie / deriveResources / deriveResourcesForCharacterRow).
import { levelForExperience, proficiencyBonusForLevel } from "@/lib/leveling/experience.js";

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
): ClassLayer {
  return {
    pools: classDef?.resourceFn ? classDef.resourceFn(level, abilityScores, profBonus) : [],
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

  const base = deriveBaseLayer(CLASSES[classKey], level, abilityScores, profBonus);
  const sub = deriveSubclassLayer(subclassKey, level, abilityScores, profBonus);
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
