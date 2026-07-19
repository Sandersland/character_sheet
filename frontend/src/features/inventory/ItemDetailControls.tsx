import ActivateControl from "@/features/inventory/ActivateControl";
import AttuneToggle from "@/features/inventory/AttuneToggle";
import EquipToggle from "@/features/inventory/EquipToggle";
import UseConsumableButton from "@/features/inventory/UseConsumableButton";
import { isEquippable } from "@/lib/items";
import type { InventoryItem, InventoryOperation } from "@/types/character";

interface ItemDetailControlsProps {
  item: InventoryItem;
  pending: boolean;
  atCap: boolean;
  onSubmit: (operations: InventoryOperation[]) => Promise<void>;
}

// The reused per-item action pills inside the detail sheet (#1029): equip,
// use, attune, activate — each gated by the item's shape, same as the row.
export default function ItemDetailControls({ item, pending, atCap, onSubmit }: ItemDetailControlsProps) {
  const hasControls =
    isEquippable(item.category) ||
    item.category === "consumable" ||
    item.requiresAttunement ||
    Boolean(item.activated);
  if (!hasControls) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {isEquippable(item.category) && <EquipToggle item={item} pending={pending} onSubmit={onSubmit} />}
      {item.category === "consumable" && (
        <UseConsumableButton item={item} pending={pending} onSubmit={onSubmit} />
      )}
      {item.requiresAttunement && (
        <AttuneToggle item={item} pending={pending} atCap={atCap} onSubmit={onSubmit} />
      )}
      {item.activated && <ActivateControl item={item} pending={pending} onSubmit={onSubmit} />}
    </div>
  );
}
