// Step model for the creation ceremony (#1176). Fixed order; the spells step
// appears only for a level-1 caster (same predicate the form uses). Each step's
// missing-list is a slice of the one creationMissing rule set — no new
// validation is invented here.

import { ABILITY_ORDER } from "@/lib/abilities";
import {
  deriveBackgroundBonuses,
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

/** The steps this character walks, in order — spells for a level-1 caster
 *  OR (#1689) a species with its own cantrip choice (High Elf), whichever
 *  applies: a non-caster High Elf still needs the step for ITS cantrip. Reads
 *  chooseCantrip straight off `selections`, not deriveSpeciesCantripChoice
 *  (which also needs the draft's current pick) — only the served spec's
 *  PRESENCE decides whether the step exists. */
export function creationSteps(selections: CreationSelections): CreationStepKey[] {
  const steps: CreationStepKey[] = ["identity", "abilities", "skills"];
  const cantripSpec = selections.species?.chooseCantrip ?? selections.variant?.chooseCantrip;
  if (selections.class?.level1SpellPicks || cantripSpec) steps.push("spells");
  steps.push("equipment", "review");
  return steps;
}

// The identity-field checks share missingRequirements' rule by asking it with
// no equipment (startingEquipment null) so nothing but identity is flagged.
function identityMissing(draft: CharacterDraft, selections: CreationSelections): string[] {
  return missingRequirements({
    name: draft.name,
    alignment: draft.alignment,
    speciesChosen: draft.speciesId.length > 0,
    variantRequired: (selections.species?.variants.length ?? 0) > 0,
    variantChosen: draft.variantId.length > 0,
    className: draft.className,
    backgroundName: resolveBackgroundName(draft),
    startingEquipment: null,
    equipmentDraft: null,
  });
}

// The equipment slice is missingRequirements' full output minus its identity
// prefix. Invariant: missingRequirements emits the identity labels first as one
// contiguous block (never interleaved with equipment), and identity items are
// computed identically in both calls — so dropping identityMissing's length
// leaves exactly the equipment detail. If that ordering ever changes, this slice
// breaks.
function equipmentMissing(draft: CharacterDraft, selections: CreationSelections): string[] {
  const full = missingRequirements({
    name: draft.name,
    alignment: draft.alignment,
    speciesChosen: draft.speciesId.length > 0,
    variantRequired: (selections.species?.variants.length ?? 0) > 0,
    variantChosen: draft.variantId.length > 0,
    className: draft.className,
    backgroundName: resolveBackgroundName(draft),
    startingEquipment: selections.class?.startingEquipment ?? null,
    equipmentDraft: draft.equipmentDraft,
    // #1565: the background's own package sits in the SAME equipment step —
    // its missing-labels ride the same slice as the class ones above.
    backgroundStartingEquipment: selections.background?.startingEquipment ?? null,
    backgroundEquipmentDraft: draft.backgroundEquipmentDraft,
  });
  return full.slice(identityMissing(draft, selections).length);
}

// Pool methods (roll / standard array) must be rolled and fully assigned
// before Continue — the +2/+1 background spread alone no longer clears the
// step (#1161). Manual / point-buy always carry six live scores, so they
// only gate on the background spread below. Split out of creationStepMissing
// purely to keep its own cyclomatic/cognitive complexity under the repo's
// health gate.
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
  // #1681: 2014 species/subrace increases — a fixed-only species (or none
  // matched) is always complete (nothing to pick), so this only ever blocks a
  // choose-bearing species (Half-Elf) left unassigned. 2024 never applies
  // (deriveSpeciesBonuses.applicable is false — every served species row's
  // spec is []).
  const speciesBonuses = deriveSpeciesBonuses(draft, selections);
  if (speciesBonuses.applicable && !speciesBonuses.complete) missing.push("Species ability scores");
  return missing;
}

// #1689/#1690: the species skill choice (Half-Elf's Skill Versatility, 2024
// Human's Skillful, 2024 Elf's Keen Senses) — a fixed-only species (or none
// matched) is always complete (nothing to pick), so this only ever blocks a
// choose-bearing species left unassigned. Re-derives the class/background
// skill state (deriveSkillChoices) the SkillSection itself renders, same "no
// second copy of the rule" shape as abilitiesMissing above deriving its own
// bonuses. Split out for the same complexity-gate reason.
function skillsMissing(draft: CharacterDraft, selections: CreationSelections): string[] {
  const classBackgroundSkills = deriveSkillChoices(draft, selections);
  const skillChoice = deriveSpeciesSkillChoice(draft, selections, [...classBackgroundSkills.granted, ...classBackgroundSkills.selected]);
  const missing = skillChoice.applicable && !skillChoice.complete ? ["Species skills"] : [];
  // #1690: the species Origin feat choice (2024 Human's Versatile) rides the
  // SAME step as the skill choice above — both are SpeciesTrait.choice-driven
  // creation choices, independent requirements that may both apply at once
  // (2024 Human carries both Skillful and Versatile).
  const originFeatChoice = deriveSpeciesOriginFeatChoice(draft, selections);
  if (originFeatChoice.applicable && !originFeatChoice.complete) missing.push("Species origin feat");
  return missing;
}

// #1689: the species cantrip choice (High Elf's Cantrip) rides the same step
// but is a SEPARATE requirement from the class's own picks — a non-caster
// class reaches this step with `missing` already empty
// (creationSpellsMissing's null-counts short-circuit) and gates solely on
// this. Split out for the same complexity-gate reason as the two above.
function spellsMissing(draft: CharacterDraft, selections: CreationSelections): string[] {
  const missing = creationSpellsMissing(creationSpellCounts(selections.class), draft.cantripIds, draft.spellIds);
  const cantripChoice = deriveSpeciesCantripChoice(draft, selections);
  if (cantripChoice.applicable && !cantripChoice.complete) missing.push("Species cantrip");
  return missing;
}

/** The unmet-requirement labels owned by one creation step. */
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

// The whole form's unmet requirements — the concatenation of every step's own
// missing-list (#1176), so the page's Save gate and the per-step gates can
// never disagree. Lives here (not characterCreation) so the step model doesn't
// import back into characterCreation, keeping the dependency one-directional.
export function creationMissing(draft: CharacterDraft, selections: CreationSelections): string[] {
  return creationSteps(selections).flatMap((key) => creationStepMissing(key, draft, selections));
}
