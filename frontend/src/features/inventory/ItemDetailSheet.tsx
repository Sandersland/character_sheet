import { useState } from "react";

import BottomSheet from "@/components/ui/BottomSheet";
import InventoryEditForm from "@/features/inventory/InventoryEditForm";
import ItemDetailActions from "@/features/inventory/ItemDetailActions";
import SellPanel from "@/features/inventory/SellPanel";
import { buildSellOperations, type SellLine } from "@/lib/bulkSell";
import { itemDetailParts } from "@/lib/itemDetails";
import type { Currency, InventoryItem, InventoryOperation } from "@/types/character";

interface ItemDetailSheetProps {
  item: InventoryItem;
  pending: boolean;
  atCap: boolean;
  onSubmit: (operations: InventoryOperation[]) => Promise<void>;
  onClose: () => void;
}

// The mobile row-tap surface (#1029): the per-item actions that live inline on
// desktop, collected into one bottom sheet with edit + sell sub-views. Every
// action funnels through the same onSubmit transaction.
export default function ItemDetailSheet({ item, pending, atCap, onSubmit, onClose }: ItemDetailSheetProps) {
  const [mode, setMode] = useState<"view" | "edit" | "sell">("view");
  const details = itemDetailParts(item).join(" · ");

  async function sell(lines: SellLine[], prices: Record<string, Currency>) {
    await onSubmit(buildSellOperations(lines, { mode: "perItem", prices }));
    onClose();
  }

  return (
    <BottomSheet title={item.name} subtitle={details || undefined} onClose={onClose}>
      {mode === "edit" ? (
        <InventoryEditForm
          item={item}
          pending={pending}
          onCancel={() => setMode("view")}
          onSubmit={async (ops) => {
            await onSubmit(ops);
            setMode("view");
          }}
        />
      ) : mode === "sell" ? (
        <SellPanel items={[item]} pending={pending} onConfirm={sell} onCancel={() => setMode("view")} />
      ) : (
        <ItemDetailActions
          item={item}
          pending={pending}
          atCap={atCap}
          onSubmit={onSubmit}
          onClose={onClose}
          onEdit={() => setMode("edit")}
          onSell={() => setMode("sell")}
        />
      )}
    </BottomSheet>
  );
}
