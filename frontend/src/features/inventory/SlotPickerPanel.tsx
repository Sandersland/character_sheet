import type { InventoryItem, ItemRarityOption } from "@/types/character";
import { paperDollRarityLabel, rarityTone } from "@/lib/rarity";
import Badge from "@/components/ui/Badge";

interface SlotPickerPanelProps {
  slotLabel: string;
  candidates: InventoryItem[];
  pending: boolean;
  action: "equip" | "replace";
  // Passed in rather than fetched: rendered once per bag item, a hook here would be one query observer per row (#1437).
  rarities: ItemRarityOption[];
  onPick: (item: InventoryItem) => void;
  onClose: () => void;
}

// Rendered inside an anchored Popover, which supplies the card chrome — stays bare content.
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
