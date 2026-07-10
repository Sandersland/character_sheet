import { useState } from "react";

import type { EquipSlot, InventoryItem } from "@/types/character";
import type { VersatileGrip } from "@/lib/paperDoll";
import { EQUIP_SLOT_ICONS, Lock, Link2, TriangleAlert } from "@/components/ui/icons";
import Popover from "@/components/ui/Popover";
import SlotPickerPanel from "@/features/inventory/SlotPickerPanel";
import { rarityLabel, rarityTone } from "@/lib/rarity";
import Badge from "@/components/ui/Badge";

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

const TILE =
  "flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-card border p-1 text-center transition-colors";

// One physical paper-doll position. Both empty and filled open an anchored
// Popover (consistent floating panel, never stretches the tile): empty → a
// SlotPickerPanel; filled → a read-only summary with unequip/swap. Two-handed-
// locked → a disabled tile. RING renders as two of these cells.
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
  const [swapping, setSwapping] = useState(false);
  const Icon = EQUIP_SLOT_ICONS[slot];

  if (locked) {
    // Two-handed main-hand weapon locking this off-hand: ghost the owning weapon
    // with a link glyph, and clicking jumps focus to its (main-hand) tile.
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

  if (item) {
    return (
      <Popover
        label={`${label}: ${item.name}${notProficient ? " (not proficient)" : ""}`}
        className="w-full"
        triggerClassName="w-full rounded-card"
        id={triggerId}
        // Reset swap mode on dismiss so the next open lands on the summary, not the picker.
        onClose={() => setSwapping(false)}
        trigger={
          <span
            className={`${TILE} relative border-solid bg-parchment-50 hover:bg-parchment-100 ${
              notProficient
                ? "border-gold-600"
                : item.rarity && item.rarity !== "COMMON"
                  ? "border-arcane-300"
                  : "border-parchment-300"
            }`}
          >
            {notProficient && (
              <>
                <TriangleAlert
                  aria-hidden="true"
                  className="absolute right-1 top-1 size-3.5 text-gold-600"
                />
                <span className="sr-only">Not proficient</span>
              </>
            )}
            <Icon aria-hidden="true" className="size-6 text-garnet-700" />
            <span className="line-clamp-2 text-[0.625rem] font-semibold leading-tight text-parchment-800">
              {item.name}
            </span>
            {grip && <Badge tone="neutral">{grip.short}</Badge>}
          </span>
        }
      >
        <div className="flex w-56 flex-col gap-2 p-3">
          <div className="flex items-start justify-between gap-2">
            <span className="text-sm font-semibold text-parchment-900">{item.name}</span>
            {item.rarity && item.rarity !== "COMMON" && (
              <Badge tone={rarityTone(item.rarity)}>{rarityLabel(item.rarity)}</Badge>
            )}
          </div>
          <p className="text-xs uppercase tracking-wide text-parchment-500">{label}</p>
          {grip && (
            <div>
              <Badge tone="neutral">{grip.full}</Badge>
            </div>
          )}
          {notProficient && (
            <p className="inline-flex items-center gap-1 text-xs font-medium text-gold-800">
              <TriangleAlert aria-hidden="true" className="size-3.5 shrink-0" />
              Not proficient with this item
            </p>
          )}
          {item.description && (
            <p className="line-clamp-3 text-xs text-parchment-600">{item.description}</p>
          )}
          {swapping ? (
            <SlotPickerPanel
              slotLabel={`Swap ${label}`}
              candidates={candidates}
              pending={pending}
              action="replace"
              onPick={(incoming) => {
                setSwapping(false);
                onReplace(incoming, item);
              }}
              onClose={() => setSwapping(false)}
            />
          ) : (
            <div className="flex items-center gap-3 text-xs">
              <button
                type="button"
                disabled={pending}
                onClick={() => onUnequip(item)}
                className="font-semibold text-garnet-700 hover:underline disabled:opacity-50"
              >
                Unequip
              </button>
              {candidates.length > 0 && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setSwapping(true)}
                  className="font-semibold text-arcane-700 hover:underline disabled:opacity-50"
                >
                  Swap
                </button>
              )}
            </div>
          )}
        </div>
      </Popover>
    );
  }

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
