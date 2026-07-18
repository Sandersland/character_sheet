import ItemDetailControls from "@/features/inventory/ItemDetailControls";
import ItemDetailFooter from "@/features/inventory/ItemDetailFooter";
import ItemProse from "@/features/inventory/ItemProse";
import { hasItemProse } from "@/lib/itemDetails";
import type { InventoryItem, InventoryOperation } from "@/types/character";

interface ItemDetailActionsProps {
  item: InventoryItem;
  pending: boolean;
  atCap: boolean;
  onSubmit: (operations: InventoryOperation[]) => Promise<void>;
  onClose: () => void;
  onEdit: () => void;
  onSell: () => void;
}

// The view-mode body of the item detail sheet (#1029): prose, the reused per-item
// control pills, and the Sell / Edit / Drop footer.
export default function ItemDetailActions({
  item,
  pending,
  atCap,
  onSubmit,
  onClose,
  onEdit,
  onSell,
}: ItemDetailActionsProps) {
  return (
    <div className="flex flex-col gap-4">
      {hasItemProse(item) && <ItemProse item={item} />}
      <ItemDetailControls item={item} pending={pending} atCap={atCap} onSubmit={onSubmit} />
      <ItemDetailFooter
        item={item}
        pending={pending}
        onSubmit={onSubmit}
        onClose={onClose}
        onEdit={onEdit}
        onSell={onSell}
      />
    </div>
  );
}
