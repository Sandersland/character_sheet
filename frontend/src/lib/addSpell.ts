// Pure catalog-filtering + custom-spell payload logic for AddSpellPanel.
import { levelLabel } from "@/lib/spellMeta";
import type { CatalogSpell, CustomSpellInput, SpellSchool } from "@/types/character";

export const LEVEL_OPTIONS = [
  { value: "", label: "All levels" },
  { value: "0", label: "Cantrips" },
  { value: "1", label: "1st level" },
  { value: "2", label: "2nd level" },
  { value: "3", label: "3rd level" },
  { value: "4", label: "4th level" },
  { value: "5", label: "5th level" },
  { value: "6", label: "6th level" },
  { value: "7", label: "7th level" },
  { value: "8", label: "8th level" },
  { value: "9", label: "9th level" },
];

export const SPELL_SCHOOLS: SpellSchool[] = [
  "abjuration", "conjuration", "divination", "enchantment",
  "evocation", "illusion", "necromancy", "transmutation",
];

export const INPUT_CLS =
  "w-full rounded-control border border-parchment-300 bg-parchment-50 px-2.5 py-1.5 text-sm text-parchment-900 placeholder:text-parchment-400 focus:border-arcane-500 focus:outline-none";
export const LABEL_CLS = "block text-xs font-semibold text-parchment-700";

export const BLANK_CUSTOM: CustomSpellInput = {
  name: "",
  level: 0,
  school: "evocation",
  castingTime: "1 action",
  range: "60 ft",
  duration: "Instantaneous",
  description: "",
};

// Catalog search + level filter (name or school substring, exact level match).
export function filterCatalog(
  catalog: CatalogSpell[] | null,
  search: string,
  levelFilter: string,
): CatalogSpell[] {
  return (catalog ?? []).filter((s) => {
    if (levelFilter && String(s.level) !== levelFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!s.name.toLowerCase().includes(q) && !s.school.includes(q)) return false;
    }
    return true;
  });
}

// "Level 3 · evocation · conc · ritual" meta line for a catalog result.
export function catalogMetaLine(spell: CatalogSpell): string {
  let line = `${levelLabel(spell.level)} · ${spell.school}`;
  if (spell.concentration) line += " · conc";
  if (spell.ritual) line += " · ritual";
  return line;
}

// "fire damage — 8d6 + 2" effect preview for a catalog result; null for utility
// spells and diceless effects (Mage Armor carries effectKind but no dice).
export function catalogEffectLine(spell: CatalogSpell): string | null {
  if (!spell.effectKind || !spell.effectDiceCount || !spell.effectDiceFaces) return null;
  const noun = spell.effectKind === "heal" ? "Healing" : `${spell.damageType ?? ""} damage`;
  const mod = spell.effectModifier ? ` + ${spell.effectModifier}` : "";
  return `${noun} — ${spell.effectDiceCount}d${spell.effectDiceFaces}${mod}`;
}

// Build the learnSpell custom payload; effect fields ride along only when opted in.
export function buildCustomSpellPayload(custom: CustomSpellInput, hasEffect: boolean): CustomSpellInput {
  const payload: CustomSpellInput = {
    name: custom.name.trim(),
    level: custom.level,
    school: custom.school,
    castingTime: custom.castingTime,
    range: custom.range,
    duration: custom.duration,
    description: custom.description,
    concentration: custom.concentration,
    ritual: custom.ritual,
  };
  if (hasEffect && custom.effectKind) {
    payload.effectKind = custom.effectKind;
    payload.effectDiceCount = custom.effectDiceCount;
    payload.effectDiceFaces = custom.effectDiceFaces;
    payload.effectModifier = custom.effectModifier;
    payload.damageType = custom.damageType;
    payload.attackType = custom.attackType;
    payload.saveAbility = custom.saveAbility;
    payload.upcastDicePerLevel = custom.upcastDicePerLevel;
    payload.cantripScaling = custom.cantripScaling;
  }
  return payload;
}
