import { Prisma } from "@/generated/prisma/client.js";
import {
  TOOLS,
  deriveFeatProficiencies,
  type ArmorProficiencyCategory,
  type ToolProficiencyEntry,
} from "@/lib/srd/srd.js";
import { deriveItemGrants } from "@/lib/inventory/capabilities.js";
import type { ExpertiseEntry, ToolProfEntry } from "@/lib/classes/resources.js";
import type { CharacterWithRelations } from "@/lib/character/character-include.js";
import type { TargetModifierMap } from "./effects.js";

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

// Deduped, highest-priority source wins (class > feat). Multiclass takes the full union — a deliberate, conservatively permissive simplification of 5e's multiclass restrictions.
// featArmor also carries species-trait-granted armor (Mountain Dwarf's light+medium, #1682) — surfaces as source: "feat", not a new "race" bucket.
// Resolved through the class RELATION (#1529), never entry.name. entry.class is ??-guarded because CharacterClassEntry.classId is nullable BY DESIGN (homebrew) — not dead code, a homebrew entry correctly grants nothing here.
export function buildMergedArmorProficiencies(
  classEntries: { class: { armorProficiencies: string[] } | null }[],
  featArmor: Set<string>,
): Array<{ category: ArmorProficiencyCategory; source: "class" | "feat" }> {
  const seen = new Set<string>();
  const out: Array<{ category: ArmorProficiencyCategory; source: "class" | "feat" }> = [];

  const push = (cat: string, source: "class" | "feat") => {
    if (seen.has(cat)) return;
    seen.add(cat);
    out.push({ category: cat as ArmorProficiencyCategory, source });
  };

  for (const entry of classEntries) {
    for (const cat of entry.class?.armorProficiencies ?? []) push(cat, "class");
  }
  for (const cat of featArmor) push(cat, "feat");

  return out;
}

export function buildMergedWeaponProficiencies(
  classEntries: { class: { weaponProficiencies: string[] } | null }[],
  featWeapons: Set<string>,
): Array<{ name: string; source: "class" | "feat" }> {
  const seen = new Set<string>();
  const out: Array<{ name: string; source: "class" | "feat" }> = [];

  const push = (name: string, source: "class" | "feat") => {
    if (seen.has(name)) return;
    seen.add(name);
    out.push({ name, source });
  };

  for (const entry of classEntries) {
    for (const w of entry.class?.weaponProficiencies ?? []) push(w, "class");
  }
  for (const w of featWeapons) push(w, "feat");

  return out;
}

// Deduped by name — an existing grant wins, never demoted.
export function mergeItemWeaponProficiencies(
  base: Array<{ name: string; source: "class" | "feat" | "item" }>,
  itemProfs: { value: string; source: string }[],
  // fallow-ignore-next-line code-duplication -- input/output share the same source-tagged proficiency shape by contract
): Array<{ name: string; source: "class" | "feat" | "item" }> {
  const seen = new Set(base.map((e) => e.name));
  const out = [...base];
  for (const p of itemProfs) {
    if (seen.has(p.value)) continue;
    seen.add(p.value);
    out.push({ name: p.value, source: "item" });
  }
  return out;
}

// Deduped by name — an existing entry wins.
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

export function buildSavingThrowProficiencies(
  stored: string[],
  featSaves: Set<string>,
  itemSaveProfs: Set<string>,
): string[] {
  return featSaves.size > 0 || itemSaveProfs.size > 0
    ? [...new Set([...stored, ...featSaves, ...itemSaveProfs])]
    : stored;
}

// Feat/item grants only add proficiency, never remove it.
// resources carries the already-clamped expertiseKnown list (buildResourcesView) — sets expertise: true on exactly those skills; the frontend's skillBonus() doubles proficiency bonus off that flag.
export function buildSkillsView(
  row: CharacterWithRelations,
  featProficiencies: ReturnType<typeof deriveFeatProficiencies>,
  itemSkillProfs: Set<string>,
  buffTargets: TargetModifierMap,
  resources: { expertiseKnown: ExpertiseEntry[] } | undefined,
) {
  const expertSkills = new Set((resources?.expertiseKnown ?? []).map((e) => e.skill));
  return (row.skills as { name: string; ability: string; proficient: boolean }[]).map((s) => {
    const buffs = buffTargets[s.name] ?? [];
    const tempModifier = buffs.reduce((sum, b) => sum + b.modifier, 0);
    return {
      ...s,
      proficient: s.proficient || featProficiencies.skills.has(s.name) || itemSkillProfs.has(s.name),
      expertise: expertSkills.has(s.name),
      ...(tempModifier !== 0
        ? {
            tempModifier,
            tempModifierSources: buffs.map((b) => ({ label: b.source, value: b.modifier })),
          }
        : {}),
    };
  });
}

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
