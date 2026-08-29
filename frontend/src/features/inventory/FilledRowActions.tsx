import { useState } from "react";

import type { InventoryItem, ItemRarityOption } from "@/types/character";
import { MoreHorizontal } from "@/components/ui/icons";
import Popover from "@/components/ui/Popover";
import SlotPickerPanel from "@/features/inventory/SlotPickerPanel";
import { type FilledLoadoutRow } from "@/lib/loadout";

interface FilledRowActionsProps {
  row: FilledLoadoutRow;
  candidates: InventoryItem[];
  pending: boolean;
  rarities: ItemRarityOption[];
  onUnequip: (item: InventoryItem) => void;
  onReplace: (incoming: InventoryItem, outgoing: InventoryItem) => void;
}

// Its own module (used by LoadoutFilledRow) rather than inlined there, so
// LoadoutList's own row-map callback stays under the fallow complexity gate.
export default function FilledRowActions({
  row,
  candidates,
  pending,
  rarities,
  onUnequip,
  onReplace,
}: FilledRowActionsProps) {
  const [swapping, setSwapping] = useState(false);
  return (
    <Popover
      align="right"
      label={`${row.label}: ${row.item.name}`}
      onClose={() => setSwapping(false)}
      trigger={
        <span className="flex size-7 items-center justify-center rounded-control text-parchment-500 hover:bg-parchment-100 hover:text-parchment-800">
          <MoreHorizontal aria-hidden="true" className="size-4" />
        </span>
      }
    >
      {swapping ? (
        <div className="w-56 p-3">
          <SlotPickerPanel
            slotLabel={`Swap ${row.label}`}
            candidates={candidates}
            pending={pending}
            action="replace"
            rarities={rarities}
            onPick={(incoming) => {
              setSwapping(false);
              onReplace(incoming, row.item);
            }}
            onClose={() => setSwapping(false)}
          />
        </div>
      ) : (
        <div className="flex w-40 flex-col gap-2 p-3 text-xs">
          <button
            type="button"
            disabled={pending}
            onClick={() => onUnequip(row.item)}
            className="text-left font-semibold text-garnet-700 hover:underline disabled:opacity-50"
          >
            Unequip
          </button>
          {candidates.length > 0 && (
            <button
              type="button"
              disabled={pending}
              onClick={() => setSwapping(true)}
              className="text-left font-semibold text-arcane-700 hover:underline disabled:opacity-50"
            >
              Swap
            </button>
          )}
        </div>
      )}
    </Popover>
  );
}
