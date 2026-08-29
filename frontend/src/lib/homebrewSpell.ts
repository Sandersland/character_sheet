// CLIENT-SIDE UX mirror of validateCustomSpellCoherence: the backend remains the source of truth and re-validates on every POST/PATCH.
import type { CatalogSpell, HomebrewSpellInput } from "@/types/character";

export const BLANK_HOMEBREW_SPELL: HomebrewSpellInput = {
  name: "",
  level: 0,
  school: "evocation",
  castingTime: "1 action",
  range: "60 feet",
  duration: "Instantaneous",
  description: "",
  concentration: false,
  ritual: false,
  components: { verbal: true, somatic: false, material: false },
  classes: [],
};

// Field scoping here must match what validateCustomSpellCoherence accepts server-side, or a "heal"/"attack" submission gets rejected.
export function buildHomebrewSpellPayload(draft: HomebrewSpellInput, hasEffect: boolean): HomebrewSpellInput {
  const payload: HomebrewSpellInput = {
    name: draft.name.trim(),
    level: draft.level,
    school: draft.school,
    castingTime: draft.castingTime.trim(),
    range: draft.range.trim(),
    duration: draft.duration.trim(),
    description: draft.description.trim(),
    concentration: draft.concentration,
    ritual: draft.ritual,
    components: draft.components,
    classes: draft.classes,
  };

  if (hasEffect && draft.effectKind) {
    payload.effectKind = draft.effectKind;
    payload.effectDiceCount = draft.effectDiceCount;
    payload.effectDiceFaces = draft.effectDiceFaces;
    payload.effectModifier = draft.effectModifier;
    payload.upcastDicePerLevel = draft.upcastDicePerLevel;

    if (draft.effectKind === "damage") {
      payload.damageType = draft.damageType;
      payload.attackType = draft.attackType;

      if (draft.attackType === "save") {
        payload.saveAbility = draft.saveAbility;
        payload.saveEffect = draft.saveEffect;
      }
    }
  }

  return payload;
}

// Mirrors validateCustomSpellCoherence; validateCustomSpellClasses is not mirrored since the class picker only ever offers catalog class names.
export function validateHomebrewSpellDraft(draft: HomebrewSpellInput, hasEffect: boolean): string | null {
  if (!draft.name.trim()) {
    return "Name is required.";
  }
  if (draft.level < 0 || draft.level > 9) {
    return "Level must be between 0 and 9.";
  }
  if (!draft.castingTime.trim() || !draft.range.trim() || !draft.duration.trim()) {
    return "Casting time, range, and duration are required.";
  }
  if (!draft.description.trim()) {
    return "Description is required.";
  }
  if (hasEffect && draft.effectKind) {
    if (draft.effectDiceCount === undefined || draft.effectDiceFaces === undefined) {
      return "Dice count and dice faces are required when an effect is enabled.";
    }
    if (draft.effectKind === "damage" && draft.attackType === "save" && !draft.saveAbility) {
      return 'Save ability is required when attack type is "save".';
    }
  }
  return null;
}

// Gate purely on `catalog.editable` (server-computed via isCatalogEntryEditable), never on `ownerId` or scope, so a shared row can't slip into the caller's own manage list.
export function ownedHomebrewSpells(catalog: CatalogSpell[]): CatalogSpell[] {
  return catalog.filter((spell) => spell.catalog?.editable === true);
}

// `components` can be legitimately absent on a served CatalogSpell (a homebrew row created before it was required), unlike HomebrewSpellForm's own draft lifecycle which always sets it.
// Only ever called on an already-ownedHomebrewSpells-filtered row, so effectKind is never "buff" and saveAbility is always one of customSpellSchema's SAVE_ABILITIES.
export function toHomebrewSpellInput(spell: CatalogSpell): HomebrewSpellInput {
  return {
    name: spell.name,
    level: spell.level,
    school: spell.school,
    castingTime: spell.castingTime,
    range: spell.range,
    duration: spell.duration,
    description: spell.description,
    concentration: spell.concentration,
    ritual: spell.ritual,
    components: spell.components ?? { verbal: true, somatic: false, material: false },
    classes: spell.classes,
    effectKind: spell.effectKind === "buff" ? undefined : spell.effectKind,
    effectDiceCount: spell.effectDiceCount,
    effectDiceFaces: spell.effectDiceFaces,
    effectModifier: spell.effectModifier,
    damageType: spell.damageType,
    attackType: spell.attackType,
    saveAbility: spell.saveAbility as HomebrewSpellInput["saveAbility"],
    saveEffect: spell.saveEffect ?? undefined,
    upcastDicePerLevel: spell.upcastDicePerLevel,
  };
}
