import { abilityModifier } from "@/lib/abilities";
import { draftToInput } from "@/lib/startingEquipment";
import { creationStepMissing, creationSteps } from "@/lib/creationSteps";
import type { CharacterDraft } from "@/hooks/useCharacterDraft";
import type {
  AbilityName,
  BackgroundOption,
  ClassOption,
  CreateCharacterInput,
  OriginFeatOption,
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

export interface CreationBackgroundBonuses {
  /** True when the selected (non-custom) background carries a 2024 ability spread. */
  applicable: boolean;
  /** The three abilities the spread draws from (empty when not applicable). */
  abilities: AbilityName[];
  /** The Origin feat the background grants, if any. */
  originFeat: OriginFeatOption | null;
  /** Current per-ability assignment restricted to the three choices. */
  assignment: Partial<Record<AbilityName, number>>;
  /** Whether the assignment is a legal +2/+1 or +1/+1/+1 spread. */
  complete: boolean;
}

// A legal PHB'24 spread is +2/+1 (two abilities) or +1/+1/+1 (three) — sums to 3.
function isValidSpread(values: number[]): boolean {
  const sorted = [...values].sort((a, b) => a - b);
  const isTwoOne = sorted.length === 2 && sorted[0] === 1 && sorted[1] === 2;
  const isOneOneOne = sorted.length === 3 && sorted.every((v) => v === 1);
  return isTwoOne || isOneOneOne;
}

// Restrict the draft's raw assignment to the three abilities with positive bumps.
function pickAssignment(
  raw: Partial<Record<AbilityName, number>>,
  abilities: AbilityName[],
): Partial<Record<AbilityName, number>> {
  const assignment: Partial<Record<AbilityName, number>> = {};
  for (const ability of abilities) {
    const value = raw[ability];
    if (value && value > 0) assignment[ability] = value;
  }
  return assignment;
}

// Derives the background ability-spread state for the form: which abilities are
// in play, the origin feat, the current assignment, and whether it's complete.
// Inert (applicable:false) for custom or spec-less (Folk Hero) backgrounds (#1130).
export function deriveBackgroundBonuses(
  draft: CharacterDraft,
  selections: CreationSelections,
): CreationBackgroundBonuses {
  const background = draft.useCustomBackground ? undefined : selections.background;
  const abilities = background?.abilityChoices ?? [];
  const applicable = abilities.length > 0;
  const assignment = pickAssignment(draft.backgroundAbilities, abilities);
  return {
    applicable,
    abilities,
    originFeat: background?.originFeat ?? null,
    assignment,
    complete: applicable && isValidSpread(Object.values(assignment)),
  };
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

// Fold the background spread's current assignment into the base scores so the
// preview (AC / init / HP) reflects the bonuses the backend will bake in (#1130).
function effectiveCreationScores(
  draft: CharacterDraft,
  selections: CreationSelections
): Record<AbilityName, number> {
  const bonuses = deriveBackgroundBonuses(draft, selections);
  const scores = { ...draft.abilityScores };
  for (const [ability, amount] of Object.entries(bonuses.assignment)) {
    scores[ability as AbilityName] += amount ?? 0;
  }
  return scores;
}

export function derivePreview(
  draft: CharacterDraft,
  selections: CreationSelections
): CreationPreview {
  const scores = effectiveCreationScores(draft, selections);
  const dexModifier = abilityModifier(scores.dexterity);
  const conModifier = abilityModifier(scores.constitution);
  return {
    armorClass: 10 + dexModifier,
    dexModifier,
    speed: selections.race?.speed,
    maxHp: selections.class
      ? Math.max(1, hitDieFace(selections.class.hitDie) + conModifier)
      : undefined,
  };
}

// The whole form's unmet requirements — the concatenation of every step's own
// missing-list (#1176), so the page's Save gate and the per-step gates can
// never disagree.
export function creationMissing(
  draft: CharacterDraft,
  selections: CreationSelections
): string[] {
  return creationSteps(selections).flatMap((key) => creationStepMissing(key, draft, selections));
}

export function buildCreatePayload(
  draft: CharacterDraft,
  selections: CreationSelections,
  skills: CreationSkillChoices,
  selectedToolChoices: string[]
): CreateCharacterInput {
  const backgroundBonuses = deriveBackgroundBonuses(draft, selections);
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
    // Only send a complete spread; the backend derives HP/init from it (#1130).
    backgroundAbilities: backgroundBonuses.complete ? backgroundBonuses.assignment : undefined,
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
