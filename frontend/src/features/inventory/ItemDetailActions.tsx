import ItemDetailControls from "@/features/inventory/ItemDetailControls";
import ItemDetailFooter from "@/features/inventory/ItemDetailFooter";
import ItemProse from "@/features/inventory/ItemProse";
import { hasItemProse } from "@/lib/itemDetails";
import type { InventoryItem, InventoryOperation } from "@/types/character";
import type { WeaponBondProps } from "@/lib/weaponBond";

interface ItemDetailActionsProps {
  item: InventoryItem;
  pending: boolean;
  atCap: boolean;
  onSubmit: (operations: InventoryOperation[]) => Promise<void>;
  bond: WeaponBondProps;
  onClose: () => void;
  onEdit: () => void;
  onSell: () => void;
}

export default function ItemDetailActions({
  item,
  pending,
  atCap,
  onSubmit,
  bond,
  onClose,
  onEdit,
  onSell,
}: ItemDetailActionsProps) {
  return (
    <div className="flex flex-col gap-4">
      {hasItemProse(item) && <ItemProse item={item} />}
      <ItemDetailControls item={item} pending={pending} atCap={atCap} onSubmit={onSubmit} bond={bond} />
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
