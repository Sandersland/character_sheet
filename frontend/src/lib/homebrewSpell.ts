// Pure draft/payload/validation logic for the homebrew-spell creation and
// management forms (#1787/#1788, epic #1782 4/5-5/5). No JSX —
// HomebrewSpellForm, HomebrewTab, and their subcomponents are the only
// consumers. This is a CLIENT-SIDE UX mirror of validateCustomSpellCoherence:
// the backend remains the source of truth (it re-validates on every
// POST/PATCH), this only lets the form show an inline error / disable submit
// before round-tripping.
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

// Builds the POST/PATCH /api/spells/custom body from the form's draft state.
// Effect fields ride along only when the "enable auto-rolling" toggle is on
// AND a kind is chosen (mirrors buildCustomSpellPayload's own two-gate
// shape) — damage-only fields (damageType/attackType) are
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

// The manage view's own filter (#1788, epic #1782 5/5): GET /api/spells
// already scopes ownerId to `{ null, caller }` server-side (#1786), so any
// row with ownerId set here IS the caller's own — no separate "mine" endpoint
// or current-user id needed on the frontend.
export function ownedHomebrewSpells(catalog: CatalogSpell[]): CatalogSpell[] {
  return catalog.filter((spell) => spell.ownerId !== undefined);
}

// Maps a served CatalogSpell (GET /api/spells row) back into the editable
// draft shape HomebrewSpellForm consumes, for the manage view's "Edit" action.
// Unlike BLANK_HOMEBREW_SPELL, `components` here CAN be legitimately absent —
// a homebrew row created outside this form (or before components was
// required) may have skipped it — so this fallback is a real data-shape
// guard, unlike HomebrewSpellForm's own `draft.components!` (unreachable
// there: the form's own draft lifecycle always sets it).
//
// Only ever called on an already-`ownedHomebrewSpells`-filtered row, i.e. one
// this exact form wrote through customSpellSchema: effectKind is therefore
// never "buff" (CatalogSpell's broader union also covers seeded rows, which
// this form cannot produce) and saveAbility is always one of
// customSpellSchema's SAVE_ABILITIES — narrowing casts, not escape hatches.
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
