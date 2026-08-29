/**
 * The turn's local undo (#730) can't reverse a server-committed loadout swap (see useTurnState's `undo` doc) — `refund` is the explicit surface for that.
 */

import { useState } from "react";

import { applyInventoryTransactions } from "@/api/client";
import { useCharacterMutation } from "@/hooks/useCharacterMutation";
import { equippedLoadoutLabel, itemsInSlot } from "@/lib/paperDoll";
import { NO_BUDGET_REASON, planInteractionSpend, type InteractionSpend } from "@/lib/loadoutPicker";
import type { TurnState, TurnStateActions } from "@/features/session/useTurnState";
import type { Character, EquipSlot, InventoryItem, InventoryOperation } from "@/types/character";

interface CommittedSwap {
  inverseOps: InventoryOperation[];
  /** Budget units, or null when the Action paid instead. */
  spend: InteractionSpend | null;
  previousLabel: string;
}

/** Mirrors loadoutPicker's interactionsForEquip and LoadoutList's replace batching — keep in sync. */
function buildSwapOps(
  incoming: InventoryItem,
  mainOcc: InventoryItem | undefined,
  offOcc: InventoryItem | undefined,
  slot: EquipSlot,
): { ops: InventoryOperation[]; inverseOps: InventoryOperation[]; interactionsNeeded: number } {
  const targetOcc = slot === "MAIN_HAND" ? mainOcc : offOcc;
  const otherOcc = slot === "MAIN_HAND" ? offOcc : mainOcc;
  const twoHanded = Boolean(incoming.weapon?.twoHanded);
  const toStow = [targetOcc, twoHanded ? otherOcc : undefined].filter(
    (x): x is InventoryItem => Boolean(x),
  );

  const stow = (i: InventoryItem) =>
    ({ type: "setEquipped", inventoryItemId: i.id, equipped: false }) as const;
  const ops: InventoryOperation[] = [
    ...toStow.map(stow),
    { type: "equip", inventoryItemId: incoming.id, slot },
  ];
  const inverseOps: InventoryOperation[] = [
    stow(incoming),
    ...toStow.map((i) => ({ type: "equip", inventoryItemId: i.id, slot: i.equippedSlot! }) as const),
  ];
  return { ops, inverseOps, interactionsNeeded: toStow.length + 1 };
}

export type LoadoutSwapControls = ReturnType<typeof useLoadoutSwap>;

export function useLoadoutSwap(character: Character, turnState: TurnState & TurnStateActions) {
  const [lastSwap, setLastSwap] = useState<CommittedSwap | null>(null);
  // budgetError needs its own slot — a mutation's error only clears on its NEXT mutate() call, and this guard never calls mutate().
  const [budgetError, setBudgetError] = useState<string | null>(null);

  // Two separate mutations (distinct fallback copy per action) sharing one `character-${id}` scope, so a swap and its refund never race.
  const swapMutation = useCharacterMutation({
    characterId: character.id,
    mutationFn: (ops: InventoryOperation[]) => applyInventoryTransactions(character.id, ops),
    toCharacter: (c) => c,
    fallbackMessage: "Swap failed — try again.",
  });
  const refundMutation = useCharacterMutation({
    characterId: character.id,
    mutationFn: (ops: InventoryOperation[]) => applyInventoryTransactions(character.id, ops),
    toCharacter: (c) => c,
    fallbackMessage: "Refund failed — try again.",
  });
  const busy = swapMutation.isPending || refundMutation.isPending;
  const error = budgetError ?? swapMutation.error ?? refundMutation.error;

  function planPayment(unitsNeeded: number): InteractionSpend | null | "action" {
    const spend = planInteractionSpend(
      { attackEquipCredits: turnState.attackEquipCredits, freeInteractionUsed: turnState.freeInteractionUsed },
      unitsNeeded,
    );
    if (spend) return spend;
    return turnState.actionsRemaining > 0 ? "action" : null;
  }

  async function commitSwap(ops: InventoryOperation[], inverseOps: InventoryOperation[], payment: InteractionSpend | "action") {
    const previousLabel = equippedLoadoutLabel(character.inventory, character.offHandLocked);
    setBudgetError(null);
    try {
      await swapMutation.mutateAsync(ops);
      if (payment === "action") turnState.consumeAction();
      else turnState.spendInteractionBudget(payment);
      setLastSwap({ inverseOps, spend: payment === "action" ? null : payment, previousLabel });
    } catch (e) {
      console.error("loadout swap failed", e);
    }
  }

  async function swap(incoming: InventoryItem, slot: EquipSlot) {
    if (busy) return;
    const mainOcc = itemsInSlot(character.inventory, "MAIN_HAND")[0];
    const offOcc = itemsInSlot(character.inventory, "OFF_HAND")[0];
    const targetOcc = slot === "MAIN_HAND" ? mainOcc : offOcc;
    if (targetOcc?.id === incoming.id) return;

    const { ops, inverseOps, interactionsNeeded } = buildSwapOps(incoming, mainOcc, offOcc, slot);
    const payment = planPayment(interactionsNeeded);
    if (payment === null) {
      setBudgetError(NO_BUDGET_REASON);
      return;
    }
    await commitSwap(ops, inverseOps, payment);
  }

  async function stow(slot: EquipSlot) {
    if (busy) return;
    const occupant = itemsInSlot(character.inventory, slot)[0];
    if (!occupant) return;
    // Stowing a held weapon is one object interaction (2024 RAW has no free stow) — budget/Action-gated like any other, not unconditionally free.
    const payment = planPayment(1);
    if (payment === null) {
      setBudgetError(NO_BUDGET_REASON);
      return;
    }
    const ops: InventoryOperation[] = [{ type: "setEquipped", inventoryItemId: occupant.id, equipped: false }];
    const inverseOps: InventoryOperation[] = [{ type: "equip", inventoryItemId: occupant.id, slot }];
    await commitSwap(ops, inverseOps, payment);
  }

  // reset() must clear all three error sources together — error folds budgetError over both mutations, so clearing only one leaves a stale message.
  function reset() {
    setLastSwap(null);
    setBudgetError(null);
    swapMutation.reset();
    refundMutation.reset();
  }

  async function refund() {
    if (busy || !lastSwap) return;
    try {
      await refundMutation.mutateAsync(lastSwap.inverseOps);
      if (lastSwap.spend) turnState.refundInteractionBudget(lastSwap.spend);
      else turnState.refundAction();
      setLastSwap(null);
    } catch (e) {
      console.error("loadout refund failed", e);
    }
  }

  return { busy, error, lastSwap, swap, stow, refund, reset };
}
