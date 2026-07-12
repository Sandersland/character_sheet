/**
 * Loadout picker rules (#789) — the JSX-free core of LoadoutSwapRow's per-hand
 * cards. Deduped bag candidates per hand (with ×N counts + a free Stow option)
 * and up-front action-cost gating, mirroring useLoadoutSwap's buildSwapOps: a
 * swap costs the Action when it stows a held item (the target hand, or — for a
 * two-handed weapon — the other hand). Keeps the component under fallow limits.
 */
import { bagItemsForSlot, itemsInSlot } from "@/lib/paperDoll";
import type { EquipSlot, InventoryItem } from "@/types/character";

export const NO_ACTION_REASON = "No action left — swapping a held item costs your Action";

export interface HandContext {
  mainOcc: InventoryItem | undefined;
  offOcc: InventoryItem | undefined;
  actionsRemaining: number;
}

export interface PickerOption {
  /** Representative bag item to equip; null for the free Stow (empty-hand) option. */
  item: InventoryItem | null;
  /** Display label — item name, or the Stow prompt. */
  label: string;
  /** Copies of this item in the bag (dedup count); 0 for Stow. */
  count: number;
  /** Whether choosing this option spends the Action (a real swap). */
  costsAction: boolean;
  /** Non-null when the option can't be chosen now — rendered as text, not title-only. */
  disabledReason: string | null;
}

/** The live MAIN/OFF occupants plus the remaining action count, for gating. */
export function handContext(inventory: InventoryItem[], actionsRemaining: number): HandContext {
  return {
    mainOcc: itemsInSlot(inventory, "MAIN_HAND")[0],
    offOcc: itemsInSlot(inventory, "OFF_HAND")[0],
    actionsRemaining,
  };
}

// Mirrors buildSwapOps: equipping `incoming` into `slot` stows the target hand's
// occupant and — for a two-handed weapon — the other hand's occupant too.
function swapCostsAction(incoming: InventoryItem, slot: EquipSlot, ctx: HandContext): boolean {
  const targetOcc = slot === "MAIN_HAND" ? ctx.mainOcc : ctx.offOcc;
  const otherOcc = slot === "MAIN_HAND" ? ctx.offOcc : ctx.mainOcc;
  const twoHanded = Boolean(incoming.weapon?.twoHanded);
  return Boolean(targetOcc) || (twoHanded && Boolean(otherOcc));
}

/** Deduped candidate options for one hand, plus a free Stow when it's occupied. */
export function handPickerOptions(
  inventory: InventoryItem[],
  slot: EquipSlot,
  ctx: HandContext,
): PickerOption[] {
  const groups = new Map<string, InventoryItem[]>();
  for (const item of bagItemsForSlot(inventory, slot)) {
    const group = groups.get(item.name) ?? [];
    group.push(item);
    groups.set(item.name, group);
  }

  const options: PickerOption[] = [];
  for (const [name, group] of groups) {
    const costsAction = swapCostsAction(group[0], slot, ctx);
    options.push({
      item: group[0],
      label: name,
      count: group.length,
      costsAction,
      disabledReason: costsAction && ctx.actionsRemaining <= 0 ? NO_ACTION_REASON : null,
    });
  }

  const targetOcc = slot === "MAIN_HAND" ? ctx.mainOcc : ctx.offOcc;
  if (targetOcc) {
    // Stowing a held weapon is a free object interaction — never action-costed.
    options.push({ item: null, label: "Stow — empty hand", count: 0, costsAction: false, disabledReason: null });
  }
  return options;
}

/** Why a hand's Change button is disabled: an occupied hand needs the Action. */
export function handButtonDisabledReason(slot: EquipSlot, ctx: HandContext): string | null {
  const occupied = Boolean(slot === "MAIN_HAND" ? ctx.mainOcc : ctx.offOcc);
  return occupied && ctx.actionsRemaining <= 0 ? NO_ACTION_REASON : null;
}

/** No legal loadout move at all: both hands occupied (or off-hand locked) and 0 actions. */
export function noLegalMove(ctx: HandContext, offHandLocked: boolean): boolean {
  if (ctx.actionsRemaining > 0) return false;
  const mainOpen = !ctx.mainOcc;
  const offOpen = !ctx.offOcc && !offHandLocked;
  return !mainOpen && !offOpen;
}
