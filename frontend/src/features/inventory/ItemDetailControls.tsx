import ActivateControl from "@/features/inventory/ActivateControl";
import InventoryRowControls from "@/features/inventory/InventoryRowControls";
import type { InventoryItem, InventoryOperation } from "@/types/character";
import type { WeaponBondProps } from "@/lib/weaponBond";

interface ItemDetailControlsProps {
  item: InventoryItem;
  pending: boolean;
  atCap: boolean;
  onSubmit: (operations: InventoryOperation[]) => Promise<void>;
  bond: WeaponBondProps;
}

export default function ItemDetailControls({ item, pending, atCap, onSubmit, bond }: ItemDetailControlsProps) {
  const hasControls =
    item.equippable ||
    item.category === "consumable" ||
    item.requiresAttunement ||
    (item.category === "weapon" && bond.eligible) ||
    Boolean(item.activated);
  if (!hasControls) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <InventoryRowControls item={item} pending={pending} atCap={atCap} onSubmit={onSubmit} bond={bond} />
      {item.activated && <ActivateControl item={item} pending={pending} onSubmit={onSubmit} />}
    </div>
  );
}
