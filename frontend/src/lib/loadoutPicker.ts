/**
 * Loadout picker rules (#789, interaction-budget model #1165) — the JSX-free
 * core of InlineLoadoutPicker's per-hand cards and the Action-sheet's "Change
 * weapons" card.
 *
 * PHB'24 rules this models (settled on issue #1165):
 *  - one free object interaction per turn (SRD 5.2 "Interacting with Things")
 *  - the Attack action lets you equip/unequip one weapon per attack you make
 *    ("you can equip or unequip one weapon when you make this attack as part
 *    of the Attack action") — tracked as `attackEquipCredits` on the turn
 *  - beyond that, changing a weapon takes the Utilize action (mapped here to
 *    spending the turn's Action, since Utilize itself isn't modeled)
 *
 * Each equip or unequip is one interaction unit; a swap into an occupied hand
 * is 2 units (stow + draw), and — for a two-handed incoming weapon — up to 3
 * (stow both hands + draw). `planInteractionSpend` pays units from the budget
 * (attack credits first, then the free interaction); when the budget can't
 * cover it, the option costs the Action, or is blocked if that's gone too.
 */
import { bagItemsForSlot, itemsInSlot } from "@/lib/paperDoll";
import type { EquipSlot, InventoryItem } from "@/types/character";

export const NO_BUDGET_REASON =
  "No free interaction or Action left — this needs a Utilize action";

/** The turn's interaction-budget fields (mirrors the matching TurnState slice). */
export interface InteractionBudget {
  attackEquipCredits: number;
  freeInteractionUsed: boolean;
}

/** Free interaction units left this turn: unspent attack credits + the once-per-turn free interaction. */
export function interactionBudgetRemaining(budget: InteractionBudget): number {
  return budget.attackEquipCredits + (budget.freeInteractionUsed ? 0 : 1);
}

/** What paying `unitsNeeded` from the budget would spend — attack credits first
 *  (the more restrictive, per-attack resource), then the free interaction. Null
 *  when the budget can't cover it (caller falls back to the Action). */
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

/** Whether ANY interaction is possible right now — the budget covers the
 *  cheapest (1-unit) interaction, or the Action is still there to pay for it. */
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
  /** Representative bag item to equip; null for the Stow (empty-hand) option. */
  item: InventoryItem | null;
  /** Display label — item name, or the Stow prompt. */
  label: string;
  /** Copies of this item in the bag (dedup count); 0 for Stow. */
  count: number;
  /** free = paid from the interaction budget; action = spends the turn's Action; blocked = neither is available. */
  cost: SwapCost;
  /** Non-null when the option can't be chosen now — rendered as text, not title-only. */
  disabledReason: string | null;
}

/** The live MAIN/OFF occupants plus the actions + interaction budget, for gating. */
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

// Interaction units for equipping `incoming` into `slot`: one per hand stowed
// (the target, plus the other hand too for a two-handed incoming weapon) plus
// the draw itself.
function interactionsForEquip(incoming: InventoryItem, slot: EquipSlot, ctx: HandContext): number {
  const targetOcc = slot === "MAIN_HAND" ? ctx.mainOcc : ctx.offOcc;
  const otherOcc = slot === "MAIN_HAND" ? ctx.offOcc : ctx.mainOcc;
  const twoHanded = Boolean(incoming.weapon?.twoHanded);
  const stows = [targetOcc, twoHanded ? otherOcc : undefined].filter(Boolean).length;
  return stows + 1;
}

/** Resolve how many units an interaction needs against the budget/Action. */
function costFor(unitsNeeded: number, ctx: HandContext): { cost: SwapCost; disabledReason: string | null } {
  if (planInteractionSpend(ctx.budget, unitsNeeded)) return { cost: "free", disabledReason: null };
  if (ctx.actionsRemaining > 0) return { cost: "action", disabledReason: null };
  return { cost: "blocked", disabledReason: NO_BUDGET_REASON };
}

/** Deduped candidate options for one hand, plus a Stow when it's occupied. */
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
    // Stowing a held weapon is one object interaction — budget/Action-gated
    // like any other, not unconditionally free (2024 RAW has no free stow).
    const { cost, disabledReason } = costFor(1, ctx);
    options.push({ item: null, label: "Stow — empty hand", count: 0, cost, disabledReason });
  }
  return options;
}

/** Whether a hand's Change/Equip toggle should be reachable at all — blocked
 *  only when NO interaction (not even the cheapest 1-unit one) is possible.
 *  Same for both hands, so it takes no `slot` — the gate is turn-wide, not
 *  hand-specific. */
export function handButtonDisabledReason(ctx: HandContext): string | null {
  return canInteract(ctx.budget, ctx.actionsRemaining) ? null : NO_BUDGET_REASON;
}

/** Subtitle for the Action-sheet's "Change weapons" card — states the real cost. */
export function changeWeaponsSubtitle(
  loadoutLabel: string,
  budgetRemaining: number,
  actionAvailable: boolean,
): string {
  if (budgetRemaining > 0) return `${loadoutLabel} · free interaction available`;
  if (actionAvailable) return `${loadoutLabel} · a swap now costs your Action`;
  return `${loadoutLabel} · no free interaction or Action left`;
}
