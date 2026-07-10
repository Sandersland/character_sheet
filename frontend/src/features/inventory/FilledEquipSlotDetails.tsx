import type { InventoryItem } from "@/types/character";
import type { VersatileGrip } from "@/lib/paperDoll";
import { TriangleAlert } from "@/components/ui/icons";
import SlotPickerPanel from "@/features/inventory/SlotPickerPanel";
import { rarityLabel, rarityTone } from "@/lib/rarity";
import Badge from "@/components/ui/Badge";

interface FilledEquipSlotDetailsProps {
  label: string;
  item: InventoryItem;
  // The equipped item isn't covered by the character's proficiencies — warn.
  notProficient?: boolean;
  // Versatile weapon's current grip (main hand only); flips as the off-hand fills.
  grip?: VersatileGrip | null;
  // Bag items that fit this slot (excludes the current occupant).
  candidates: InventoryItem[];
  pending: boolean;
  swapping: boolean;
  onStartSwap: () => void;
  onCancelSwap: () => void;
  onUnequip: (item: InventoryItem) => void;
  onReplace: (incoming: InventoryItem, outgoing: InventoryItem) => void;
}

// The filled tile's Popover body: a read-only item summary, plus either
// unequip/swap controls or (mid-swap) a SlotPickerPanel of bag candidates.
export default function FilledEquipSlotDetails({
  label,
  item,
  notProficient,
  grip,
  candidates,
  pending,
  swapping,
  onStartSwap,
  onCancelSwap,
  onUnequip,
  onReplace,
}: FilledEquipSlotDetailsProps) {
  return (
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
      {item.description && <p className="line-clamp-3 text-xs text-parchment-600">{item.description}</p>}
      {swapping ? (
        <SlotPickerPanel
          slotLabel={`Swap ${label}`}
          candidates={candidates}
          pending={pending}
          action="replace"
          onPick={(incoming) => {
            onCancelSwap();
            onReplace(incoming, item);
          }}
          onClose={onCancelSwap}
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
              onClick={onStartSwap}
              className="font-semibold text-arcane-700 hover:underline disabled:opacity-50"
            >
              Swap
            </button>
          )}
        </div>
      )}
    </div>
  );
}
