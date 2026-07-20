// Step model for the creation ceremony (#1176). Fixed order; the spells step
// appears only for a level-1 caster (same predicate the form uses). Each step's
// missing-list is a slice of the one creationMissing rule set — no new
// validation is invented here.

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
      const bonuses = deriveBackgroundBonuses(draft, selections);
      return bonuses.applicable && !bonuses.complete ? ["Background ability scores"] : [];
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
