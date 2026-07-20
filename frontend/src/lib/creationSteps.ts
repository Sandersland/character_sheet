// Step model for the creation ceremony (#1176). Fixed order; the spells step
// appears only for a level-1 caster (same predicate the form uses). Each step's
// missing-list is a slice of the one creationMissing rule set — no new
// validation is invented here.

import { ABILITY_ORDER } from "@/lib/abilities";
import { deriveBackgroundBonuses, resolveBackgroundName } from "@/lib/characterCreation";
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

/** The steps this character walks, in order — spells only for a level-1 caster. */
export function creationSteps(selections: CreationSelections): CreationStepKey[] {
  const steps: CreationStepKey[] = ["identity", "abilities", "skills"];
  if (selections.class?.level1SpellPicks) steps.push("spells");
  steps.push("equipment", "review");
  return steps;
}

// The five identity-field checks share missingRequirements' rule by asking it
// with no equipment (startingEquipment null) so nothing but identity is flagged.
function identityMissing(draft: CharacterDraft): string[] {
  return missingRequirements({
    name: draft.name,
    alignment: draft.alignment,
    race: draft.race,
    className: draft.className,
    backgroundName: resolveBackgroundName(draft),
    startingEquipment: null,
    equipmentDraft: null,
  });
}

// The equipment slice is missingRequirements' full output minus its identity
// prefix — identity items are computed identically in both calls, so the
// difference is exactly the equipment detail.
function equipmentMissing(draft: CharacterDraft, selections: CreationSelections): string[] {
  const full = missingRequirements({
    name: draft.name,
    alignment: draft.alignment,
    race: draft.race,
    className: draft.className,
    backgroundName: resolveBackgroundName(draft),
    startingEquipment: selections.class?.startingEquipment ?? null,
    equipmentDraft: draft.equipmentDraft,
  });
  return full.slice(identityMissing(draft).length);
}

/** The unmet-requirement labels owned by one creation step. */
export function creationStepMissing(
  key: CreationStepKey,
  draft: CharacterDraft,
  selections: CreationSelections,
): string[] {
  switch (key) {
    case "identity":
      return identityMissing(draft);
    case "abilities": {
      const missing: string[] = [];
      // Pool methods (roll / standard array) must be rolled and fully assigned
      // before Continue — the +2/+1 background spread alone no longer clears the
      // step (#1161). Manual / point-buy always carry six live scores, so they
      // only gate on the background spread below.
      if (draft.abilityMethod === "roll" || draft.abilityMethod === "standardArray") {
        if (!draft.abilityPool) missing.push("Roll ability scores");
        else if (ABILITY_ORDER.some((a) => draft.abilityAssignments[a] === null)) {
          missing.push("Assign all ability scores");
        }
      }
      const bonuses = deriveBackgroundBonuses(draft, selections);
      if (bonuses.applicable && !bonuses.complete) missing.push("Background ability scores");
      return missing;
    }
    case "spells":
      return creationSpellsMissing(creationSpellCounts(selections.class), draft.cantripIds, draft.spellIds);
    case "equipment":
      return equipmentMissing(draft, selections);
    case "skills":
    case "review":
      return [];
  }
}
