/**
 * Types and pure helpers for the starting-equipment draft used by
 * StartingEquipmentEditor and CharacterCreatePage. Lives here so the
 * component file exports only the React component (required for Vite's
 * Fast Refresh to work reliably).
 */

import type {
  ClassStartingEquipment,
  PackageSelection,
  StartingEquipmentInput,
  StartingGold,
} from "@/types/character";

// One set of selections for a "package" mode submission — parallel array to
// the class's groups, one entry per group with the chosen optionIndex and
// (for bundles with open picks) the resolved catalog item names.
export type PackageState = PackageSelection[];

export type EquipmentDraft =
  | { mode: "package"; selections: PackageState }
  | { mode: "gold"; gold: number };

/** Returns an empty PackageState for a class definition. */
export function emptyPackageState(startingEquipment: ClassStartingEquipment): PackageState {
  return startingEquipment.groups.map((group) => ({
    // Auto-grant groups (exactly one option) start pre-selected; the UI
    // renders them as a static label with no radio button, so the player
    // never interacts with them and optionIndex must not stay at -1.
    optionIndex: group.options.length === 1 ? 0 : -1,
    openPicks: [],
  }));
}

/**
 * Returns true if the package selections are fully complete (every group has
 * an optionIndex chosen and every open pick in the chosen bundle is filled).
 */
export function isPackageComplete(
  startingEquipment: ClassStartingEquipment,
  selections: PackageState
): boolean {
  if (selections.length !== startingEquipment.groups.length) return false;
  for (let i = 0; i < startingEquipment.groups.length; i++) {
    const group = startingEquipment.groups[i];
    const sel = selections[i];
    if (sel === undefined || sel.optionIndex === -1) return false;
    const bundle = group.options[sel.optionIndex];
    if (!bundle) return false;
    const openPicks = bundle.openPicks ?? [];
    const provided = sel.openPicks ?? [];
    if (provided.length !== openPicks.length) return false;
    if (provided.some((p) => !p)) return false;
  }
  return true;
}

// These four take a non-null StartingGold, never ClassStartingEquipment["gold"]
// directly — that keeps the null case (PHB'24: no roll-for-gold rule at all,
// #1564 commit 3) a caller-side guard (isGoldValid below, and the picker
// hiding the gold-mode toggle entirely) rather than a fifth null-check
// duplicated into every one of these.
export function goldMin(gold: StartingGold): number {
  return gold.diceCount * gold.multiplier;
}

export function goldMax(gold: StartingGold): number {
  return gold.diceCount * gold.diceFaces * gold.multiplier;
}

/** Returns true if the gold draft is a valid amount within the class range.
 *  Always false when this edition has no roll-for-gold rule (gold: null) —
 *  there is no range to be valid within. */
export function isGoldValid(startingEquipment: ClassStartingEquipment, gold: number): boolean {
  if (!startingEquipment.gold) return false;
  return gold >= goldMin(startingEquipment.gold) && gold <= goldMax(startingEquipment.gold);
}

/**
 * Converts an EquipmentDraft into the StartingEquipmentInput shape the API expects.
 * Returns null if the draft is incomplete or invalid.
 */
export function draftToInput(
  startingEquipment: ClassStartingEquipment,
  draft: EquipmentDraft
): StartingEquipmentInput | null {
  if (draft.mode === "gold") {
    if (!isGoldValid(startingEquipment, draft.gold)) return null;
    return { mode: "gold", gold: draft.gold };
  }
  if (!isPackageComplete(startingEquipment, draft.selections)) return null;
  return {
    mode: "package",
    selections: draft.selections.map((s) => ({
      optionIndex: s.optionIndex,
      openPicks: s.openPicks,
    })),
  };
}

/** Formats a gold dice expression like "5d4×10". */
export function goldLabel(gold: StartingGold): string {
  return `${gold.diceCount}d${gold.diceFaces}×${gold.multiplier}`;
}

/** Rolls the gold dice client-side and returns the total. */
export function rollGold(gold: StartingGold): number {
  let total = 0;
  for (let i = 0; i < gold.diceCount; i++) {
    total += Math.floor(Math.random() * gold.diceFaces) + 1;
  }
  return total * gold.multiplier;
}
