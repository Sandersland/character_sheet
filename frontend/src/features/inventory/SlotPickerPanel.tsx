import type { InventoryItem, ItemRarityOption } from "@/types/character";
import { paperDollRarityLabel, rarityTone } from "@/lib/rarity";
import Badge from "@/components/ui/Badge";

interface SlotPickerPanelProps {
  slotLabel: string;
  candidates: InventoryItem[];
  pending: boolean;
  // "equip" for an empty slot; "replace" for swapping into a filled one.
  action: "equip" | "replace";
  /** Served rarity rows (#1437), passed in rather than fetched: this panel is
   *  rendered once per bag item, and a hook here would be one query observer
   *  per row for a table the parent already holds. */
  rarities: ItemRarityOption[];
  onPick: (item: InventoryItem) => void;
  onClose: () => void;
}

// Slot picker rendered inside an anchored Popover (NOT a Modal): lists the bag
// items that fit a paper-doll slot; picking one fires the equip/replace op. The
// Popover provides the card chrome, so this stays bare content.
export default function SlotPickerPanel({
  slotLabel,
  candidates,
  pending,
  action,
  rarities,
  onPick,
  onClose,
}: SlotPickerPanelProps) {
  return (
    <div className="text-left">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-parchment-600">
          {slotLabel}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-xs font-semibold text-garnet-700 hover:underline"
        >
          Close
        </button>
      </div>
      {candidates.length === 0 ? (
        <p className="py-2 text-center text-xs text-parchment-600">Nothing in your bag fits here.</p>
      ) : (
        <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto">
          {candidates.map((item) => {
            // Null until the served rows land (#1437), so a cold cache paints no
            // badge rather than the raw enum key.
            const label = paperDollRarityLabel(item.rarity, rarities);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => onPick(item)}
                  className="flex w-full items-center justify-between gap-2 rounded-control border border-parchment-200 bg-parchment-50 px-2 py-1 text-left text-sm transition-colors hover:bg-parchment-100 disabled:opacity-50"
                >
                  <span className="min-w-0 flex-1 truncate">
                    {action === "replace" ? "Equip & replace: " : ""}
                    {item.name}
                  </span>
                  {item.rarity && label && <Badge tone={rarityTone(item.rarity)}>{label}</Badge>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
