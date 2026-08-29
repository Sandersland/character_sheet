// isValid on the page is simply missingRequirements(...).length === 0.
import { isPackageComplete, isGoldValid } from "@/lib/startingEquipment";
import type { ClassStartingEquipment } from "@/types/character";
import type { EquipmentDraft } from "@/lib/startingEquipment";

export interface CreationValidationInput {
  name: string;
  alignment: string;
  // Raw id-presence check, never a catalog lookup — correct even before the reference catalog resolves; mirrors levelUpSteps.ts's subclassId != null gate.
  speciesChosen: boolean;
  // A catalog fact, so it needs the resolved species — same shape as startingEquipment's dependency below.
  variantRequired: boolean;
  variantChosen: boolean;
  // A catalog fact (served needsCastingAbility via deriveCastingAbilityChoice), same shape as variantRequired; optional so pre-#1683 call sites need no change.
  castingAbilityRequired?: boolean;
  castingAbilityChosen?: boolean;
  className: string;
  backgroundName: string;
  startingEquipment: ClassStartingEquipment | null;
  equipmentDraft: EquipmentDraft | null;
  backgroundStartingEquipment?: ClassStartingEquipment | null;
  backgroundEquipmentDraft?: EquipmentDraft | null;
}

// Shared by the class and background callers (#1565) so missingRequirements stays flat, not two near-identical branches. A null draft is allowed for either — no inventory/no background gear yet.
function equipmentBlockMissing(
  startingEquipment: ClassStartingEquipment | null | undefined,
  draft: EquipmentDraft | null | undefined,
  labelPrefix: string,
  fallbackLabel: string
): string[] {
  if (!startingEquipment || !draft) return [];
  if (draft.mode === "package") {
    if (isPackageComplete(startingEquipment, draft.selections)) return [];
    return [incompletePackageDetail(startingEquipment, draft, labelPrefix) ?? fallbackLabel];
  }
  // A background never reaches gold mode in practice — no background offers a roll-for-gold alternative in either edition.
  return isGoldValid(startingEquipment, draft.gold) ? [] : ["Starting gold amount"];
}

export function missingRequirements(input: CreationValidationInput): string[] {
  const missing: string[] = [];

  if (input.name.trim().length === 0) missing.push("Name");
  if (input.alignment.length === 0) missing.push("Alignment");
  if (!input.speciesChosen) missing.push("Species");
  // variantRequired is false when the species has no variants — the picker's absent second panel is a consequence of that, not the reason this branch is skipped.
  else if (input.variantRequired && !input.variantChosen) missing.push("Variant");
  // Only checked once a variant is settled (or none required) — the choice lives on the chosen variant, so "Variant" stays the one blocking label until then (#1683).
  else if (input.castingAbilityRequired && !input.castingAbilityChosen) missing.push("Casting ability");
  if (input.className.length === 0) missing.push("Class");
  if (input.backgroundName.length === 0) missing.push("Background");

  missing.push(...equipmentBlockMissing(input.startingEquipment, input.equipmentDraft, "Equipment", "Starting equipment"));
  // The background's own package, same rule, independent block (#1565).
  missing.push(
    ...equipmentBlockMissing(
      input.backgroundStartingEquipment,
      input.backgroundEquipmentDraft,
      "Background equipment",
      "Background equipment",
    ),
  );

  return missing;
}

// labelPrefix distinguishes the class package from the background's own — same function, two callers (#1565).
function incompletePackageDetail(
  startingEquipment: ClassStartingEquipment,
  draft: Extract<EquipmentDraft, { mode: "package" }>,
  labelPrefix: string
): string | null {
  const { groups } = startingEquipment;
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    const sel = draft.selections[i];
    if (!sel || sel.optionIndex === -1) {
      return `${labelPrefix}: choose "${group.label}"`;
    }
    const bundle = group.options[sel.optionIndex];
    if (!bundle) {
      return `${labelPrefix}: choose "${group.label}"`;
    }
    const openPicks = bundle.openPicks ?? [];
    const provided = sel.openPicks ?? [];
    for (let p = 0; p < openPicks.length; p++) {
      if (!provided[p]) {
        return `${labelPrefix}: pick "${openPicks[p].label}"`;
      }
    }
  }
  return null;
}

export function isOpenPickUnfilled(
  draft: EquipmentDraft | null,
  groupIdx: number,
  pickIdx: number
): boolean {
  if (!draft || draft.mode !== "package") return false;
  const sel = draft.selections[groupIdx];
  if (!sel || sel.optionIndex === -1) return false;
  return !sel.openPicks?.[pickIdx];
}
