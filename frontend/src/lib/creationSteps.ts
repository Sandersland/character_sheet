import { ABILITY_ORDER } from "@/lib/abilities";
import {
  deriveBackgroundBonuses,
  deriveCastingAbilityChoice,
  deriveSkillChoices,
  deriveSpeciesBonuses,
  deriveSpeciesCantripChoice,
  deriveSpeciesOriginFeatChoice,
  deriveSpeciesSkillChoice,
  resolveBackgroundName,
} from "@/lib/characterCreation";
import type { CreationSelections } from "@/lib/characterCreation";
import { missingRequirements } from "@/lib/characterCreationValidation";
import { creationSpellCounts, creationSpellsMissing } from "@/lib/creationSpells";
import type { CharacterDraft } from "@/hooks/useCharacterDraft";

export type CreationStepKey = "identity" | "abilities" | "skills" | "spells" | "equipment" | "review";

export const CREATION_STEP_LABELS: Record<CreationStepKey, string> = {
  identity: "Identity",
  abilities: "Abilities",
  skills: "Skills & Tools",
  spells: "Spells",
  equipment: "Equipment",
  review: "Review",
};

// Reads chooseCantrip straight off `selections`, not deriveSpeciesCantripChoice
// (which also needs the draft's current pick) — only the spec's PRESENCE
// decides whether this step exists.
export function creationSteps(selections: CreationSelections): CreationStepKey[] {
  const steps: CreationStepKey[] = ["identity", "abilities", "skills"];
  const cantripSpec = selections.species?.chooseCantrip ?? selections.variant?.chooseCantrip;
  if (selections.class?.level1SpellPicks || cantripSpec) steps.push("spells");
  steps.push("equipment", "review");
  return steps;
}

// Asks missingRequirements with startingEquipment: null so only identity
// fields are flagged.
function identityMissing(draft: CharacterDraft, selections: CreationSelections): string[] {
  const castingAbility = deriveCastingAbilityChoice(draft, selections);
  return missingRequirements({
    name: draft.name,
    alignment: draft.alignment,
    speciesChosen: draft.speciesId.length > 0,
    variantRequired: (selections.species?.variants.length ?? 0) > 0,
    variantChosen: draft.variantId.length > 0,
    castingAbilityRequired: castingAbility.applicable,
    castingAbilityChosen: castingAbility.complete,
    className: draft.className,
    backgroundName: resolveBackgroundName(draft),
    startingEquipment: null,
    equipmentDraft: null,
  });
}

// missingRequirements emits the identity labels first as one contiguous
// block (never interleaved with equipment), and identity items are computed
// identically in both calls — so dropping identityMissing's length leaves
// exactly the equipment detail. If that ordering ever changes, this slice
// breaks.
function equipmentMissing(draft: CharacterDraft, selections: CreationSelections): string[] {
  const castingAbility = deriveCastingAbilityChoice(draft, selections);
  const full = missingRequirements({
    name: draft.name,
    alignment: draft.alignment,
    speciesChosen: draft.speciesId.length > 0,
    variantRequired: (selections.species?.variants.length ?? 0) > 0,
    variantChosen: draft.variantId.length > 0,
    castingAbilityRequired: castingAbility.applicable,
    castingAbilityChosen: castingAbility.complete,
    className: draft.className,
    backgroundName: resolveBackgroundName(draft),
    startingEquipment: selections.class?.startingEquipment ?? null,
    equipmentDraft: draft.equipmentDraft,
    backgroundStartingEquipment: selections.background?.startingEquipment ?? null,
    backgroundEquipmentDraft: draft.backgroundEquipmentDraft,
  });
  return full.slice(identityMissing(draft, selections).length);
}

function abilitiesMissing(draft: CharacterDraft, selections: CreationSelections): string[] {
  const missing: string[] = [];
  if (draft.abilityMethod === "roll" || draft.abilityMethod === "standardArray") {
    if (!draft.abilityPool) missing.push("Roll ability scores");
    else if (ABILITY_ORDER.some((a) => draft.abilityAssignments[a] === null)) {
      missing.push("Assign all ability scores");
    }
  }
  const bonuses = deriveBackgroundBonuses(draft, selections);
  if (bonuses.applicable && !bonuses.complete) missing.push("Background ability scores");
  // 2024 never applies: deriveSpeciesBonuses.applicable is false because
  // every served species row's spec is [].
  const speciesBonuses = deriveSpeciesBonuses(draft, selections);
  if (speciesBonuses.applicable && !speciesBonuses.complete) missing.push("Species ability scores");
  return missing;
}

function skillsMissing(draft: CharacterDraft, selections: CreationSelections): string[] {
  const classBackgroundSkills = deriveSkillChoices(draft, selections);
  const skillChoice = deriveSpeciesSkillChoice(draft, selections, [...classBackgroundSkills.granted, ...classBackgroundSkills.selected]);
  const missing = skillChoice.applicable && !skillChoice.complete ? ["Species skills"] : [];
  // Independent of the skill choice above — both may apply at once (2024
  // Human carries both Skillful and Versatile).
  const originFeatChoice = deriveSpeciesOriginFeatChoice(draft, selections);
  if (originFeatChoice.applicable && !originFeatChoice.complete) missing.push("Species origin feat");
  return missing;
}

function spellsMissing(draft: CharacterDraft, selections: CreationSelections): string[] {
  const missing = creationSpellsMissing(creationSpellCounts(selections.class), draft.cantripIds, draft.spellIds);
  const cantripChoice = deriveSpeciesCantripChoice(draft, selections);
  if (cantripChoice.applicable && !cantripChoice.complete) missing.push("Species cantrip");
  return missing;
}

export function creationStepMissing(
  key: CreationStepKey,
  draft: CharacterDraft,
  selections: CreationSelections,
): string[] {
  switch (key) {
    case "identity":
      return identityMissing(draft, selections);
    case "abilities":
      return abilitiesMissing(draft, selections);
    case "spells":
      return spellsMissing(draft, selections);
    case "equipment":
      return equipmentMissing(draft, selections);
    case "skills":
      return skillsMissing(draft, selections);
    case "review":
      return [];
  }
}

// Lives here, not characterCreation, so the step model doesn't import back
// into characterCreation — keeps the dependency one-directional.
export function creationMissing(draft: CharacterDraft, selections: CreationSelections): string[] {
  return creationSteps(selections).flatMap((key) => creationStepMissing(key, draft, selections));
}
