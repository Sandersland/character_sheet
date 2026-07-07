import { useState } from "react";

import type { EquipSlot, InventoryItem } from "@/types/character";
import { EQUIP_SLOT_ICONS, Lock } from "@/components/ui/icons";
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
  candidates,
  pending,
  onEquip,
  onUnequip,
  onReplace,
}: EquipSlotCellProps) {
  const [swapping, setSwapping] = useState(false);
  const Icon = EQUIP_SLOT_ICONS[slot];

  if (locked) {
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
        label={`${label}: ${item.name}`}
        className="w-full"
        triggerClassName="w-full rounded-card"
        // Reset swap mode on dismiss so the next open lands on the summary, not the picker.
        onClose={() => setSwapping(false)}
        trigger={
          <span
            className={`${TILE} border-solid bg-parchment-50 hover:bg-parchment-100 ${
              item.rarity && item.rarity !== "COMMON"
                ? "border-arcane-300"
                : "border-parchment-300"
            }`}
          >
            <Icon aria-hidden="true" className="size-6 text-garnet-700" />
            <span className="line-clamp-2 text-[0.625rem] font-semibold leading-tight text-parchment-800">
              {item.name}
            </span>
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
