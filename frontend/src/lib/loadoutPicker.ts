// SRD 5.2 "Interacting with Things": one free object interaction per turn, plus one equip/unequip per Attack-action attack (attackEquipCredits); beyond that, changing a weapon costs the Action (stand-in for the unmodeled Utilize action).
import { bagItemsForSlot, itemsInSlot } from "@/lib/paperDoll";
import type { EquipSlot, InventoryItem } from "@/types/character";

export const NO_BUDGET_REASON =
  "No free interaction or Action left — this needs a Utilize action";

/** Mirrors TurnState's interaction-budget slice. */
export interface InteractionBudget {
  attackEquipCredits: number;
  freeInteractionUsed: boolean;
}

export function interactionBudgetRemaining(budget: InteractionBudget): number {
  return budget.attackEquipCredits + (budget.freeInteractionUsed ? 0 : 1);
}

/** Pays attack credits before the free interaction; null when the budget can't cover unitsNeeded (caller falls back to the Action). */
export interface InteractionSpend {
  fromAttackCredits: number;
  usedFreeInteraction: boolean;
}

export function planInteractionSpend(
  budget: InteractionBudget,
  unitsNeeded: number,
): InteractionSpend | null {
  if (interactionBudgetRemaining(budget) < unitsNeeded) return null;
  const fromAttackCredits = Math.min(budget.attackEquipCredits, unitsNeeded);
  const usedFreeInteraction = fromAttackCredits < unitsNeeded;
  return { fromAttackCredits, usedFreeInteraction };
}

function canInteract(budget: InteractionBudget, actionsRemaining: number): boolean {
  return interactionBudgetRemaining(budget) > 0 || actionsRemaining > 0;
}

export interface HandContext {
  mainOcc: InventoryItem | undefined;
  offOcc: InventoryItem | undefined;
  actionsRemaining: number;
  budget: InteractionBudget;
}

export type SwapCost = "free" | "action" | "blocked";

export interface PickerOption {
  item: InventoryItem | null;
  label: string;
  count: number;
  cost: SwapCost;
  disabledReason: string | null;
}

export function handContext(
  inventory: InventoryItem[],
  actionsRemaining: number,
  budget: InteractionBudget,
): HandContext {
  return {
    mainOcc: itemsInSlot(inventory, "MAIN_HAND")[0],
    offOcc: itemsInSlot(inventory, "OFF_HAND")[0],
    actionsRemaining,
    budget,
  };
}

// Units needed: one per hand stowed (target hand, plus the other hand for a two-handed incoming weapon) plus the draw itself.
function interactionsForEquip(incoming: InventoryItem, slot: EquipSlot, ctx: HandContext): number {
  const targetOcc = slot === "MAIN_HAND" ? ctx.mainOcc : ctx.offOcc;
  const otherOcc = slot === "MAIN_HAND" ? ctx.offOcc : ctx.mainOcc;
  const twoHanded = Boolean(incoming.weapon?.twoHanded);
  const stows = [targetOcc, twoHanded ? otherOcc : undefined].filter(Boolean).length;
  return stows + 1;
}

function costFor(unitsNeeded: number, ctx: HandContext): { cost: SwapCost; disabledReason: string | null } {
  if (planInteractionSpend(ctx.budget, unitsNeeded)) return { cost: "free", disabledReason: null };
  if (ctx.actionsRemaining > 0) return { cost: "action", disabledReason: null };
  return { cost: "blocked", disabledReason: NO_BUDGET_REASON };
}

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
    const { cost, disabledReason } = costFor(interactionsForEquip(group[0], slot, ctx), ctx);
    options.push({ item: group[0], label: name, count: group.length, cost, disabledReason });
  }

  const targetOcc = slot === "MAIN_HAND" ? ctx.mainOcc : ctx.offOcc;
  if (targetOcc) {
    // Stowing is one interaction, budget/Action-gated like any other — 2024 RAW has no free stow.
    const { cost, disabledReason } = costFor(1, ctx);
    options.push({ item: null, label: "Stow — empty hand", count: 0, cost, disabledReason });
  }
  return options;
}

/** Blocked only when NO interaction is possible; the gate is turn-wide, so no `slot` param is needed. */
export function handButtonDisabledReason(ctx: HandContext): string | null {
  return canInteract(ctx.budget, ctx.actionsRemaining) ? null : NO_BUDGET_REASON;
}

export function changeWeaponsSubtitle(
  loadoutLabel: string,
  budgetRemaining: number,
  actionAvailable: boolean,
): string {
  if (budgetRemaining > 0) return `${loadoutLabel} · free interaction available`;
  if (actionAvailable) return `${loadoutLabel} · a swap now costs your Action`;
  return `${loadoutLabel} · no free interaction or Action left`;
}
