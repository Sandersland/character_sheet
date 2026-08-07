// Pure draft/payload/validation logic for the homebrew-spell creation form
// (#1787, epic #1782 4/5). No JSX — HomebrewSpellForm.tsx and its
// subcomponents are the only consumers. This is a CLIENT-SIDE UX mirror of
// validateCustomSpellCoherence (backend/src/lib/spellcasting/custom-spell-validation.ts):
// the backend remains the source of truth (it re-validates on every
// POST/PATCH), this only lets the form show an inline error / disable
// submit before round-tripping.
import type { HomebrewSpellInput } from "@/types/character";

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

// Builds the POST/PATCH /api/spells/custom body from the form's draft state.
// Effect fields ride along only when the "enable auto-rolling" toggle is on
// AND a kind is chosen (mirrors buildCustomSpellPayload's own two-gate
// shape, lib/addSpell.ts) — damage-only fields (damageType/attackType) are
// scoped to effectKind "damage", and save fields (saveAbility/saveEffect) to
// attackType "save", so a "heal" or "attack" submission can never carry a
// field the backend's validateCustomSpellCoherence would reject.
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

// Same coherence rules validateCustomSpellCoherence enforces server-side,
// evaluated against the pre-submit draft: first violation's message, or null
// when internally consistent. Class-name validity (validateCustomSpellClasses)
// is DB-dependent and NOT mirrored here — the class picker only ever offers
// catalog class names to begin with, so that check can't be violated from the UI.
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
