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
  race: string;
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
  if (input.race.length === 0) missing.push("Race");
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
