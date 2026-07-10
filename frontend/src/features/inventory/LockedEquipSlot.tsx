import type { InventoryItem } from "@/types/character";
import { EQUIP_SLOT_ICONS, Lock, Link2 } from "@/components/ui/icons";
import { TILE } from "@/features/inventory/equipSlotTile";

interface LockedEquipSlotProps {
  label: string;
  lockReason?: string;
  // The two-handed main-hand weapon that locks this (off-hand) slot, rendered
  // ghosted so the lock reads as "held by that weapon" rather than a dead tile.
  // Travels as a pair with onFocusLockOwner (both set, or neither).
  lockedByItem?: InventoryItem | null;
  // Moves focus to the lock owner's tile (the main-hand Popover trigger).
  onFocusLockOwner?: () => void;
}

// A locked slot either ghosts its two-handed lock owner (clicking focuses that
// tile) or, absent an owner, renders a plain disabled tile.
export default function LockedEquipSlot({
  label,
  lockReason,
  lockedByItem,
  onFocusLockOwner,
}: LockedEquipSlotProps) {
  if (lockedByItem) {
    const OwnerIcon = EQUIP_SLOT_ICONS.MAIN_HAND;
    return (
      <button
        type="button"
        onClick={onFocusLockOwner}
        className={`${TILE} cursor-pointer border-dashed border-parchment-300 bg-parchment-100 opacity-60 hover:opacity-90`}
        aria-label={`${label} held by two-handed ${lockedByItem.name} — focus it`}
        title={lockReason}
      >
        <OwnerIcon aria-hidden="true" className="size-6 text-parchment-500" />
        <span className="line-clamp-1 text-[0.625rem] font-medium text-parchment-500">
          {lockedByItem.name}
        </span>
        <span className="inline-flex items-center gap-0.5 text-[0.5rem] font-semibold uppercase tracking-wide text-parchment-400">
          <Link2 aria-hidden="true" className="size-2.5" />
          Two-handed
        </span>
      </button>
    );
  }

  return (
    <div
      className={`${TILE} cursor-not-allowed border-dashed border-parchment-300 bg-parchment-100 opacity-70`}
      aria-label={`${label} slot locked`}
      title={lockReason}
    >
      <Lock aria-hidden="true" className="size-5 text-parchment-500" />
      <span className="text-[0.625rem] font-medium text-parchment-500">{label}</span>
    </div>
  );
}
