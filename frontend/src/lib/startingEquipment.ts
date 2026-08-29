// Lives here, not in StartingEquipmentEditor, so that component file exports
// only the React component (required for Vite's Fast Refresh to work reliably).
import type {
  ClassStartingEquipment,
  PackageSelection,
  StartingEquipmentInput,
  StartingGold,
} from "@/types/character";

export type PackageState = PackageSelection[];

export type EquipmentDraft =
  | { mode: "package"; selections: PackageState }
  | { mode: "gold"; gold: number };

export function emptyPackageState(startingEquipment: ClassStartingEquipment): PackageState {
  return startingEquipment.groups.map((group) => ({
    // Auto-grant groups (exactly one option) start pre-selected: the UI renders
    // them as a static label with no radio button, so a player never sets this.
    optionIndex: group.options.length === 1 ? 0 : -1,
    openPicks: [],
  }));
}

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
// directly, so the null case (PHB'24 has no roll-for-gold rule) stays a
// caller-side guard (isGoldValid below) rather than duplicated into each one.
export function goldMin(gold: StartingGold): number {
  return gold.diceCount * gold.multiplier;
}

export function goldMax(gold: StartingGold): number {
  return gold.diceCount * gold.diceFaces * gold.multiplier;
}

// Always false when this edition has no roll-for-gold rule (gold: null) —
// there is no range to be valid within.
export function isGoldValid(startingEquipment: ClassStartingEquipment, gold: number): boolean {
  if (!startingEquipment.gold) return false;
  return gold >= goldMin(startingEquipment.gold) && gold <= goldMax(startingEquipment.gold);
}

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

export function goldLabel(gold: StartingGold): string {
  return `${gold.diceCount}d${gold.diceFaces}×${gold.multiplier}`;
}

export function rollGold(gold: StartingGold): number {
  let total = 0;
  for (let i = 0; i < gold.diceCount; i++) {
    total += Math.floor(Math.random() * gold.diceFaces) + 1;
  }
  return total * gold.multiplier;
}
