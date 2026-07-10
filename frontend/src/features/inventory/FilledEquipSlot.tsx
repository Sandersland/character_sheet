import { useState } from "react";

import type { EquipSlot, InventoryItem } from "@/types/character";
import type { VersatileGrip } from "@/lib/paperDoll";
import { EQUIP_SLOT_ICONS } from "@/components/ui/icons";
import Popover from "@/components/ui/Popover";
import FilledEquipSlotTrigger from "@/features/inventory/FilledEquipSlotTrigger";
import FilledEquipSlotDetails from "@/features/inventory/FilledEquipSlotDetails";

interface FilledEquipSlotProps {
  slot: EquipSlot;
  label: string;
  item: InventoryItem;
  // The equipped item isn't covered by the character's proficiencies — warn.
  notProficient?: boolean;
  // Versatile weapon's current grip (main hand only); flips as the off-hand fills.
  grip?: VersatileGrip | null;
  // DOM id applied to this tile's trigger so a locked off-hand can focus it.
  triggerId?: string;
  // Bag items that fit this slot (excludes the current occupant).
  candidates: InventoryItem[];
  pending: boolean;
  onUnequip: (item: InventoryItem) => void;
  onReplace: (incoming: InventoryItem, outgoing: InventoryItem) => void;
}

// A filled slot opens an anchored Popover: FilledEquipSlotTrigger renders the
// tile face, FilledEquipSlotDetails the read-only summary + unequip/swap panel.
export default function FilledEquipSlot({
  slot,
  label,
  item,
  notProficient,
  grip,
  triggerId,
  candidates,
  pending,
  onUnequip,
  onReplace,
}: FilledEquipSlotProps) {
  const [swapping, setSwapping] = useState(false);
  const Icon = EQUIP_SLOT_ICONS[slot];

  return (
    <Popover
      label={`${label}: ${item.name}${notProficient ? " (not proficient)" : ""}`}
      className="w-full"
      triggerClassName="w-full rounded-card"
      id={triggerId}
      // Reset swap mode on dismiss so the next open lands on the summary, not the picker.
      onClose={() => setSwapping(false)}
      trigger={<FilledEquipSlotTrigger Icon={Icon} item={item} notProficient={notProficient} grip={grip} />}
    >
      <FilledEquipSlotDetails
        label={label}
        item={item}
        notProficient={notProficient}
        grip={grip}
        candidates={candidates}
        pending={pending}
        swapping={swapping}
        onStartSwap={() => setSwapping(true)}
        onCancelSwap={() => setSwapping(false)}
        onUnequip={onUnequip}
        onReplace={onReplace}
      />
    </Popover>
  );
}
