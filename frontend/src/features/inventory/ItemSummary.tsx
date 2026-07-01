import type { InventoryItem } from "@/types/character";

interface ItemSummaryProps {
  item: InventoryItem;
  details: string[];
  selectMode: boolean;
  selected: boolean;
  onToggleSelect?: () => void;
}

// An item's leading block: optional sell checkbox, name (must stay the first <p>), and the dotted detail line.
export default function ItemSummary({
  item,
  details,
  selectMode,
  selected,
  onToggleSelect,
}: ItemSummaryProps) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      {selectMode && (
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          aria-label={`Select ${item.name}`}
          className="mt-1"
        />
      )}
      <div className="min-w-0">
        <p className="text-sm font-medium text-parchment-900">{item.name}</p>
        <p className="mt-0.5 text-xs text-parchment-600">{details.join(" · ")}</p>
      </div>
    </div>
  );
}
