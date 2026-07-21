/**
 * useLoadoutSwap — the mid-turn weapon-swap economy for the turn UI (#733,
 * interaction-budget model #1165).
 *
 * Each equip/unequip is an interaction unit (loadoutPicker.planInteractionSpend):
 * paid from the turn's free interaction + attack-earned credits first, then the
 * Action, else blocked. The swap persists through the audited `setEquipped`/
 * `equip` inventory transaction; a `refund` affordance (Decision #2) reverses
 * the exact inverse batch and returns whatever was spent (budget units or the
 * Action).
 *
 * The local turn undo (#730) deliberately can't reverse a server-committed
 * loadout swap (see useTurnState's `undo` doc) — this hook is that explicit
 * refund surface.
 */

import { useState } from "react";

import { applyInventoryTransactions } from "@/api/client";
import { equippedLoadoutLabel, itemsInSlot } from "@/lib/paperDoll";
import { NO_BUDGET_REASON, planInteractionSpend, type InteractionSpend } from "@/lib/loadoutPicker";
import type { TurnState, TurnStateActions } from "@/features/session/useTurnState";
import type { Character, EquipSlot, InventoryItem, InventoryOperation } from "@/types/character";

/** A committed swap this turn, retained so the refund can reverse it exactly. */
interface CommittedSwap {
  inverseOps: InventoryOperation[];
  /** What paid for the swap — budget units, or null when the Action paid instead. */
  spend: InteractionSpend | null;
  /** The loadout we swapped away from — the refund returns to it. */
  previousLabel: string;
}

/**
 * The forward + inverse inventory batches for equipping `incoming` into `slot`,
 * given the current MAIN/OFF hand occupants. Stows the target slot's occupant
 * plus — for a two-handed incoming weapon — the OTHER hand's occupant too (a
 * two-handed weapon needs a free off-hand), then draws the incoming; the inverse
 * re-equips each stowed item into its original slot. `interactionsNeeded` is one
 * unit per stow plus the draw itself (mirrors loadoutPicker's interactionsForEquip).
 * Mirrors LoadoutList's replace batching.
 */
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

export function useLoadoutSwap(
  character: Character,
  turnState: TurnState & TurnStateActions,
  onUpdate: (c: Character) => void,
) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSwap, setLastSwap] = useState<CommittedSwap | null>(null);

  // Plan how `unitsNeeded` interactions get paid: from the budget when it
  // covers them, else the Action, else null (nothing can pay).
  function planPayment(unitsNeeded: number): InteractionSpend | null | "action" {
    const spend = planInteractionSpend(
      { attackEquipCredits: turnState.attackEquipCredits, freeInteractionUsed: turnState.freeInteractionUsed },
      unitsNeeded,
    );
    if (spend) return spend;
    return turnState.actionsRemaining > 0 ? "action" : null;
  }

  async function commitSwap(ops: InventoryOperation[], inverseOps: InventoryOperation[], payment: InteractionSpend | "action") {
    const previousLabel = equippedLoadoutLabel(character.inventory);
    setBusy(true);
    setError(null);
    try {
      const updated = await applyInventoryTransactions(character.id, ops);
      if (payment === "action") turnState.consumeAction();
      else turnState.spendInteractionBudget(payment);
      onUpdate(updated);
      setLastSwap({ inverseOps, spend: payment === "action" ? null : payment, previousLabel });
    } catch (e) {
      console.error("loadout swap failed", e);
      setError("Swap failed — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function swap(incoming: InventoryItem, slot: EquipSlot) {
    if (busy) return;
    const mainOcc = itemsInSlot(character.inventory, "MAIN_HAND")[0];
    const offOcc = itemsInSlot(character.inventory, "OFF_HAND")[0];
    const targetOcc = slot === "MAIN_HAND" ? mainOcc : offOcc;
    if (targetOcc?.id === incoming.id) return; // no-op: already equipped in this slot

    const { ops, inverseOps, interactionsNeeded } = buildSwapOps(incoming, mainOcc, offOcc, slot);
    const payment = planPayment(interactionsNeeded);
    if (payment === null) {
      setError(NO_BUDGET_REASON);
      return;
    }
    await commitSwap(ops, inverseOps, payment);
  }

  async function stow(slot: EquipSlot) {
    if (busy) return;
    const occupant = itemsInSlot(character.inventory, slot)[0];
    if (!occupant) return;
    // Stowing a held weapon is one object interaction (2024 RAW has no free
    // stow) — budget/Action-gated like any other, not unconditionally free.
    const payment = planPayment(1);
    if (payment === null) {
      setError(NO_BUDGET_REASON);
      return;
    }
    const ops: InventoryOperation[] = [{ type: "setEquipped", inventoryItemId: occupant.id, equipped: false }];
    const inverseOps: InventoryOperation[] = [{ type: "equip", inventoryItemId: occupant.id, slot }];
    await commitSwap(ops, inverseOps, payment);
  }

  // Clear the committed-swap affordance — called at end of turn so the Refund
  // is bounded to the turn of the swap (no cross-turn action-economy leak).
  function reset() {
    setLastSwap(null);
    setError(null);
  }

  async function refund() {
    if (busy || !lastSwap) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await applyInventoryTransactions(character.id, lastSwap.inverseOps);
      if (lastSwap.spend) turnState.refundInteractionBudget(lastSwap.spend);
      else turnState.refundAction();
      onUpdate(updated);
      setLastSwap(null);
    } catch (e) {
      console.error("loadout refund failed", e);
      setError("Refund failed — try again.");
    } finally {
      setBusy(false);
    }
  }

  return { busy, error, lastSwap, swap, stow, refund, reset };
}
