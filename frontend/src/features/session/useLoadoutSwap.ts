/**
 * useLoadoutSwap — the mid-turn weapon-swap economy for the turn UI (#733).
 *
 * Swapping into an OCCUPIED hand (stow one, draw another) costs an Action per
 * Decision #5 — blocked at 0 actions, no-op when the target is already equipped
 * there. Filling an EMPTY hand is a free object interaction (drawing a weapon),
 * so it costs nothing. The swap persists through the audited `setEquipped`/
 * `equip` inventory transaction; a `refund` affordance (Decision #2) reverses
 * the exact inverse batch and returns the spent Action.
 *
 * The local turn undo (#730) deliberately can't reverse a server-committed
 * loadout swap (see useTurnState's `undo` doc) — this hook is that explicit
 * refund surface.
 */

import { useState } from "react";

import { applyInventoryTransactions } from "@/api/client";
import { equippedLoadoutLabel, itemsInSlot } from "@/lib/paperDoll";
import type { TurnState, TurnStateActions } from "@/features/session/useTurnState";
import type { Character, EquipSlot, InventoryItem, InventoryOperation } from "@/types/character";

/** A committed swap this turn, retained so the refund can reverse it exactly. */
interface CommittedSwap {
  inverseOps: InventoryOperation[];
  /** True when the swap replaced an occupied hand (an Action was spent). */
  spentAction: boolean;
  /** The loadout we swapped away from — the refund returns to it. */
  previousLabel: string;
}

/**
 * The forward + inverse inventory batches for equipping `incoming` into `slot`,
 * given the current MAIN/OFF hand occupants. Stows the target slot's occupant
 * plus — for a two-handed incoming weapon — the OTHER hand's occupant too (a
 * two-handed weapon needs a free off-hand), then draws the incoming; the inverse
 * re-equips each stowed item into its original slot. `costsAction` is true when
 * anything was stowed (a real swap); filling empty hands is a free draw.
 * Mirrors LoadoutList's replace batching.
 */
function buildSwapOps(
  incoming: InventoryItem,
  mainOcc: InventoryItem | undefined,
  offOcc: InventoryItem | undefined,
  slot: EquipSlot,
): { ops: InventoryOperation[]; inverseOps: InventoryOperation[]; costsAction: boolean } {
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
  return { ops, inverseOps, costsAction: toStow.length > 0 };
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

  async function swap(incoming: InventoryItem, slot: EquipSlot) {
    if (busy) return;
    const mainOcc = itemsInSlot(character.inventory, "MAIN_HAND")[0];
    const offOcc = itemsInSlot(character.inventory, "OFF_HAND")[0];
    const targetOcc = slot === "MAIN_HAND" ? mainOcc : offOcc;
    if (targetOcc?.id === incoming.id) return; // no-op: already equipped in this slot

    const { ops, inverseOps, costsAction } = buildSwapOps(incoming, mainOcc, offOcc, slot);
    // Replacing an occupied hand is the Action-costed swap; filling an empty
    // hand is a free draw.
    if (costsAction && turnState.actionsRemaining <= 0) {
      setError("No actions left — a loadout swap costs your Action.");
      return;
    }

    const previousLabel = equippedLoadoutLabel(character.inventory);
    setBusy(true);
    setError(null);
    try {
      const updated = await applyInventoryTransactions(character.id, ops);
      if (costsAction) turnState.consumeAction();
      onUpdate(updated);
      setLastSwap({ inverseOps, spentAction: costsAction, previousLabel });
    } catch (e) {
      console.error("loadout swap failed", e);
      setError("Swap failed — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function stow(slot: EquipSlot) {
    if (busy) return;
    const occupant = itemsInSlot(character.inventory, slot)[0];
    if (!occupant) return;
    // Stowing a held weapon is a free object interaction — no Action spent.
    const ops: InventoryOperation[] = [{ type: "setEquipped", inventoryItemId: occupant.id, equipped: false }];
    const inverseOps: InventoryOperation[] = [{ type: "equip", inventoryItemId: occupant.id, slot }];
    const previousLabel = equippedLoadoutLabel(character.inventory);
    setBusy(true);
    setError(null);
    try {
      const updated = await applyInventoryTransactions(character.id, ops);
      onUpdate(updated);
      setLastSwap({ inverseOps, spentAction: false, previousLabel });
    } catch (e) {
      console.error("loadout stow failed", e);
      setError("Stow failed — try again.");
    } finally {
      setBusy(false);
    }
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
      if (lastSwap.spentAction) turnState.refundAction();
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
