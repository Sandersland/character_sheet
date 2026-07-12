/**
 * LoadoutSwapRow — the "⚔ Equipped · <loadout> · Change" row at the turn slot
 * root (#733), shown above the Action/Bonus/Reaction cards during the active
 * turn. "Change" opens a bottom-sheet picker of bag weapons/shields per hand.
 *
 * Placement fix (#733): the swap lives here at the slot root — PRE-attack — not
 * inside the already-spent Attack picker, so the Action cost is coherent.
 * Replacing an occupied hand spends the Action (blocked at 0); filling an empty
 * hand is free. A committed swap surfaces an explicit Refund (Decision #2).
 */

import { useState } from "react";

import BottomSheet from "@/components/ui/BottomSheet";
import { bagItemsForSlot, equippedLoadoutLabel, equipSlotLabel, isOffHandLocked, itemsInSlot } from "@/lib/paperDoll";
import { useLoadoutSwap } from "@/features/session/useLoadoutSwap";
import type { TurnStateView } from "@/features/session/useTurnState";
import type { Character, EquipSlot, InventoryItem } from "@/types/character";

interface LoadoutSwapRowProps {
  character: Character;
  turnState: TurnStateView;
  onUpdate: (c: Character) => void;
}

const HANDS: EquipSlot[] = ["MAIN_HAND", "OFF_HAND"];

export default function LoadoutSwapRow({ character, turnState, onUpdate }: LoadoutSwapRowProps) {
  const [open, setOpen] = useState(false);
  const { busy, error, lastSwap, swap, refund } = useLoadoutSwap(character, turnState, onUpdate);

  const label = equippedLoadoutLabel(character.inventory);
  const offHandLocked = isOffHandLocked(character.inventory);

  async function handlePick(item: InventoryItem, slot: EquipSlot) {
    await swap(item, slot);
    setOpen(false);
  }

  return (
    <div className="flex flex-col gap-1 rounded-control border border-parchment-200 bg-parchment-50 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs text-parchment-700">
          <span aria-hidden="true">⚔ </span>Equipped · <span className="font-semibold">{label}</span>
        </span>
        <div className="flex shrink-0 items-center gap-2">
          {lastSwap && (
            <button
              type="button"
              onClick={refund}
              disabled={busy}
              className="rounded-control border border-arcane-300 bg-arcane-50 px-2.5 py-1 text-xs font-semibold text-arcane-700 transition-colors hover:bg-arcane-100 disabled:opacity-50"
            >
              <span aria-hidden="true">↩ </span>Refund
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-control px-2.5 py-1 text-xs font-semibold text-garnet-700 transition-colors hover:bg-garnet-50"
          >
            Change
          </button>
        </div>
      </div>
      {error && <p className="text-xs text-garnet-700">{error}</p>}

      {open && (
        <BottomSheet
          title="Change loadout"
          subtitle="Swapping an equipped hand costs your Action — drawing into a free hand is free."
          onClose={() => setOpen(false)}
        >
          <div className="flex flex-col divide-y divide-parchment-200">
            {HANDS.map((slot) => {
              if (slot === "OFF_HAND" && offHandLocked) return null;
              const current = itemsInSlot(character.inventory, slot)[0];
              const candidates = bagItemsForSlot(character.inventory, slot);
              return (
                <div key={slot} className="py-2">
                  <p className="pb-1 text-xs font-semibold uppercase tracking-wide text-parchment-600">
                    {equipSlotLabel(slot)}
                    {current ? ` · ${current.name}` : " · empty"}
                  </p>
                  {candidates.length === 0 ? (
                    <p className="text-xs text-parchment-500">Nothing in your bag fits here.</p>
                  ) : (
                    <ul className="flex flex-col gap-1">
                      {candidates.map((item) => (
                        <li key={item.id} className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm text-parchment-800">{item.name}</span>
                          <button
                            type="button"
                            onClick={() => handlePick(item, slot)}
                            disabled={busy}
                            className="shrink-0 rounded-control border border-garnet-300 bg-garnet-700 px-3 py-1 text-xs font-semibold text-parchment-50 transition-colors hover:bg-garnet-800 disabled:opacity-50"
                          >
                            {current ? "Swap in" : "Equip"}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </BottomSheet>
      )}
    </div>
  );
}
