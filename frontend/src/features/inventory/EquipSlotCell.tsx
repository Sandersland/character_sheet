import type { EquipSlot, InventoryItem } from "@/types/character";
import type { VersatileGrip } from "@/lib/paperDoll";
import EmptyEquipSlot from "@/features/inventory/EmptyEquipSlot";
import FilledEquipSlot from "@/features/inventory/FilledEquipSlot";
import LockedEquipSlot from "@/features/inventory/LockedEquipSlot";

interface EquipSlotCellProps {
  slot: EquipSlot;
  label: string;
  item: InventoryItem | null;
  locked: boolean;
  lockReason?: string;
  // The two-handed main-hand weapon that locks this (off-hand) slot, rendered
  // ghosted so the lock reads as "held by that weapon" rather than a dead tile.
  // Travels as a pair with onFocusLockOwner (both set, or neither).
  lockedByItem?: InventoryItem | null;
  // Moves focus to the lock owner's tile (the main-hand Popover trigger).
  onFocusLockOwner?: () => void;
  // The equipped item isn't covered by the character's proficiencies — warn.
  notProficient?: boolean;
  // Versatile weapon's current grip (main hand only); flips as the off-hand fills.
  grip?: VersatileGrip | null;
  // DOM id applied to this tile's trigger so a locked off-hand can focus it.
  triggerId?: string;
  // Bag items that fit this slot (excludes the current occupant).
  candidates: InventoryItem[];
  pending: boolean;
  onEquip: (item: InventoryItem) => void;
  onUnequip: (item: InventoryItem) => void;
  onReplace: (incoming: InventoryItem, outgoing: InventoryItem) => void;
}

// One physical paper-doll position: a thin dispatcher over its three render
// branches (locked, filled, empty — see LockedEquipSlot/FilledEquipSlot/
// EmptyEquipSlot). Both empty and filled open an anchored Popover (consistent
// floating panel, never stretches the tile). RING renders as two of these cells.
export default function EquipSlotCell({
  slot,
  label,
  item,
  locked,
  lockReason,
  lockedByItem,
  onFocusLockOwner,
  notProficient,
  grip,
  triggerId,
  candidates,
  pending,
  onEquip,
  onUnequip,
  onReplace,
}: EquipSlotCellProps) {
  if (locked) {
    return (
      <LockedEquipSlot
        label={label}
        lockReason={lockReason}
        lockedByItem={lockedByItem}
        onFocusLockOwner={onFocusLockOwner}
      />
    );
  }

  if (item) {
    return (
      <FilledEquipSlot
        slot={slot}
        label={label}
        item={item}
        notProficient={notProficient}
        grip={grip}
        triggerId={triggerId}
        candidates={candidates}
        pending={pending}
        onUnequip={onUnequip}
        onReplace={onReplace}
      />
    );
  }

  return (
    <EmptyEquipSlot slot={slot} label={label} candidates={candidates} pending={pending} onEquip={onEquip} />
  );
}
