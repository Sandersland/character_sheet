import InventoryMeters from "@/features/inventory/InventoryMeters";
import InventoryMobileToolbar from "@/features/inventory/InventoryMobileToolbar";
import type { FilterKey } from "@/lib/inventorySections";

interface MetersProps {
  totalWeight: number;
  capacity: number;
  overCapacity: boolean;
  hasAttunable: boolean;
  attunedCount: number;
  atCap: boolean;
}

interface InventoryMobileHeaderProps {
  search: string;
  onSearchChange: (value: string) => void;
  filter: FilterKey;
  onFilterChange: (filter: FilterKey) => void;
  view: "bag" | "worn";
  onViewChange: (view: "bag" | "worn") => void;
  metersProps: MetersProps;
  hasItems: boolean;
  configuringSell: boolean;
}

// The mobile inventory header (#1029): the one-row toolbar + slim encumbrance
// when a pack is present, or just the slim strip for a coins-only carry.
export default function InventoryMobileHeader({
  search,
  onSearchChange,
  filter,
  onFilterChange,
  view,
  onViewChange,
  metersProps,
  hasItems,
  configuringSell,
}: InventoryMobileHeaderProps) {
  if (hasItems && !configuringSell) {
    return (
      <InventoryMobileToolbar
        search={search}
        onSearchChange={onSearchChange}
        filter={filter}
        onFilterChange={onFilterChange}
        view={view}
        onViewChange={onViewChange}
        metersSlot={<InventoryMeters slim {...metersProps} />}
        showChips={view === "bag"}
      />
    );
  }
  if (!hasItems && metersProps.totalWeight > 0) {
    return (
      <div className="border-b border-parchment-200 px-4 py-2.5">
        <InventoryMeters slim {...metersProps} />
      </div>
    );
  }
  return null;
}
