import type { EquipSlot, InventoryItem } from "@/types/character";
import { EQUIP_SLOT_ICONS } from "@/components/ui/icons";
import Popover from "@/components/ui/Popover";
import SlotPickerPanel from "@/features/inventory/SlotPickerPanel";
import { TILE } from "@/features/inventory/equipSlotTile";

interface EmptyEquipSlotProps {
  slot: EquipSlot;
  label: string;
  // Bag items that fit this slot.
  candidates: InventoryItem[];
  pending: boolean;
  onEquip: (item: InventoryItem) => void;
}

// An empty slot opens an anchored Popover holding a SlotPickerPanel of
// compatible bag items.
export default function EmptyEquipSlot({ slot, label, candidates, pending, onEquip }: EmptyEquipSlotProps) {
  const Icon = EQUIP_SLOT_ICONS[slot];

  return (
    <Popover
      label={`${label} slot, empty — equip an item`}
      className="w-full"
      triggerClassName="w-full rounded-card"
      trigger={
        <span
          className={`${TILE} border-dashed border-parchment-300 bg-parchment-50/50 text-parchment-400 hover:border-garnet-400 hover:text-garnet-600`}
        >
          <Icon aria-hidden="true" className="size-6 opacity-60" />
          <span className="text-[0.625rem] font-medium">{label}</span>
        </span>
      }
    >
      {(close) => (
        <div className="w-56 p-3">
          <SlotPickerPanel
            slotLabel={`Equip ${label}`}
            candidates={candidates}
            pending={pending}
            action="equip"
            onPick={(picked) => {
              close();
              onEquip(picked);
            }}
            onClose={close}
          />
        </div>
      )}
    </Popover>
  );
}
