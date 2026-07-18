import { useState } from "react";

import type { InventoryItem, InventoryOperation } from "@/types/character";

interface ItemDetailFooterProps {
  item: InventoryItem;
  pending: boolean;
  onSubmit: (operations: InventoryOperation[]) => Promise<void>;
  onClose: () => void;
  onEdit: () => void;
  onSell: () => void;
}

// The Sell / Edit / Drop footer of the item detail sheet (#1029); Drop is a
// two-step confirm. submitOperations never rejects (errors surface in the list
// behind the sheet), so confirm always closes the sheet — same as edit/sell.
export default function ItemDetailFooter({
  item,
  pending,
  onSubmit,
  onClose,
  onEdit,
  onSell,
}: ItemDetailFooterProps) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div className="flex items-center justify-between gap-3 border-t border-parchment-200 pt-3 text-sm">
        <span className="text-parchment-700">Drop {item.name}?</span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={pending}
            onClick={() => onSubmit([{ type: "remove", inventoryItemId: item.id }]).then(onClose)}
            className="font-semibold text-garnet-700 hover:underline disabled:opacity-40"
          >
            Confirm
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => setConfirming(false)}
            className="font-semibold text-parchment-600 hover:underline disabled:opacity-40"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 border-t border-parchment-200 pt-3 text-sm font-semibold">
      <button type="button" onClick={onSell} className="text-garnet-700 hover:underline">
        Sell
      </button>
      <button type="button" onClick={onEdit} className="text-parchment-700 hover:underline">
        Edit
      </button>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="ml-auto text-garnet-700 hover:underline"
      >
        Drop
      </button>
    </div>
  );
}
