import type { InventoryItem, InventoryOperation } from "@/types/character";
import AttuneToggle from "@/features/inventory/AttuneToggle";
import EquipToggle from "@/features/inventory/EquipToggle";
import UseConsumableButton from "@/features/inventory/UseConsumableButton";
import WeaponBondToggle from "@/features/inventory/WeaponBondToggle";
import type { WeaponBondProps } from "@/lib/weaponBond";

interface InventoryRowControlsProps {
  item: InventoryItem;
  pending: boolean;
  atCap: boolean;
  onSubmit: (operations: InventoryOperation[]) => Promise<void>;
  // Bundled (#1854) — see WeaponBondProps' own comment for why bond/unbond's
  // four related props travel as one object rather than four discrete props.
  bond: WeaponBondProps;
}

// The item-shape-gated action pills (use / equip / attune / bond), shared
// between InventoryRow (desktop) and ItemDetailControls (mobile detail
// sheet) — kept as its own component, not inlined into either caller, so
// neither one's cyclomatic/cognitive score crosses the fallow complexity
// gate (.fallowrc.jsonc).
export default function InventoryRowControls({ item, pending, atCap, onSubmit, bond }: InventoryRowControlsProps) {
  return (
    <>
      {item.category === "consumable" && (
        <UseConsumableButton item={item} pending={pending} onSubmit={onSubmit} />
      )}
      {item.equippable && <EquipToggle item={item} pending={pending} onSubmit={onSubmit} />}
      {item.requiresAttunement && (
        <AttuneToggle item={item} pending={pending} atCap={atCap} onSubmit={onSubmit} />
      )}
      {item.category === "weapon" && bond.eligible && (
        <WeaponBondToggle item={item} pending={bond.pending} atCap={bond.atCap} onSubmit={bond.onSubmit} />
      )}
    </>
  );
}
