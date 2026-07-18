import { ChevronRight } from "lucide-react";

import { itemDetailParts } from "@/lib/itemDetails";
import type { InventoryItem } from "@/types/character";

interface InventoryRowCompactProps {
  item: InventoryItem;
  onOpen: () => void;
}

// Dense mobile item row (#1029): a full-bleed 56pt tap target that opens the
// item detail sheet. Name never truncates mid-word; the meta line ellipsises.
export default function InventoryRowCompact({ item, onOpen }: InventoryRowCompactProps) {
  const meta = itemDetailParts(item).join(" · ");
  return (
    <li className="divider-hairline">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${item.name} details`}
        className="pressable flex min-h-[56px] w-full items-center gap-3 px-4 py-2 text-left"
      >
        <span className="min-w-0 flex-1">
          <p className="truncate text-base font-medium text-parchment-900">{item.name}</p>
          {meta && <p className="truncate text-[13px] text-parchment-600">{meta}</p>}
        </span>
        {item.equipped && (
          <span className="shrink-0 rounded-full bg-vitality-50 px-2 py-0.5 text-[0.625rem] font-semibold text-vitality-800">
            Equipped
          </span>
        )}
        <ChevronRight aria-hidden="true" className="size-[18px] shrink-0 text-parchment-400" />
      </button>
    </li>
  );
}
