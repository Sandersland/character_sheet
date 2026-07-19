import { abilityModifier } from "@/lib/abilities";
import { draftToInput } from "@/lib/startingEquipment";
import { missingRequirements } from "@/lib/characterCreationValidation";
import { creationSpellCounts, creationSpellsMissing } from "@/lib/creationSpells";
import type { CharacterDraft } from "@/hooks/useCharacterDraft";
import type {
  BackgroundOption,
  ClassOption,
  CreateCharacterInput,
  RaceOption,
  ReferenceData,
  SkillName,
  StartingEquipmentInput,
} from "@/types/character";

export interface CreationSelections {
  race: RaceOption | undefined;
  class: ClassOption | undefined;
  background: BackgroundOption | undefined;
}

export interface CreationSkillChoices {
  granted: SkillName[];
  options: SkillName[];
  max: number;
  selected: SkillName[];
}

export interface CreationPreview {
  armorClass: number;
  dexModifier: number;
  speed: number | undefined;
  maxHp: number | undefined;
}

function hitDieFace(hitDie: string): number {
  return Number(hitDie.replace(/^d/i, ""));
}

// Match the draft's chosen race/class/background names to reference entries.
export function resolveSelections(
  reference: ReferenceData | null,
  draft: CharacterDraft
): CreationSelections {
  return {
    race: reference?.races.find((r) => r.name === draft.race),
    class: reference?.classes.find((c) => c.name === draft.className),
    background: reference?.backgrounds.find((b) => b.name === draft.background),
  };
}

// Granted skills come from the (non-custom) background; the player picks the
// rest from the class list, excluding already-granted ones, up to the cap.
export function deriveSkillChoices(
  draft: CharacterDraft,
  selections: CreationSelections
): CreationSkillChoices {
  const granted = draft.useCustomBackground ? [] : selections.background?.skillProficiencies ?? [];
  const options = (selections.class?.skillChoices ?? []).filter((s) => !granted.includes(s));
  const max = selections.class?.skillChoiceCount ?? 0;
  const selected = draft.skillProficiencies.filter((s) => options.includes(s));
  return { granted, options, max, selected };
}

// Custom backgrounds submit the trimmed free-text name; otherwise the list pick.
export function resolveBackgroundName(draft: CharacterDraft): string {
  return draft.useCustomBackground ? draft.customBackground.trim() : draft.background;
}

// An untouched (null) equipment draft submits nothing — the character simply
// starts with no inventory.
export function resolveEquipmentInput(
  draft: CharacterDraft,
  selectedClass: ClassOption | undefined
): StartingEquipmentInput | undefined {
  if (!draft.equipmentDraft || !selectedClass?.startingEquipment) return undefined;
  return draftToInput(selectedClass.startingEquipment, draft.equipmentDraft) ?? undefined;
}

export function derivePreview(
  draft: CharacterDraft,
  selections: CreationSelections
): CreationPreview {
  const dexModifier = abilityModifier(draft.abilityScores.dexterity);
  const conModifier = abilityModifier(draft.abilityScores.constitution);
  return {
    armorClass: 10 + dexModifier,
    dexModifier,
    speed: selections.race?.speed,
    maxHp: selections.class
      ? Math.max(1, hitDieFace(selections.class.hitDie) + conModifier)
      : undefined,
  };
}

export function creationMissing(
  draft: CharacterDraft,
  selections: CreationSelections
): string[] {
  return [
    ...missingRequirements({
      name: draft.name,
      alignment: draft.alignment,
      race: draft.race,
      className: draft.className,
      backgroundName: resolveBackgroundName(draft),
      startingEquipment: selections.class?.startingEquipment ?? null,
      equipmentDraft: draft.equipmentDraft,
    }),
    // #1131: a level-1 caster must finish its cantrip + spell picks.
    ...creationSpellsMissing(creationSpellCounts(selections.class), draft.cantripIds, draft.spellIds),
  ];
}

export function buildCreatePayload(
  draft: CharacterDraft,
  selections: CreationSelections,
  skills: CreationSkillChoices,
  selectedToolChoices: string[]
): CreateCharacterInput {
  return {
    name: draft.name.trim(),
    alignment: draft.alignment,
    race: draft.race,
    background: resolveBackgroundName(draft),
    classes: [{
      name: draft.className,
      subclass: draft.subclass.trim() || null,
      subclassId: draft.subclassId || undefined,
    }],
    abilityScores: draft.abilityScores,
    skillProficiencies: [...skills.granted, ...skills.selected],
    toolChoices: selectedToolChoices.length > 0 ? selectedToolChoices : undefined,
    portraitUrl: draft.portraitUrl.trim() || null,
    startingEquipment: resolveEquipmentInput(draft, selections.class) ?? undefined,
    // #1131: casters send their prepared picks; a non-caster omits the field.
    ...(selections.class?.level1SpellPicks
      ? { spells: { cantripIds: draft.cantripIds, spellIds: draft.spellIds } }
      : {}),
  };
}
