/**
 * Pure helper that explains *why* the character-creation "Save" button is
 * disabled. Given the load-bearing draft fields plus the selected class's
 * starting-equipment definition, it returns a human-readable list of the
 * requirements that are still unmet — including the nested weapon
 * sub-choices ("— choose —" dropdowns) inside an equipment package.
 *
 * Lives in lib/ (no JSX) so it can be unit-tested in isolation and keep
 * CharacterCreatePage thin. The `isValid` flag the page uses is simply
 * `missingRequirements(...).length === 0`.
 */

import { isPackageComplete, isGoldValid } from "@/lib/startingEquipment";
import type { ClassStartingEquipment } from "@/types/character";
import type { EquipmentDraft } from "@/lib/startingEquipment";

export interface CreationValidationInput {
  name: string;
  alignment: string;
  /** True once draft.speciesId is non-empty — a raw id-presence check (never
   *  a catalog lookup), so this stays correct even a render before the
   *  reference catalog has resolved (mirrors the subclass-required pattern:
   *  levelUpSteps.ts's `subclassId != null` gate). */
  speciesChosen: boolean;
  /** True when the chosen species has variant rows (a catalog fact, so this
   *  DOES need the resolved species — same shape as the equipment step's
   *  `selections.class?.startingEquipment` dependency below). */
  variantRequired: boolean;
  variantChosen: boolean;
  /** #1683: true when the resolved species+variant needs the Int/Wis/Cha
   *  casting-ability choice (SpeciesVariantOption/SpeciesOption's served
   *  needsCastingAbility, via deriveCastingAbilityChoice — a catalog fact,
   *  same shape as variantRequired above). Optional — defaults to "not
   *  required" so call sites that predate #1683 (and fixtures) need no change. */
  castingAbilityRequired?: boolean;
  castingAbilityChosen?: boolean;
  className: string;
  /** Resolved background name to submit (list selection or trimmed custom). */
  backgroundName: string;
  /** Selected class's starting-equipment definition, if any. */
  startingEquipment: ClassStartingEquipment | null;
  /** Current equipment draft (null = player hasn't touched it yet). */
  equipmentDraft: EquipmentDraft | null;
  /** #1565: selected background's OWN starting-equipment definition, if any
   *  (most backgrounds have none — see BackgroundOption's own comment). */
  backgroundStartingEquipment?: ClassStartingEquipment | null;
  /** #1565: current background equipment draft, parallel to equipmentDraft. */
  backgroundEquipmentDraft?: EquipmentDraft | null;
}

// One equipment block's missing-label(s), or [] when it's satisfied — shared
// by the class and background callers below (#1565) so `missingRequirements`
// itself stays a flat list of checks rather than two near-identical
// class/background branches inline. An untouched (null) draft is allowed for
// either — the character simply starts with no inventory/no background gear.
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
  // Gold mode: the dedicated editor surfaces its own range error, so we only
  // flag it here as a blocking requirement. A background never reaches this
  // branch in practice — the picker never offers a gold-mode toggle for one
  // (no background has a roll-for-gold alternative in either edition).
  return isGoldValid(startingEquipment, draft.gold) ? [] : ["Starting gold amount"];
}

/**
 * Returns the ordered list of unmet requirements as short display labels.
 * An empty array means the form is valid and Save can proceed.
 */
export function missingRequirements(input: CreationValidationInput): string[] {
  const missing: string[] = [];

  if (input.name.trim().length === 0) missing.push("Name");
  if (input.alignment.length === 0) missing.push("Alignment");
  if (!input.speciesChosen) missing.push("Species");
  // A variant-bearing species (2014 Dwarf, etc.) cannot Continue without one;
  // variantRequired is false for a variantless species (its catalog variants[]
  // is empty), so this branch is simply skipped for them — the picker's absent
  // second panel is the consequence of that, not the reason.
  else if (input.variantRequired && !input.variantChosen) missing.push("Variant");
  // #1683: only checked once a variant is settled (or none is required) — the
  // choice lives on the CHOSEN variant, so there's nothing to answer until
  // then; "Variant" stays the one blocking label in that case.
  else if (input.castingAbilityRequired && !input.castingAbilityChosen) missing.push("Casting ability");
  if (input.className.length === 0) missing.push("Class");
  if (input.backgroundName.length === 0) missing.push("Background");

  // Equipment validation mirrors CharacterCreatePage's intent — see
  // equipmentBlockMissing's own comment for the shared rule.
  missing.push(...equipmentBlockMissing(input.startingEquipment, input.equipmentDraft, "Equipment", "Starting equipment"));
  // #1565: the background's OWN package, same rule, independent block.
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

/**
 * Produces a precise label for an incomplete equipment *package*, pointing at
 * the first group that still needs attention — either an unpicked option or a
 * nested weapon sub-choice that's still on "— choose —". `labelPrefix`
 * (#1565) distinguishes the class package ("Equipment: …") from the
 * background's own ("Background equipment: …") — same function, two callers.
 */
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

/**
 * Returns true when a nested open-pick dropdown for the given group/pick is the
 * active blocker: its parent option is selected but the pick is still empty.
 * Used to visibly flag the "— choose —" select in the UI.
 */
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
