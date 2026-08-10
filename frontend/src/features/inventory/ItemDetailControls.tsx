import ActivateControl from "@/features/inventory/ActivateControl";
import InventoryRowControls from "@/features/inventory/InventoryRowControls";
import type { InventoryItem, InventoryOperation } from "@/types/character";
import type { WeaponBondProps } from "@/lib/weaponBond";

interface ItemDetailControlsProps {
  item: InventoryItem;
  pending: boolean;
  atCap: boolean;
  onSubmit: (operations: InventoryOperation[]) => Promise<void>;
  // Bundled (#1854) — see WeaponBondProps' own comment.
  bond: WeaponBondProps;
}

// The reused per-item action pills inside the detail sheet (#1029): equip,
// use, attune, bond (InventoryRowControls — the row's own pill cluster) plus
// activate, which the row renders outside its pill cluster instead.
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
