import { Prisma } from "@/generated/prisma/client.js";
import {
  CLASS_PROFICIENCY_GRANTS,
  RACE_PROFICIENCY_GRANTS,
  TOOLS,
  deriveFeatProficiencies,
  type ArmorProficiencyCategory,
  type ToolProficiencyEntry,
} from "@/lib/srd/srd.js";
import { deriveItemGrants } from "@/lib/inventory/capabilities.js";
import type { ToolProfEntry } from "@/lib/classes/resources.js";
import type { CharacterWithRelations } from "@/lib/character/character-include.js";
import type { TargetModifierMap } from "./effects.js";

// Creation-fixed tool profs + level-gated subclass choices → one wire array;
// creation-fixed wins on dedup (survives level-down, no duplicate rows).
function buildMergedToolProficiencies(
  stored: Prisma.JsonValue,
  subclassKnown: ToolProfEntry[],
): Array<{ name: string; category: string; source: string }> {
  const creationFixed = (Array.isArray(stored) ? stored : []) as unknown as ToolProficiencyEntry[];
  const fixedNames = new Set(creationFixed.map((e) => e.name));

  const merged = [
    ...creationFixed.map((e) => ({
      name: e.name,
      category: TOOLS.find((t) => t.name === e.name)?.category ?? "other",
      source: e.source,
    })),
    // Only add subclass entries that don't duplicate a creation-fixed grant.
    ...subclassKnown
      .filter((e) => !fixedNames.has(e.name))
      .map((e) => ({
        name: e.name,
        category: TOOLS.find((t) => t.name === e.name)?.category ?? "other",
        source: "subclass" as const,
      })),
  ];
  return merged;
}

// Armor grants from class(es)/race/feats, deduped, highest-priority source wins
// (class > race > feat). Multiclass takes the full union — a deliberate,
// conservatively permissive simplification of 5e's multiclass restrictions.
export function buildMergedArmorProficiencies(
  classEntries: { name: string }[],
  raceName: string | undefined,
  featArmor: Set<string>,
): Array<{ category: ArmorProficiencyCategory; source: "class" | "race" | "feat" }> {
  const seen = new Set<string>();
  const out: Array<{ category: ArmorProficiencyCategory; source: "class" | "race" | "feat" }> = [];

  const push = (cat: string, source: "class" | "race" | "feat") => {
    if (seen.has(cat)) return;
    seen.add(cat);
    out.push({ category: cat as ArmorProficiencyCategory, source });
  };

  for (const entry of classEntries) {
    for (const cat of CLASS_PROFICIENCY_GRANTS[entry.name]?.armor ?? []) push(cat, "class");
  }
  if (raceName) {
    for (const cat of RACE_PROFICIENCY_GRANTS[raceName]?.armor ?? []) push(cat, "race");
  }
  for (const cat of featArmor) push(cat, "feat");

  return out;
}

// Weapon grants (category-level or specific names) from class(es)/race/feats,
// deduped, highest-priority wins; see buildMergedArmorProficiencies on multiclass.
export function buildMergedWeaponProficiencies(
  classEntries: { name: string }[],
  raceName: string | undefined,
  featWeapons: Set<string>,
): Array<{ name: string; source: "class" | "race" | "feat" }> {
  const seen = new Set<string>();
  const out: Array<{ name: string; source: "class" | "race" | "feat" }> = [];

  const push = (name: string, source: "class" | "race" | "feat") => {
    if (seen.has(name)) return;
    seen.add(name);
    out.push({ name, source });
  };

  for (const entry of classEntries) {
    for (const w of CLASS_PROFICIENCY_GRANTS[entry.name]?.weapons ?? []) push(w, "class");
  }
  if (raceName) {
    for (const w of RACE_PROFICIENCY_GRANTS[raceName]?.weapons ?? []) push(w, "race");
  }
  for (const w of featWeapons) push(w, "feat");

  return out;
}

// Append item-granted weapon proficiencies (#529) after class/race/feat grants,
// tagged source "item". Deduped by name — an existing grant wins (never demoted).
export function mergeItemWeaponProficiencies(
  base: Array<{ name: string; source: "class" | "race" | "feat" | "item" }>,
  itemProfs: { value: string; source: string }[],
  // fallow-ignore-next-line code-duplication -- input/output share the same source-tagged proficiency shape by contract
): Array<{ name: string; source: "class" | "race" | "feat" | "item" }> {
  const seen = new Set(base.map((e) => e.name));
  const out = [...base];
  for (const p of itemProfs) {
    if (seen.has(p.value)) continue;
    seen.add(p.value);
    out.push({ name: p.value, source: "item" });
  }
  return out;
}

// Append item-granted tool proficiencies (#529) after the merged creation/subclass
// tools, tagged source "item". Deduped by name — an existing entry wins.
function mergeItemToolProficiencies(
  base: Array<{ name: string; category: string; source: string }>,
  itemProfs: { value: string; source: string }[],
): Array<{ name: string; category: string; source: string }> {
  const seen = new Set(base.map((e) => e.name));
  const out = [...base];
  for (const p of itemProfs) {
    if (seen.has(p.value)) continue;
    seen.add(p.value);
    out.push({ name: p.value, category: TOOLS.find((t) => t.name === p.value)?.category ?? "other", source: "item" });
  }
  return out;
}

// Merge feat- and item-granted saving throw proficiencies (OR with the
// class-fixed stored set; deduped via Set round-trip). Returns the stored
// array untouched when there's nothing to merge.
export function buildSavingThrowProficiencies(
  stored: string[],
  featSaves: Set<string>,
  itemSaveProfs: Set<string>,
): string[] {
  return featSaves.size > 0 || itemSaveProfs.size > 0
    ? [...new Set([...stored, ...featSaves, ...itemSaveProfs])]
    : stored;
}

// Merge feat/item-granted skill proficiencies (proficient stays true if already
// true; grants only add) and overlay any active buff as an optional
// tempModifier + labeled breakdown (#438). Additive term, derived on read.
export function buildSkillsView(
  row: CharacterWithRelations,
  featProficiencies: ReturnType<typeof deriveFeatProficiencies>,
  itemSkillProfs: Set<string>,
  buffTargets: TargetModifierMap,
) {
  return (row.skills as { name: string; ability: string; proficient: boolean }[]).map((s) => {
    const buffs = buffTargets[s.name] ?? [];
    const tempModifier = buffs.reduce((sum, b) => sum + b.modifier, 0);
    return {
      ...s,
      proficient: s.proficient || featProficiencies.skills.has(s.name) || itemSkillProfs.has(s.name),
      ...(tempModifier !== 0
        ? {
            tempModifier,
            tempModifierSources: buffs.map((b) => ({ label: b.source, value: b.modifier })),
          }
        : {}),
    };
  });
}

// Merged tool proficiency list — creation-fixed entries (stored in
// Character.toolProficiencies) + level-gated subclass choices (from
// resources.toolProficienciesKnown, already clamped by buildResourcesView)
// + item grants. Deduped by name: creation-fixed wins over subclass.
export function buildToolProficienciesView(
  row: CharacterWithRelations,
  resources: object | undefined,
  itemGrants: ReturnType<typeof deriveItemGrants>,
) {
  return mergeItemToolProficiencies(
    buildMergedToolProficiencies(
      row.toolProficiencies,
      resources && "toolProficienciesKnown" in resources
        ? (resources as { toolProficienciesKnown: ToolProfEntry[] }).toolProficienciesKnown
        : [],
    ),
    itemGrants.proficiencies.filter((p) => p.profType === "tool"),
  );
}
