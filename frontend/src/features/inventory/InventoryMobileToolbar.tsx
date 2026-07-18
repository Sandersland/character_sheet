import { useEffect, useRef, type ReactNode } from "react";

import { Search } from "lucide-react";

import Segmented from "@/components/ui/Segmented";
import { FILTERS, type FilterKey } from "@/lib/inventorySections";

interface InventoryMobileToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  filter: FilterKey;
  onFilterChange: (filter: FilterKey) => void;
  view: "bag" | "worn";
  onViewChange: (view: "bag" | "worn") => void;
  /** The slim encumbrance strip, rendered between the toolbar row and chips. */
  metersSlot: ReactNode;
  /** Chips only apply to the Bag view. */
  showChips: boolean;
}

// Mobile Bag/Worn header: search + view toggle share one 44pt row, then the slim
// encumbrance strip, then a single horizontally-scrolling filter-chip line (#1029).
export default function InventoryMobileToolbar({
  search,
  onSearchChange,
  filter,
  onFilterChange,
  view,
  onViewChange,
  metersSlot,
  showChips,
}: InventoryMobileToolbarProps) {
  const activeChip = useRef<HTMLButtonElement | null>(null);

  // Keep the selected chip in view when the filter changes off-screen.
  useEffect(() => {
    activeChip.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [filter]);

  return (
    <div className="flex flex-col gap-2 border-b border-parchment-200 bg-parchment-50 pt-2.5">
      <div className="flex items-center gap-2.5 px-4">
        <div className="relative min-w-0 flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-parchment-500"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search items…"
            aria-label="Search items"
            className="h-11 w-full rounded-control border border-parchment-300 bg-parchment-50 pl-9 pr-2.5 text-base"
          />
        </div>
        <Segmented
          label="Inventory view"
          options={[
            { value: "bag", label: "Bag" },
            { value: "worn", label: "Worn" },
          ]}
          value={view}
          onChange={onViewChange}
          className="w-auto shrink-0"
        />
      </div>

      <div className="px-4">{metersSlot}</div>

      {showChips && (
        <div className="relative">
          <div
            role="group"
            aria-label="Filter items"
            className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-2.5"
          >
            {FILTERS.map((option) => {
              const active = filter === option.key;
              return (
                <button
                  key={option.key}
                  ref={active ? activeChip : undefined}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onFilterChange(option.key)}
                  className={`pressable shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    active
                      ? "bg-arcane-700 text-parchment-50"
                      : "border border-parchment-300 bg-parchment-50 text-parchment-700"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <div className="pointer-events-none absolute inset-y-0 right-0 w-9 bg-gradient-to-l from-parchment-50 to-transparent" />
        </div>
      )}
    </div>
  );
}
