import { Search } from "lucide-react";

import { FILTERS, type FilterKey } from "@/lib/inventorySections";

interface InventoryToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  filter: FilterKey;
  onFilterChange: (filter: FilterKey) => void;
}

// The Bag view's search box + category filter chips.
export default function InventoryToolbar({
  search,
  onSearchChange,
  filter,
  onFilterChange,
}: InventoryToolbarProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-parchment-500"
        />
        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search items…"
          aria-label="Search items"
          className="w-full rounded-control border border-parchment-300 bg-parchment-50 pl-8 pr-2.5 py-1 text-sm"
        />
      </div>
      <div role="group" aria-label="Filter items" className="flex flex-wrap gap-1.5">
        {FILTERS.map((option) => (
          <button
            key={option.key}
            type="button"
            aria-pressed={filter === option.key}
            onClick={() => onFilterChange(option.key)}
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
              filter === option.key
                ? "bg-arcane-700 text-parchment-50"
                : "border border-parchment-300 bg-parchment-50 text-parchment-700 hover:bg-parchment-100"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
